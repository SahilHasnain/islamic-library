import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Env loading (zero-dependency .env.local parser, mirroring the worker).
// Search order: admin-console/.env.local -> root .env.local -> worker-service/.env.local.
// Existing process.env values always win.
// ---------------------------------------------------------------------------

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(repoRoot, "admin-console", ".env.local"));
loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, "worker-service", ".env.local"));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeEndpoint(rawEndpoint) {
  const trimmed = String(rawEndpoint || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("APPWRITE_ENDPOINT is empty.");
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

const endpoint = normalizeEndpoint(requireEnv("APPWRITE_ENDPOINT"));
const projectId = requireEnv("APPWRITE_PROJECT_ID");
const apiKey = requireEnv("APPWRITE_API_KEY");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schemaPath = path.join(__dirname, "appwrite-schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const { database, collections = [], buckets = [] } = schema;

// ---------------------------------------------------------------------------
// Appwrite REST helpers
// ---------------------------------------------------------------------------

async function appwriteRequest(method, pathname, body) {
  const headers = {
    "Content-Type": "application/json",
    "X-Appwrite-Project": projectId,
    "X-Appwrite-Key": apiKey,
  };

  const response = await fetch(`${endpoint}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (response.status === 409) {
    return { conflict: true, status: response.status, data };
  }

  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed (${response.status}): ${text}`);
  }

  return { conflict: false, status: response.status, data };
}

function log(kind, id, state) {
  console.log(`${kind}: ${id} -> ${state}`);
}

const attributeCache = new Map();

async function listAttributes(collectionId) {
  if (attributeCache.has(collectionId)) {
    return attributeCache.get(collectionId);
  }

  const result = await appwriteRequest(
    "GET",
    `/databases/${database.id}/collections/${collectionId}/attributes`,
  );
  const attributes = result.data.attributes || [];
  attributeCache.set(collectionId, attributes);
  return attributes;
}

function hasAttribute(attributes, key) {
  return attributes.some((attribute) => attribute.key === key);
}

// ---------------------------------------------------------------------------
// Ensure functions
// ---------------------------------------------------------------------------

async function ensureDatabase() {
  const result = await appwriteRequest("POST", "/databases", {
    databaseId: database.id,
    name: database.name,
    enabled: true,
  });
  log("database", database.id, result.conflict ? "exists" : "created");
}

async function ensureCollection(collection) {
  const result = await appwriteRequest(
    "POST",
    `/databases/${database.id}/collections`,
    {
      collectionId: collection.id,
      name: collection.name,
      permissions: collection.permissions || [],
      documentSecurity: Boolean(collection.documentSecurity),
      enabled: true,
    },
  );
  log("collection", collection.id, result.conflict ? "exists" : "created");
}

function buildAttributePayload(attribute) {
  const payload = {
    key: attribute.key,
    required: Boolean(attribute.required),
  };

  switch (attribute.type) {
    case "string":
      payload.size = attribute.size || 255;
      payload.array = Boolean(attribute.array);
      break;
    case "integer":
      payload.min = attribute.min ?? 0;
      payload.max = attribute.max ?? 2147483647;
      payload.array = Boolean(attribute.array);
      break;
    case "enum":
      payload.elements = attribute.elements || [];
      break;
    case "datetime":
      payload.array = Boolean(attribute.array);
      break;
    default:
      throw new Error(`Unsupported attribute type: ${attribute.type}`);
  }

  if (attribute.default !== undefined) {
    payload.default = attribute.default;
  }

  return payload;
}

async function ensureAttribute(collectionId, attribute) {
  const existing = await listAttributes(collectionId);
  if (hasAttribute(existing, attribute.key)) {
    log(`attribute ${collectionId}.${attribute.key}`, attribute.type, "exists");
    return;
  }

  const result = await appwriteRequest(
    "POST",
    `/databases/${database.id}/collections/${collectionId}/attributes/${attribute.type}`,
    buildAttributePayload(attribute),
  );
  attributeCache.delete(collectionId);
  log(`attribute ${collectionId}.${attribute.key}`, attribute.type, result.conflict ? "exists" : "created");
}

async function ensureBucket(bucket) {
  const result = await appwriteRequest("POST", "/storage/buckets", {
    bucketId: bucket.id,
    name: bucket.name,
    permissions: bucket.permissions || [],
    fileSecurity: Boolean(bucket.fileSecurity),
    enabled: true,
    maximumFileSize: bucket.maximumFileSize ?? 30000000,
    allowedFileExtensions: bucket.allowedFileExtensions || [],
    compression: bucket.compression || "none",
    encryption: Boolean(bucket.encryption),
    antivirus: Boolean(bucket.antivirus),
  });

  if (!result.conflict) {
    log("bucket", bucket.id, "created");
    return;
  }

  // Bucket already exists -> converge settings so public-read permissions etc. are applied.
  await appwriteRequest("PUT", `/storage/buckets/${bucket.id}`, {
    name: bucket.name,
    permissions: bucket.permissions || [],
    fileSecurity: Boolean(bucket.fileSecurity),
    enabled: true,
    maximumFileSize: bucket.maximumFileSize ?? 30000000,
    allowedFileExtensions: bucket.allowedFileExtensions || [],
    compression: bucket.compression || "none",
    encryption: Boolean(bucket.encryption),
    antivirus: Boolean(bucket.antivirus),
  });
  log("bucket", bucket.id, "exists (settings converged)");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`Provisioning Appwrite schema against ${endpoint}`);
  console.log(`Project: ${projectId}`);
  if (isDryRun) {
    console.log("DRY RUN - no changes will be written.\n");
  }

  const steps = [];

  if (!isDryRun) {
    await ensureDatabase();
  } else {
    steps.push(`database ${database.id}`);
  }

  for (const collection of collections) {
    if (!isDryRun) {
      await ensureCollection(collection);
      for (const attribute of collection.attributes || []) {
        await ensureAttribute(collection.id, attribute);
      }
    } else {
      steps.push(`collection ${collection.id} (+${(collection.attributes || []).length} attributes)`);
    }
  }

  for (const bucket of buckets) {
    if (!isDryRun) {
      await ensureBucket(bucket);
    } else {
      steps.push(`bucket ${bucket.id}`);
    }
  }

  console.log("\nProvisioning complete.");
  if (isDryRun) {
    console.log("Would provision:");
    for (const step of steps) {
      console.log(`  - ${step}`);
    }
  } else {
    console.log("Verify in the Appwrite Console, then run the migration steps in plans/appwrite-delivery-migration.md.");
  }
}

main().catch((error) => {
  console.error("\nProvisioning failed:", error.message || error);
  process.exitCode = 1;
});
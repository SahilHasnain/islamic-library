import fs from "node:fs";
import path from "node:path";

function loadEnvFile(envPath) {
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

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const repoRoot = path.resolve(process.cwd());
const envPath = path.join(repoRoot, ".env.local");
if (fs.existsSync(envPath)) {
  loadEnvFile(envPath);
}

const endpoint = requireEnv("APPWRITE_ENDPOINT");
const projectId = requireEnv("APPWRITE_PROJECT_ID");
const apiKey = requireEnv("APPWRITE_API_KEY");

const DATABASE_ID = "library_ingestion";
const JOBS_COLLECTION_ID = "ingestion_jobs";

async function appwriteRequest(method, requestPath, body) {
  const response = await fetch(`${endpoint}${requestPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 409) {
    return { ok: true, existed: true, data: await safeJson(response) };
  }

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, existed: false, error: `${method} ${requestPath} failed (${response.status}): ${text}` };
  }

  return { ok: true, existed: false, data: await safeJson(response) };
}

async function safeJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function ensureStringAttribute(key, size) {
  const result = await appwriteRequest(
    "POST",
    `/databases/${DATABASE_ID}/collections/${JOBS_COLLECTION_ID}/attributes/string`,
    {
      key,
      size,
      required: false,
      array: false,
    },
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  console.log(`attribute ${JOBS_COLLECTION_ID}.${key}: string -> ${result.existed ? "exists" : "created"}`);
}

async function ensureIntegerAttribute(key, min, max, defaultValue) {
  const body = {
    key,
    required: false,
    min,
    max,
    array: false,
    default: defaultValue,
  };
  const result = await appwriteRequest(
    "POST",
    `/databases/${DATABASE_ID}/collections/${JOBS_COLLECTION_ID}/attributes/integer`,
    body,
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  console.log(`attribute ${JOBS_COLLECTION_ID}.${key}: integer -> ${result.existed ? "exists" : "created"}`);
}

async function ensureDatetimeAttribute(key) {
  const result = await appwriteRequest(
    "POST",
    `/databases/${DATABASE_ID}/collections/${JOBS_COLLECTION_ID}/attributes/datetime`,
    {
      key,
      required: false,
      array: false,
    },
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  console.log(`attribute ${JOBS_COLLECTION_ID}.${key}: datetime -> ${result.existed ? "exists" : "created"}`);
}

async function main() {
  console.log("Adding ingestion_jobs attributes...");
  await ensureStringAttribute("workerDispatchToken", 128);
  await ensureStringAttribute("pushStatus", 24);
  await ensureStringAttribute("pushError", 5000);
  await ensureIntegerAttribute("pushAttempts", 0, 100000, 0);
  await ensureDatetimeAttribute("lastPushAttempt");
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

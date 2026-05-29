import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { APPWRITE_IDS, BOOK_STATUS_VALUES, JOB_STATUS_VALUES } from "./appwrite-config.mjs";

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

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const envPath = path.join(repoRoot, ".env.local");

if (fs.existsSync(envPath)) {
  loadEnvFile(envPath);
}

const endpoint = requireEnv("APPWRITE_ENDPOINT");
const projectId = requireEnv("APPWRITE_PROJECT_ID");
const apiKey = requireEnv("APPWRITE_API_KEY");

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
    return { conflict: true, data: await safeJson(response) };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${requestPath} failed (${response.status}): ${text}`);
  }

  return { conflict: false, data: await safeJson(response) };
}

async function safeJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function ensureDatabase() {
  const result = await appwriteRequest("POST", "/databases", {
    databaseId: APPWRITE_IDS.databaseId,
    name: "Library Ingestion",
    enabled: true,
  });
  logResult("database", APPWRITE_IDS.databaseId, result.conflict);
}

async function ensureCollection(collectionId, name, permissions = []) {
  const result = await appwriteRequest(
    "POST",
    `/databases/${APPWRITE_IDS.databaseId}/collections`,
    {
      collectionId,
      name,
      permissions,
      documentSecurity: false,
      enabled: true,
    },
  );
  logResult("collection", collectionId, result.conflict);
}

async function ensureStringAttribute(collectionId, key, size, required, array = false, defaultValue) {
  const payload = {
    key,
    size,
    required,
    array,
  };

  if (!(required && defaultValue !== undefined)) {
    payload.default = defaultValue;
  }

  const result = await appwriteRequest(
    "POST",
    `/databases/${APPWRITE_IDS.databaseId}/collections/${collectionId}/attributes/string`,
    payload,
  );
  logResult(`attribute ${collectionId}.${key}`, "string", result.conflict);
}

async function ensureIntegerAttribute(collectionId, key, required, min, max, defaultValue) {
  const payload = {
    key,
    required,
    min,
    max,
    array: false,
  };

  if (!(required && defaultValue !== undefined)) {
    payload.default = defaultValue;
  }

  const result = await appwriteRequest(
    "POST",
    `/databases/${APPWRITE_IDS.databaseId}/collections/${collectionId}/attributes/integer`,
    payload,
  );
  logResult(`attribute ${collectionId}.${key}`, "integer", result.conflict);
}

async function ensureDatetimeAttribute(collectionId, key, required, defaultValue) {
  const payload = {
    key,
    required,
    array: false,
  };

  if (!(required && defaultValue !== undefined)) {
    payload.default = defaultValue;
  }

  const result = await appwriteRequest(
    "POST",
    `/databases/${APPWRITE_IDS.databaseId}/collections/${collectionId}/attributes/datetime`,
    payload,
  );
  logResult(`attribute ${collectionId}.${key}`, "datetime", result.conflict);
}

async function ensureEnumAttribute(collectionId, key, elements, required, defaultValue) {
  const payload = {
    key,
    elements,
    required,
    array: false,
  };

  if (!(required && defaultValue !== undefined)) {
    payload.default = defaultValue;
  }

  const result = await appwriteRequest(
    "POST",
    `/databases/${APPWRITE_IDS.databaseId}/collections/${collectionId}/attributes/enum`,
    payload,
  );
  logResult(`attribute ${collectionId}.${key}`, "enum", result.conflict);
}

async function ensureBucket(bucketId, name, maximumFileSize = 30_000_000) {
  const result = await appwriteRequest("POST", "/storage/buckets", {
    bucketId,
    name,
    permissions: [],
    fileSecurity: false,
    enabled: true,
    maximumFileSize,
    allowedFileExtensions: [],
    compression: "none",
    encryption: true,
    antivirus: true,
  });
  logResult("bucket", bucketId, result.conflict);
}

function logResult(kind, id, existed) {
  const state = existed ? "exists" : "created";
  console.log(`${kind}: ${id} -> ${state}`);
}

async function setupBooksCollection() {
  await ensureCollection(APPWRITE_IDS.booksCollectionId, "Books");
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "slug", 128, true);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "title", 255, true);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "subtitle", 255, false);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "author", 255, false);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "description", 5000, false);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "category", 120, false);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "languageId", 64, true);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "volumeId", 64, true);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "sourceFileId", 128, true);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "coverFileId", 128, false);
  await ensureEnumAttribute(
    APPWRITE_IDS.booksCollectionId,
    "status",
    BOOK_STATUS_VALUES,
    true,
    "draft",
  );
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "publishedVersion", 64, false);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "manifestUrl", 2048, false);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "metadataUrl", 2048, false);
  await ensureIntegerAttribute(APPWRITE_IDS.booksCollectionId, "totalPages", false, 1, 100000, undefined);
  await ensureStringAttribute(APPWRITE_IDS.booksCollectionId, "createdBy", 128, true);
  await ensureDatetimeAttribute(APPWRITE_IDS.booksCollectionId, "createdAt", true, undefined);
  await ensureDatetimeAttribute(APPWRITE_IDS.booksCollectionId, "updatedAt", true, undefined);
}

async function setupJobsCollection() {
  await ensureCollection(APPWRITE_IDS.jobsCollectionId, "Ingestion Jobs");
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "jobId", 128, true);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "bookSlug", 128, true);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "sourceFileId", 128, true);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "languageId", 64, true);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "volumeId", 64, true);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "workerDispatchToken", 128, false);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "pushStatus", 24, false);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "pushError", 5000, false);
  await ensureIntegerAttribute(APPWRITE_IDS.jobsCollectionId, "pushAttempts", false, 0, 100000, 0);
  await ensureDatetimeAttribute(APPWRITE_IDS.jobsCollectionId, "lastPushAttempt", false, undefined);
  await ensureEnumAttribute(
    APPWRITE_IDS.jobsCollectionId,
    "status",
    JOB_STATUS_VALUES,
    true,
    "draft",
  );
  await ensureIntegerAttribute(APPWRITE_IDS.jobsCollectionId, "attempt", true, 0, 1000, 0);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "workerId", 128, false);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "workerVersion", 64, false);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "errorCode", 128, false);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "errorMessage", 5000, false);
  await ensureStringAttribute(APPWRITE_IDS.jobsCollectionId, "outputVersion", 64, false);
  await ensureIntegerAttribute(APPWRITE_IDS.jobsCollectionId, "pageCount", false, 1, 100000, undefined);
  await ensureDatetimeAttribute(APPWRITE_IDS.jobsCollectionId, "startedAt", false, undefined);
  await ensureDatetimeAttribute(APPWRITE_IDS.jobsCollectionId, "finishedAt", false, undefined);
  await ensureDatetimeAttribute(APPWRITE_IDS.jobsCollectionId, "createdAt", true, undefined);
  await ensureDatetimeAttribute(APPWRITE_IDS.jobsCollectionId, "updatedAt", true, undefined);
}

async function setupPublishEventsCollection() {
  await ensureCollection(APPWRITE_IDS.publishEventsCollectionId, "Publish Events");
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "publishId", 128, true);
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "bookSlug", 128, true);
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "version", 64, true);
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "gitCommitSha", 128, false);
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "catalogPath", 2048, true);
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "metadataPath", 2048, true);
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "manifestPath", 2048, true);
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "assetBasePath", 2048, true);
  await ensureDatetimeAttribute(APPWRITE_IDS.publishEventsCollectionId, "publishedAt", true, undefined);
  await ensureStringAttribute(APPWRITE_IDS.publishEventsCollectionId, "triggeredBy", 128, true);
}

async function main() {
  console.log("Bootstrapping Appwrite ingestion resources...");
  await ensureDatabase();
  await setupBooksCollection();
  await setupJobsCollection();
  await setupPublishEventsCollection();
  await ensureBucket(APPWRITE_IDS.sourcePdfsBucketId, "Source PDFs", 100_000_000);
  await ensureBucket(APPWRITE_IDS.generatedPreviewsBucketId, "Generated Previews", 100_000_000);
  await ensureBucket(APPWRITE_IDS.workerLogsBucketId, "Worker Logs", 20_000_000);
  console.log("Bootstrap complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

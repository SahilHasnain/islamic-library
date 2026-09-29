import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envPath)) {
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

const requiredNames = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID",
  "APPWRITE_JOBS_COLLECTION_ID",
  "APPWRITE_BOOKS_COLLECTION_ID",
  "APPWRITE_SOURCE_BUCKET_ID",
  "APPWRITE_PUBLIC_BUCKET_ID",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const appwriteConfig = Object.fromEntries(
  requiredNames.map((name) => [name, requireEnv(name)]),
);

// Appwrite Cloud sits behind Fastly, which resets connections when it hits its
// concurrency ceiling (surfaces as 499 "Client Closed Request" or a bare
// "fetch failed"). Every call here is safe to replay: writes use deterministic IDs and
// uploads are delete-then-create overwrites. So retry the transient cases only, and never
// let a request fall through to undici's 300s headers default, which aborts healthy
// multi-minute uploads and looks identical to a network failure.
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 600000;
const RETRY_ATTEMPTS = Number(process.env.APPWRITE_RETRY_ATTEMPTS || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.APPWRITE_RETRY_BASE_DELAY_MS || 500);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status === 499 || status >= 500;
}

async function appwriteRequest(url, options = {}, { timeoutMs, label, beforeRetry } = {}) {
  const attempts = RETRY_ATTEMPTS;
  const effectiveTimeoutMs = Number(
    timeoutMs || process.env.APPWRITE_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS,
  );
  const requestLabel = label || "Appwrite request";
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // A replayed upload can collide with the file the previous attempt already stored
    // (409), and that also happens when a connection drops after Appwrite commits. Clear
    // the target first so every retry is a clean create, matching the overwrite contract.
    if (attempt > 1 && beforeRetry) {
      try {
        await beforeRetry();
      } catch (cleanupError) {
        // Best effort: a 404 here just means there is nothing to clear.
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });

      // Hand definitive answers (including non-retryable 4xx) straight back to the
      // caller so its own error message stays intact.
      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      lastError = new Error(
        `${requestLabel} failed (${response.status}): ${await response.text()}`,
      );
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < attempts) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${requestLabel} failed.`);
}

function authHeaders(extra = {}) {
  return {
    "X-Appwrite-Project": appwriteConfig.APPWRITE_PROJECT_ID,
    "X-Appwrite-Key": appwriteConfig.APPWRITE_API_KEY,
    ...extra,
  };
}

async function appwriteJson(method, path, body) {
  const response = await appwriteRequest(
    `${appwriteConfig.APPWRITE_ENDPOINT}${path}`,
    {
      method,
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: body ? JSON.stringify(body) : undefined,
    },
    { label: `${method} ${path}` },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function appwriteListDocuments(collectionId, queries) {
  const url = new URL(
    `${appwriteConfig.APPWRITE_ENDPOINT}/databases/${appwriteConfig.APPWRITE_DATABASE_ID}/collections/${collectionId}/documents`,
  );

  for (const query of queries || []) {
    url.searchParams.append("queries[]", query);
  }

  const response = await appwriteRequest(
    url,
    { headers: authHeaders() },
    { label: `GET ${url.pathname}` },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET ${url.pathname} failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function downloadSourcePdf(sourceFileId) {
  const response = await appwriteRequest(
    `${appwriteConfig.APPWRITE_ENDPOINT}/storage/buckets/${appwriteConfig.APPWRITE_SOURCE_BUCKET_ID}/files/${sourceFileId}/download`,
    { headers: authHeaders() },
    { label: `Download source ${sourceFileId}` },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Download failed (${response.status}): ${text}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function findJobDocument(jobId) {
  const result = await appwriteListDocuments(appwriteConfig.APPWRITE_JOBS_COLLECTION_ID, []);

  return result.documents?.find((document) => document.jobId === jobId);
}

export async function findBookBySlug(bookSlug) {
  const result = await appwriteListDocuments(appwriteConfig.APPWRITE_BOOKS_COLLECTION_ID, []);

  return result.documents?.find((document) => document.slug === bookSlug);
}

export async function updateJobDocument(documentId, data) {
  return appwriteJson(
    "PATCH",
    `/databases/${appwriteConfig.APPWRITE_DATABASE_ID}/collections/${appwriteConfig.APPWRITE_JOBS_COLLECTION_ID}/documents/${documentId}`,
    { data },
  );
}

export async function updateBookDocument(documentId, data) {
  return appwriteJson(
    "PATCH",
    `/databases/${appwriteConfig.APPWRITE_DATABASE_ID}/collections/${appwriteConfig.APPWRITE_BOOKS_COLLECTION_ID}/documents/${documentId}`,
    { data },
  );
}

export async function createPublishEvent(data) {
  return appwriteJson(
    "POST",
    `/databases/${appwriteConfig.APPWRITE_DATABASE_ID}/collections/publish_events/documents`,
    {
      documentId: "unique()",
      data,
    },
  );
}

export function publicFileViewUrl(bucketId, fileId) {
  return `${appwriteConfig.APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${appwriteConfig.APPWRITE_PROJECT_ID}`;
}

export async function uploadBucketFile({
  bucketId,
  fileId,
  fileBuffer,
  fileName,
  contentType,
}) {
  const boundary = `----islamicLibraryBoundary${Date.now().toString(36)}`;
  const encoder = new TextEncoder();
  const chunks = [];

  function pushText(value) {
    chunks.push(encoder.encode(value));
  }

  function pushBuffer(buffer) {
    chunks.push(new Uint8Array(buffer));
  }

  pushText(`--${boundary}\r\n`);
  pushText(`Content-Disposition: form-data; name="fileId"\r\n\r\n`);
  pushText(`${fileId}\r\n`);
  pushText(`--${boundary}\r\n`);
  pushText(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
  pushText(`Content-Type: ${contentType}\r\n\r\n`);
  pushBuffer(fileBuffer);
  pushText(`\r\n--${boundary}--\r\n`);

  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

  // Uploads carry the file bytes, so they get their own (much longer) budget.
  const response = await appwriteRequest(
    `${appwriteConfig.APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files`,
    {
      method: "POST",
      headers: authHeaders({
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      }),
      body,
    },
    {
      timeoutMs: Number(process.env.APPWRITE_UPLOAD_TIMEOUT_MS || DEFAULT_UPLOAD_TIMEOUT_MS),
      label: `Upload ${fileId}`,
      beforeRetry: () => deleteBucketFile(bucketId, fileId),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload ${fileId} failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function deleteBucketFile(bucketId, fileId) {
  const response = await appwriteRequest(
    `${appwriteConfig.APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}`,
    { method: "DELETE", headers: authHeaders() },
    { label: `Delete ${fileId}` },
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Delete ${fileId} failed (${response.status}): ${text}`);
  }

  return true;
}

export async function downloadBucketFileText(bucketId, fileId) {
  const response = await appwriteRequest(
    `${appwriteConfig.APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/download`,
    { headers: authHeaders() },
    { label: `Download ${fileId}` },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Download ${fileId} failed (${response.status}): ${text}`);
  }

  return response.text();
}

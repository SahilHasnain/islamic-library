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

async function appwriteJson(method, path, body) {
  const response = await fetch(`${appwriteConfig.APPWRITE_ENDPOINT}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": appwriteConfig.APPWRITE_PROJECT_ID,
      "X-Appwrite-Key": appwriteConfig.APPWRITE_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

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

  for (const query of queries) {
    url.searchParams.append("queries[]", query);
  }

  const response = await fetch(url, {
    headers: {
      "X-Appwrite-Project": appwriteConfig.APPWRITE_PROJECT_ID,
      "X-Appwrite-Key": appwriteConfig.APPWRITE_API_KEY,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET ${url.pathname} failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function downloadSourcePdf(sourceFileId) {
  const response = await fetch(
    `${appwriteConfig.APPWRITE_ENDPOINT}/storage/buckets/${appwriteConfig.APPWRITE_SOURCE_BUCKET_ID}/files/${sourceFileId}/download`,
    {
      headers: {
        "X-Appwrite-Project": appwriteConfig.APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": appwriteConfig.APPWRITE_API_KEY,
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Download failed (${response.status}): ${text}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function findJobDocument(jobId) {
  const result = await appwriteListDocuments(appwriteConfig.APPWRITE_JOBS_COLLECTION_ID, [
    `equal("jobId","${jobId}")`,
    "limit(1)",
  ]);

  return result.documents?.[0];
}

export async function findBookBySlug(bookSlug) {
  const result = await appwriteListDocuments(appwriteConfig.APPWRITE_BOOKS_COLLECTION_ID, [
    `equal("slug","${bookSlug}")`,
    "limit(1)",
  ]);

  return result.documents?.[0];
}

export async function updateJobDocument(documentId, data) {
  return appwriteJson(
    "PATCH",
    `/databases/${appwriteConfig.APPWRITE_DATABASE_ID}/collections/${appwriteConfig.APPWRITE_JOBS_COLLECTION_ID}/documents/${documentId}`,
    data,
  );
}

export async function updateBookDocument(documentId, data) {
  return appwriteJson(
    "PATCH",
    `/databases/${appwriteConfig.APPWRITE_DATABASE_ID}/collections/${appwriteConfig.APPWRITE_BOOKS_COLLECTION_ID}/documents/${documentId}`,
    data,
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

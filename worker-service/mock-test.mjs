import fs from "node:fs";

const endpoint = "https://sgp.cloud.appwrite.io/v1";
const projectId = "69a129d40030295223ed";
const apiKey =
  process.env.APPWRITE_API_KEY ||
  "standard_3e7b7e4ceea2821f00336687555c238f6f053e0ffe62898d2d114b6342c0fd618693ae0680241736143fb1bfeb492157ccb223bee3848fff8868b0d6f5da0efaf9ce5fbbdd505a6d98809d446c9e654d203dd75d8608031d937442f2a332d52b893b0cfb21a50355e1a2c907f0440a647fdd04822b16f28531ca8d3b2bf47979";

const now = Date.now();
const slug = `mock-pipeline-test-${now}`;
const jobId = `job_${now}`;
const pdfPath =
  "C:/Users/MD SAHIL HASNAIN/desktop/projects/islamic-library/worker-service/test-book.pdf";

async function appwriteJson(method, path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

const form = new FormData();
form.append("fileId", "unique()");
form.append(
  "file",
  new Blob([fs.readFileSync(pdfPath)], { type: "application/pdf" }),
  "test-book.pdf",
);

const upload = await fetch(`${endpoint}/storage/buckets/source_pdfs/files`, {
  method: "POST",
  headers: {
    "X-Appwrite-Project": projectId,
    "X-Appwrite-Key": apiKey,
  },
  body: form,
});

const uploadText = await upload.text();
if (!upload.ok) {
  throw new Error(`upload failed (${upload.status}): ${uploadText}`);
}

const file = JSON.parse(uploadText);
const timestamp = new Date().toISOString();

await appwriteJson("POST", "/databases/library_ingestion/collections/books/documents", {
  documentId: "unique()",
  data: {
    slug,
    title: "Mock Pipeline Test",
    subtitle: "Automated mock render validation",
    author: "Codex",
    description: "Pipeline smoke test using mock render mode.",
    category: "Other",
    languageId: "english",
    volumeId: "volume1",
    sourceFileId: file.$id,
    status: "queued",
    createdBy: "codex-test",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
});

await appwriteJson(
  "POST",
  "/databases/library_ingestion/collections/ingestion_jobs/documents",
  {
    documentId: "unique()",
    data: {
      jobId,
      bookSlug: slug,
      sourceFileId: file.$id,
      languageId: "english",
      volumeId: "volume1",
      status: "queued",
      attempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
);

const workerResponse = await fetch("http://127.0.0.1:4010/jobs/ingest", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer dev_local_worker_token",
  },
  body: JSON.stringify({
    jobId,
    bookSlug: slug,
    sourceFileId: file.$id,
    languageId: "english",
    volumeId: "volume1",
    title: "Mock Pipeline Test",
    subtitle: "Automated mock render validation",
    author: "Codex",
    description: "Pipeline smoke test using mock render mode.",
    category: "Other",
    requestedBy: "codex-test",
    publishMode: "public",
  }),
});

const workerText = await workerResponse.text();
if (!workerResponse.ok) {
  throw new Error(`worker failed (${workerResponse.status}): ${workerText}`);
}

const workerPayload = JSON.parse(workerText);
const jobLookup = await appwriteJson(
  "GET",
  "/databases/library_ingestion/collections/ingestion_jobs/documents",
);
const bookLookup = await appwriteJson(
  "GET",
  "/databases/library_ingestion/collections/books/documents",
);
const matchedJob = jobLookup.documents?.find((document) => document.jobId === jobId);
const matchedBook = bookLookup.documents?.find((document) => document.slug === slug);

console.log(
  JSON.stringify(
    {
      slug,
      jobId,
      sourceFileId: file.$id,
      workerPayload,
      jobStatus: matchedJob?.status,
      bookStatus: matchedBook?.status,
      manifestUrl: matchedBook?.manifestUrl,
      metadataUrl: matchedBook?.metadataUrl,
    },
    null,
    2,
  ),
);

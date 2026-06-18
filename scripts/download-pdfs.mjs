import { createWriteStream, existsSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Load .env.local
const envPath = join(ROOT, ".env.local");
const envContent = await readFile(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1)];
    }),
);

const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
} = env;

const DATABASE_ID = "library_ingestion";
const BOOKS_COLLECTION_ID = "books";
const BUCKET_ID = "source_pdfs";

const HEADERS = {
  "X-Appwrite-Project": APPWRITE_PROJECT_ID,
  "X-Appwrite-Key": APPWRITE_API_KEY,
};

const UPLOAD_DIR = join(ROOT, "upload");
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

async function listAllDocuments() {
  let allDocs = [];
  let cursor = null;
  const limit = 100;

  while (true) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);

    const url = `${APPWRITE_ENDPOINT}/databases/${DATABASE_ID}/collections/${BOOKS_COLLECTION_ID}/documents?${params}`;
    const res = await fetch(url, { headers: HEADERS });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to list docs: ${res.status} ${text}`);
    }

    const body = await res.json();
    allDocs = allDocs.concat(body.documents);

    if (body.documents.length < limit) break;
    cursor = body.documents[body.documents.length - 1].$id;
  }

  return allDocs;
}

async function downloadPdf(slug, fileId) {
  const url = `${APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/download`;
  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  FAILED [${res.status}]: ${text}`);
    return false;
  }

  const filepath = join(UPLOAD_DIR, `${slug}.pdf`);
  const writer = createWriteStream(filepath);
  const buffer = Buffer.from(await res.arrayBuffer());
  writer.write(buffer);
  writer.close();

  console.log(`  Saved: ${slug}.pdf (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  return true;
}

// Main
console.log("Fetching books collection from Appwrite...");
const docs = await listAllDocuments();
console.log(`Found ${docs.length} document(s) in books collection`);

// Group by slug, keep the latest published/processed for each
const books = new Map();
for (const doc of docs) {
  const slug = doc.slug;
  if (!slug || !doc.sourceFileId) continue;

  const existing = books.get(slug);
  if (!existing) {
    books.set(slug, { sourceFileId: doc.sourceFileId, title: doc.title, status: doc.status });
  } else if (doc.status === "published" && existing.status !== "published") {
    books.set(slug, { sourceFileId: doc.sourceFileId, title: doc.title, status: doc.status });
  }
}

console.log(`Unique books with sourceFileId: ${books.size}`);
console.log("Books:", [...books.keys()].join(", "));

let ok = 0, fail = 0;
for (const [slug, info] of books) {
  const filename = join(UPLOAD_DIR, `${slug}.pdf`);
  if (existsSync(filename)) {
    console.log(`Skipping ${slug}.pdf (already exists)`);
    ok++;
    continue;
  }
  console.log(`\nDownloading ${slug} (${info.title})...`);
  const success = await downloadPdf(slug, info.sourceFileId);
  if (success) ok++; else fail++;
}

console.log(`\nDone: ${ok} downloaded, ${fail} failed`);

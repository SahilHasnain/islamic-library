import crypto from "node:crypto";
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
const publicBucketId = requireEnv("APPWRITE_PUBLIC_BUCKET_ID");

// ---------------------------------------------------------------------------
// ID + URL helpers (mirror worker-service/src/upload.mjs)
// ---------------------------------------------------------------------------

const catalogFileId = "catalog";

function normalizeLanguageId(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileIdFor(seed) {
  return crypto.createHash("md5").update(seed).digest("hex");
}

function buildVolumeSeed(bookSlug, normalizedLanguageId, volumeId) {
  return `${bookSlug}:${normalizedLanguageId}:${volumeId}`;
}

function contentTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function publicFileViewUrl(bucketId, fileId) {
  return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
}

// ---------------------------------------------------------------------------
// Appwrite REST helpers (zero-dependency multipart upload)
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_UPLOAD_ATTEMPTS = 6;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, init, attempts = MAX_UPLOAD_ATTEMPTS) {
  let lastError = new Error(`Request to ${url} failed`);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!RETRYABLE_STATUS.has(response.status)) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}`);
      if (attempt === attempts) {
        return response;
      }

      await response.arrayBuffer();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === attempts) {
        throw lastError;
      }
    }

    await delay(Math.min(500 * 2 ** (attempt - 1), 8000));
  }

  throw lastError;
}

async function uploadBucketFile({ bucketId, fileId, fileBuffer, fileName, contentType }) {
  const boundary = `----islamicLibraryBackfillBoundary${Date.now().toString(36)}`;
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

  const response = await fetchWithRetry(`${endpoint}/storage/buckets/${bucketId}/files`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload ${fileId} failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function getBucketFile(bucketId, fileId) {
  const response = await fetchWithRetry(
    `${endpoint}/storage/buckets/${bucketId}/files/${fileId}`,
    {
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
      },
    },
    3,
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function deleteBucketFile(bucketId, fileId) {
  const response = await fetchWithRetry(
    `${endpoint}/storage/buckets/${bucketId}/files/${fileId}`,
    {
      method: "DELETE",
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Delete ${fileId} failed (${response.status}): ${text}`);
  }

  return response.ok;
}

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

const isDryRun = process.argv.includes("--dry-run");
const shouldResume = process.argv.includes("--resume");

function resolveAssetsPath() {
  const assetsArgIndex = process.argv.indexOf("--assets");
  const assetsPath =
    assetsArgIndex >= 0
      ? process.argv[assetsArgIndex + 1]
      : process.env.BACKFILL_ASSETS_REPO_PATH || path.join(repoRoot, "..", "islamic-library-assets");
  return path.resolve(assetsPath ?? "");
}

function ensureAssetsPath(assetsPath) {
  if (
    !fs.existsSync(path.join(assetsPath, "books")) ||
    !fs.existsSync(path.join(assetsPath, "catalog.json"))
  ) {
    throw new Error(
      `Expected assets repo at "${assetsPath}" (containing books/ and catalog.json). ` +
        `Pass --assets <path> or set BACKFILL_ASSETS_REPO_PATH.`,
    );
  }
}

async function uploadBinaryBuffer(fileId, fileBuffer, fileName, contentType, counts) {
  if (shouldResume) {
    const existing = await getBucketFile(publicBucketId, fileId);
    if (existing && existing.sizeOriginal === fileBuffer.length) {
      if (counts) {
        counts.skipped += 1;
      }
      return;
    }
  }

  await deleteBucketFile(publicBucketId, fileId);
  await uploadBucketFile({
    bucketId: publicBucketId,
    fileId,
    fileBuffer,
    fileName,
    contentType,
  });
}

async function uploadTextFile(fileId, text, fileName, counts) {
  await uploadBinaryBuffer(
    fileId,
    Buffer.from(text, "utf8"),
    fileName,
    "application/json",
    counts,
  );
}

async function uploadBinaryFile(fileId, filePath, fileName, counts) {
  await uploadBinaryBuffer(fileId, fs.readFileSync(filePath), fileName, contentTypeFor(fileName), counts);
}

async function backfillBook(bookSlug, assetsPath, counts, originalEntry) {
  const bookDir = path.join(assetsPath, "books", bookSlug);

  const metadataPath = path.join(bookDir, "metadata.json");
  const coverPath = path.join(bookDir, "cover.png");
  if (!fs.existsSync(metadataPath)) {
    console.log(`skip ${bookSlug}: metadata.json missing`);
    return null;
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

  // Book cover: single deterministic cover per book (same as publish logic).
  if (fs.existsSync(coverPath)) {
    const coverFileName = path.basename(coverPath);
    const coverFileId = fileIdFor(`${bookSlug}:cover:${coverFileName}`);
    counts.covers += 1;
    if (!isDryRun) {
      await uploadBinaryFile(coverFileId, coverPath, coverFileName, counts);
    }
  }

  // Per-volume: pages + manifest, then rewrite metadata volume manifestUrl.
  for (const language of metadata.languages || []) {
    const currentLanguageId = normalizeLanguageId(language.id);
    const languageDir = path.join(bookDir, currentLanguageId);

    for (const volume of language.volumes || []) {
      const volumeDir = path.join(languageDir, volume.id);
      const manifestPath = path.join(volumeDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        console.log(`skip ${bookSlug}/${currentLanguageId}/${volume.id}: manifest.json missing`);
        continue;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const volumeSeed = buildVolumeSeed(bookSlug, currentLanguageId, volume.id);
      const manifestFileId = fileIdFor(`${volumeSeed}:manifest`);

      const pageCopies = [];
      for (const page of manifest.pages || []) {
        const pagePath = path.join(volumeDir, page.fileName);
        if (!fs.existsSync(pagePath)) {
          console.warn(
            `skip ${bookSlug}/${currentLanguageId}/${volume.id}: missing page file ${page.fileName}`,
          );
          continue;
        }
        const pageFileId = fileIdFor(`${volumeSeed}:page:${page.fileName}`);
        counts.pages += 1;
        if (!isDryRun) {
          await uploadBinaryFile(pageFileId, pagePath, page.fileName, counts);
        }
        if (counts.pages % 250 === 0) {
          console.log(`  pages uploaded: ${counts.pages}`);
        }
        pageCopies.push({ ...page, url: publicFileViewUrl(publicBucketId, pageFileId) });
      }

      const publishedManifest = {
        ...manifest,
        languageId: currentLanguageId,
        baseUrl: `${bookSlug}/${currentLanguageId}/${volume.id}/`,
        coverImage: coverUrl(bookSlug),
        pages: pageCopies,
      };

      counts.manifests += 1;
      if (!isDryRun) {
        await uploadTextFile(
          manifestFileId,
          JSON.stringify(publishedManifest, null, 2),
          "manifest.json",
          counts,
        );
      }

      volume.manifestUrl = publicFileViewUrl(publicBucketId, manifestFileId);
    }
  }

  const publishedMetadata = {
    ...metadata,
    id: bookSlug,
    coverImage: coverUrl(bookSlug),
    languages: (metadata.languages || []).map((language) => ({
      ...language,
      id: normalizeLanguageId(language.id),
      title: languageTitleFromId(language.id),
    })),
  };

  const metadataFileId = fileIdFor(`${bookSlug}:metadata`);
  counts.metadata += 1;
  if (!isDryRun) {
    await uploadTextFile(
      metadataFileId,
      JSON.stringify(publishedMetadata, null, 2),
      "metadata.json",
      counts,
    );
  }

  return {
    bookSlug,
    catalogEntry: {
      ...originalEntry,
      coverImage: coverUrl(bookSlug),
      status: "published",
      metadataUrl: publicFileViewUrl(publicBucketId, metadataFileId),
    },
  };
}

function coverUrl(bookSlug) {
  return publicFileViewUrl(publicBucketId, fileIdFor(`${bookSlug}:cover:cover.png`));
}

function languageTitleFromId(value) {
  return normalizeLanguageId(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function main() {
  const assetsPath = resolveAssetsPath();
  ensureAssetsPath(assetsPath);

  console.log(`Backfilling into Appwrite public bucket "${publicBucketId}"`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project: ${projectId}`);
  console.log(`Assets repo: ${assetsPath}`);
  if (isDryRun) {
    console.log("DRY RUN - no files will be written.\n");
  }
  if (shouldResume) {
    console.log("RESUME - files already present with matching size are skipped.\n");
  }

  const counts = { covers: 0, pages: 0, manifests: 0, metadata: 0, catalog: 0, skipped: 0 };

  const catalog = JSON.parse(fs.readFileSync(path.join(assetsPath, "catalog.json"), "utf8"));

  const catalogBooks = [];
  for (const bookEntry of catalog.books || []) {
    const backfilled = await backfillBook(bookEntry.id, assetsPath, counts, bookEntry);
    if (backfilled) {
      catalogBooks.push(backfilled.catalogEntry);
    }
  }

  const nextCatalog = {
    ...catalog,
    books: catalogBooks,
  };

  counts.catalog += 1;
  if (!isDryRun) {
    await uploadTextFile(catalogFileId, JSON.stringify(nextCatalog, null, 2), "catalog.json", counts);
  }

  console.log("\nBackfill complete.");
  console.log(`  covers: ${counts.covers}`);
  console.log(`  pages: ${counts.pages}`);
  console.log(`  manifests: ${counts.manifests}`);
  console.log(`  metadata: ${counts.metadata}`);
  console.log(`  catalog: ${counts.catalog}`);
  console.log(`  skipped (already uploaded): ${counts.skipped}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("\nBackfill failed:", error.message || error);
    process.exit(1);
  },
);

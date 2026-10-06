import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    const separator = line.indexOf("=");
    if (!line || line.startsWith("#") || separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, "admin-console", ".env.local"));
loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, "worker-service", ".env.local"));

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  return process.env[name];
}

function normalizeEndpoint(value) {
  const endpoint = String(value || "").trim().replace(/\/+$/, "");
  return endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`;
}

function normalizeLanguageId(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(value) {
  const category = String(value || "").trim();
  return category.toLowerCase() === "seerah" ? "Seerat" : category;
}

function documentId(seed) {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

function now() {
  return new Date().toISOString();
}

const dryRun = process.argv.includes("--dry-run");
const catalogUrlArg = process.argv.find((arg) => arg.startsWith("--catalog-url="));
const catalogUrl = catalogUrlArg
  ? catalogUrlArg.slice("--catalog-url=".length)
  : process.env.EXPO_PUBLIC_LIBRARY_CATALOG_URL ||
    "https://raw.githubusercontent.com/sahilhasnain/islamic-library-assets/main/catalog.json";
const endpoint = process.env.APPWRITE_ENDPOINT ? normalizeEndpoint(process.env.APPWRITE_ENDPOINT) : "";
const projectId = process.env.APPWRITE_PROJECT_ID || "";
const apiKey = process.env.APPWRITE_API_KEY || "";
const databaseId = process.env.APPWRITE_DATABASE_ID || "library_ingestion";

if (!dryRun) {
  requireEnv("APPWRITE_ENDPOINT");
  requireEnv("APPWRITE_PROJECT_ID");
  requireEnv("APPWRITE_API_KEY");
}

async function request(method, pathname, body) {
  const response = await fetch(`${endpoint}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok && response.status !== 404) {
    throw new Error(`${method} ${pathname} failed (${response.status}): ${text}`);
  }
  return { status: response.status, data };
}

async function upsert(collectionId, id, data) {
  if (dryRun) return;
  const pathname = `/databases/${databaseId}/collections/${collectionId}/documents/${id}`;
  const existing = await request("GET", pathname);
  if (existing.status === 404) {
    await request("POST", `/databases/${databaseId}/collections/${collectionId}/documents`, {
      documentId: id,
      data,
      permissions: [],
    });
    return;
  }
  await request("PUT", pathname, { data });
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`Could not fetch ${url} (${response.status}).`);
  return response.json();
}

function cleanRecommendationType(value) {
  const allowed = new Set([
    "same-author",
    "same-topic",
    "same-category",
    "next-reading",
    "foundational",
    "advanced",
  ]);
  return allowed.has(value) ? value : undefined;
}

async function migrateBook(catalogBook, counts) {
  const metadata = await fetchJson(catalogBook.metadataUrl);
  const bookSlug = String(catalogBook.id || metadata.id || "").trim();
  if (!bookSlug) throw new Error("A catalog book is missing its id.");

  const timestamp = now();
  const logicalBook = {
    slug: bookSlug,
    title: metadata.title || catalogBook.title || bookSlug,
    subtitle: metadata.subtitle || catalogBook.subtitle || undefined,
    author: metadata.author || catalogBook.author || undefined,
    description: metadata.description || undefined,
    category: normalizeCategory(metadata.category || catalogBook.category),
    categoryLabel: metadata.categoryLabel || catalogBook.categoryLabel || undefined,
    coverImage: metadata.coverImage || catalogBook.coverImage || undefined,
    defaultLanguageId: normalizeLanguageId(metadata.defaultLanguageId),
    nextRecommendedBookId: metadata.nextRecommendedBookId || catalogBook.nextRecommendedBookId || undefined,
    status: "published",
    sourceVersion: String(metadata.version || catalogBook.publishedVersion || "legacy-json"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await upsert("logical_books", documentId(`book:${bookSlug}`), logicalBook);
  counts.logicalBooks += 1;

  for (const language of metadata.languages || []) {
    const languageId = normalizeLanguageId(language.id);
    await upsert("book_languages", documentId(`language:${bookSlug}:${languageId}`), {
      bookSlug,
      languageId,
      title: language.title || languageId,
      nativeTitle: language.nativeTitle || undefined,
      summary: language.summary || undefined,
      order: language.order || undefined,
      defaultVolumeId: language.defaultVolumeId || undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    counts.languages += 1;
    for (const volume of language.volumes || []) {
      const volumeId = String(volume.id || "").trim();
      if (!languageId || !volumeId) continue;
      await upsert("book_editions", documentId(`edition:${bookSlug}:${languageId}:${volumeId}`), {
        bookSlug,
        languageId,
        languageTitle: language.title || languageId,
        volumeId,
        volumeTitle: volume.title || volumeId,
        order: volume.order || undefined,
        subtitle: volume.subtitle || undefined,
        manifestUrl: volume.manifestUrl || undefined,
        printedPageStartPage: volume.printedPageStartPage || undefined,
        introNote: volume.introNote || undefined,
        todayTarget: volume.todayTarget || undefined,
        status: "published",
        sourceVersion: logicalBook.sourceVersion,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      counts.editions += 1;

      const entries = volume.tocEntries || volume.sections || [];
      for (const [position, entry] of entries.entries()) {
        await upsert("book_toc_entries", documentId(`toc:${bookSlug}:${languageId}:${volumeId}:${position}`), {
          bookSlug,
          languageId,
          volumeId,
          entryId: String(entry.id || `${volumeId}-${position + 1}`),
          title: String(entry.title || "Untitled").slice(0, 255),
          subtitle: entry.subtitle || undefined,
          printedPage: entry.printedPage || entry.startPage || undefined,
          renderedPage: entry.renderedPage || undefined,
          level: entry.level || undefined,
          position,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        counts.tocEntries += 1;
      }
    }
  }

  for (const [position, recommendation] of (metadata.recommendations || catalogBook.recommendations || []).entries()) {
    if (!recommendation.bookId) continue;
    await upsert("book_recommendations", documentId(`recommendation:${bookSlug}:${recommendation.bookId}:${position}`), {
      bookSlug,
      recommendedBookId: recommendation.bookId,
      reason: recommendation.reason || undefined,
      type: cleanRecommendationType(recommendation.type),
      score: Number.isFinite(recommendation.score) ? Math.max(0, Math.min(100, Math.round(recommendation.score))) : undefined,
      position,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    counts.recommendations += 1;
  }
}

const catalog = await fetchJson(catalogUrl);
const counts = { logicalBooks: 0, languages: 0, editions: 0, tocEntries: 0, recommendations: 0 };
for (const book of catalog.books || []) await migrateBook(book, counts);

console.log(`${dryRun ? "Dry run" : "Migration"} complete.`);
console.log(JSON.stringify({ catalogUrl, ...counts }, null, 2));

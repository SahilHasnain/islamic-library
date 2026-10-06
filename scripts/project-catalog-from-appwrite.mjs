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
  if (!category) return "Other";
  return category.toLowerCase() === "seerah" ? "Seerat" : category;
}

function fileIdFor(seed) {
  return crypto.createHash("md5").update(seed).digest("hex");
}

const apply = process.argv.includes("--apply");
const endpoint = normalizeEndpoint(requireEnv("APPWRITE_ENDPOINT"));
const projectId = requireEnv("APPWRITE_PROJECT_ID");
const apiKey = requireEnv("APPWRITE_API_KEY");
const databaseId = process.env.APPWRITE_DATABASE_ID || "library_ingestion";
const publicBucketId = process.env.APPWRITE_PUBLIC_BUCKET_ID || "public_assets";

async function request(method, pathname, body, headers = {}) {
  const response = await fetch(`${endpoint}${pathname}`, {
    method,
    headers: {
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
      ...headers,
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

async function listDocuments(collectionId) {
  const documents = [];
  for (let offset = 0; ; offset += 100) {
    const limitQuery = encodeURIComponent(JSON.stringify({ method: "limit", values: [100] }));
    const offsetQuery = encodeURIComponent(JSON.stringify({ method: "offset", values: [offset] }));
    const query = `?queries[]=${limitQuery}&queries[]=${offsetQuery}`;
    const result = await request("GET", `/databases/${databaseId}/collections/${collectionId}/documents${query}`);
    documents.push(...(result.documents || []));
    if (documents.length >= Number(result.total || 0) || (result.documents || []).length < 100) break;
  }
  return documents;
}

function publicFileUrl(fileId) {
  return `${endpoint}/storage/buckets/${publicBucketId}/files/${fileId}/view?project=${encodeURIComponent(projectId)}`;
}

async function uploadJson(fileId, fileName, value) {
  if (!apply) return;
  try {
    await request("DELETE", `/storage/buckets/${publicBucketId}/files/${fileId}`);
  } catch (error) {
    if (!String(error.message).includes("(404)")) throw error;
  }

  const form = new FormData();
  form.append("fileId", fileId);
  form.append("file", new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), fileName);
  await request("POST", `/storage/buckets/${publicBucketId}/files`, form);
}

const [books, languages, editions, tocEntries, recommendations] = await Promise.all([
  listDocuments("logical_books"),
  listDocuments("book_languages"),
  listDocuments("book_editions"),
  listDocuments("book_toc_entries"),
  listDocuments("book_recommendations"),
]);

const languagesByBook = new Map();
for (const language of languages) {
  const list = languagesByBook.get(language.bookSlug) || [];
  list.push(language);
  languagesByBook.set(language.bookSlug, list);
}

const editionsByKey = new Map();
for (const edition of editions) editionsByKey.set(`${edition.bookSlug}:${edition.languageId}:${edition.volumeId}`, edition);

const tocByKey = new Map();
for (const entry of tocEntries) {
  const key = `${entry.bookSlug}:${entry.languageId}:${entry.volumeId}`;
  const list = tocByKey.get(key) || [];
  list.push(entry);
  tocByKey.set(key, list);
}

const recommendationsByBook = new Map();
for (const recommendation of recommendations) {
  const list = recommendationsByBook.get(recommendation.bookSlug) || [];
  list.push(recommendation);
  recommendationsByBook.set(recommendation.bookSlug, list);
}

const catalogBooks = [];
for (const book of books.filter((entry) => entry.status !== "archived")) {
  const bookLanguages = (languagesByBook.get(book.slug) || []).sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
  const metadataLanguages = bookLanguages.map((language) => ({
    id: normalizeLanguageId(language.languageId),
    title: language.title,
    nativeTitle: language.nativeTitle || undefined,
    summary: language.summary || undefined,
    order: language.order,
    defaultVolumeId: language.defaultVolumeId || undefined,
    volumes: editions
      .filter((edition) => edition.bookSlug === book.slug && normalizeLanguageId(edition.languageId) === normalizeLanguageId(language.languageId))
      .sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999))
      .map((edition) => ({
        id: edition.volumeId,
        title: edition.volumeTitle || edition.volumeId,
        subtitle: edition.subtitle || undefined,
        manifestUrl: edition.manifestUrl || undefined,
        printedPageStartPage: edition.printedPageStartPage || undefined,
        introNote: edition.introNote || undefined,
        todayTarget: edition.todayTarget || undefined,
        tocEntries: (tocByKey.get(`${book.slug}:${normalizeLanguageId(language.languageId)}:${edition.volumeId}`) || [])
          .sort((a, b) => a.position - b.position)
          .map((entry) => ({
            id: entry.entryId,
            title: entry.title,
            subtitle: entry.subtitle || undefined,
            printedPage: entry.printedPage || undefined,
            renderedPage: entry.renderedPage || undefined,
            level: entry.level || undefined,
          })),
      })),
  }));

  const bookRecommendations = (recommendationsByBook.get(book.slug) || [])
    .sort((a, b) => a.position - b.position)
    .map((recommendation) => ({
      bookId: recommendation.recommendedBookId,
      reason: recommendation.reason || undefined,
      type: recommendation.type || undefined,
      score: recommendation.score || undefined,
    }));
  const metadata = {
    id: book.slug,
    title: book.title,
    subtitle: book.subtitle || undefined,
    author: book.author || undefined,
    description: book.description || undefined,
    category: normalizeCategory(book.category),
    categoryLabel: book.categoryLabel || undefined,
    coverImage: book.coverImage || undefined,
    nextRecommendedBookId: book.nextRecommendedBookId || undefined,
    recommendations: bookRecommendations,
    defaultLanguageId: normalizeLanguageId(book.defaultLanguageId),
    languages: metadataLanguages,
  };
  const metadataFileId = fileIdFor(`${book.slug}:metadata`);
  await uploadJson(metadataFileId, "metadata.json", metadata);
  catalogBooks.push({
    id: book.slug,
    title: book.title,
    subtitle: book.subtitle || undefined,
    author: book.author || undefined,
    category: normalizeCategory(book.category),
    categoryLabel: book.categoryLabel || undefined,
    coverImage: book.coverImage || undefined,
    status: "published",
    metadataUrl: publicFileUrl(metadataFileId),
    nextRecommendedBookId: book.nextRecommendedBookId || undefined,
    recommendations: bookRecommendations,
    languages: metadataLanguages.map((language) => ({
      id: language.id,
      title: language.title,
    })),
  });
}

const catalog = {
  version: new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14),
  generatedAt: new Date().toISOString(),
  books: catalogBooks,
};
await uploadJson("catalog", "catalog.json", catalog);

console.log(`${apply ? "Projection" : "Projection dry run"} complete.`);
console.log(JSON.stringify({
  books: books.length,
  languages: languages.length,
  editions: editions.length,
  tocEntries: tocEntries.length,
  recommendations: recommendations.length,
  uploaded: apply,
}, null, 2));

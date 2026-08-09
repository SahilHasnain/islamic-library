import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  appwriteConfig,
  deleteBucketFile,
  downloadBucketFileText,
  publicFileViewUrl,
  uploadBucketFile,
} from "./appwrite.mjs";

const publicBucketId = appwriteConfig.APPWRITE_PUBLIC_BUCKET_ID;
const catalogFileId = "catalog";

function normalizeLanguageId(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function languageTitleFromId(value) {
  return normalizeLanguageId(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fileIdFor(seed) {
  return crypto.createHash("md5").update(seed).digest("hex");
}

function buildVolumeSeed(bookSlug, languageId, volumeId) {
  return `${bookSlug}:${normalizeLanguageId(languageId)}:${volumeId}`;
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

function safeParse(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

async function uploadFile(fileId, fileBuffer, fileName) {
  await deleteBucketFile(publicBucketId, fileId);
  await uploadBucketFile({
    bucketId: publicBucketId,
    fileId,
    fileBuffer,
    fileName,
    contentType: contentTypeFor(fileName),
  });
}

export async function publishWorkspace({
  workspace,
  bookSlug,
  canonicalBookSlug,
  languageId,
  volumeId,
  metadata,
  manifest,
  version,
}) {
  const normalizedLanguageId = normalizeLanguageId(languageId);
  const assetsBookSlug = canonicalBookSlug || bookSlug;
  const coverFileName = manifest.coverImage || path.basename(workspace.coverImagePath);

  const volumeSeed = buildVolumeSeed(assetsBookSlug, normalizedLanguageId, volumeId);
  const coverFileId = fileIdFor(`${assetsBookSlug}:cover:${coverFileName}`);
  const manifestFileId = fileIdFor(`${volumeSeed}:manifest`);
  const metadataFileId = fileIdFor(`${assetsBookSlug}:metadata`);

  // Cover
  const coverBuffer = await fs.readFile(workspace.coverImagePath);
  await uploadFile(coverFileId, coverBuffer, coverFileName);

  // Pages
  const pageCopies = await Promise.all(
    manifest.pages.map(async (page) => {
      const sourcePath = path.join(workspace.pagesDir, page.fileName);
      const fileBuffer = await fs.readFile(sourcePath);
      const fileId = fileIdFor(`${volumeSeed}:page:${page.fileName}`);
      await uploadFile(fileId, fileBuffer, page.fileName);
      return {
        ...page,
        url: publicFileViewUrl(publicBucketId, fileId),
      };
    }),
  );

  const publishedManifest = {
    ...manifest,
    languageId: normalizedLanguageId,
    version,
    baseUrl: `${assetsBookSlug}/${normalizedLanguageId}/${volumeId}/`,
    coverImage: publicFileViewUrl(publicBucketId, coverFileId),
    pages: pageCopies,
  };

  // Merge metadata: preserve other languages/volumes already uploaded.
  const existingMetadataText = await downloadBucketFileText(publicBucketId, metadataFileId);
  const existingMetadata = safeParse(existingMetadataText, {});

  const existingLanguages = existingMetadata.languages || [];
  const currentLanguageIndex = existingLanguages.findIndex((language) =>
    normalizeLanguageId(language.id) === normalizedLanguageId,
  );
  const currentMetadataLanguage = metadata.languages?.find(
    (language) => normalizeLanguageId(language.id) === normalizedLanguageId,
  );
  const currentManifestUrl = publicFileViewUrl(publicBucketId, manifestFileId);

  let updatedLanguages;
  if (currentLanguageIndex >= 0) {
    // Language exists, merge volumes.
    const existingLanguage = existingLanguages[currentLanguageIndex];
    const existingVolumes = existingLanguage.volumes || [];
    const currentVolumeIndex = existingVolumes.findIndex((volume) => volume.id === volumeId);

    let updatedVolumes;
    if (currentVolumeIndex >= 0) {
      updatedVolumes = [...existingVolumes];
      updatedVolumes[currentVolumeIndex] = {
        ...existingVolumes[currentVolumeIndex],
        ...(currentMetadataLanguage?.volumes?.find((volume) => volume.id === volumeId) || {}),
        manifestUrl: currentManifestUrl,
      };
    } else {
      updatedVolumes = [
        ...existingVolumes,
        {
          ...(currentMetadataLanguage?.volumes?.find((volume) => volume.id === volumeId) || {}),
          id: volumeId,
          manifestUrl: currentManifestUrl,
        },
      ];
    }

    updatedLanguages = [...existingLanguages];
    updatedLanguages[currentLanguageIndex] = {
      ...existingLanguage,
      ...currentMetadataLanguage,
      id: normalizedLanguageId,
      title: languageTitleFromId(normalizedLanguageId),
      nativeTitle: undefined,
      volumes: updatedVolumes,
    };
  } else {
    // Language doesn't exist, add it.
    updatedLanguages = [
      ...existingLanguages,
      {
        ...currentMetadataLanguage,
        id: normalizedLanguageId,
        title: languageTitleFromId(normalizedLanguageId),
        nativeTitle: undefined,
        volumes: [
          {
            ...(currentMetadataLanguage?.volumes?.find((volume) => volume.id === volumeId) || {}),
            id: volumeId,
            manifestUrl: currentManifestUrl,
          },
        ],
      },
    ];
  }

  const coverUrl = publicFileViewUrl(publicBucketId, coverFileId);
  const publishedMetadata = {
    ...existingMetadata,
    ...metadata,
    id: assetsBookSlug,
    coverImage: existingMetadata.coverImage || coverUrl,
    defaultLanguageId:
      normalizeLanguageId(metadata.defaultLanguageId || existingMetadata.defaultLanguageId || normalizedLanguageId),
    languages: updatedLanguages,
  };

  await uploadFile(
    manifestFileId,
    Buffer.from(JSON.stringify(publishedManifest, null, 2), "utf8"),
    "manifest.json",
  );
  await uploadFile(
    metadataFileId,
    Buffer.from(JSON.stringify(publishedMetadata, null, 2), "utf8"),
    "metadata.json",
  );

  // Catalog merge: read-modify-write of the shared catalog file.
  const existingCatalogText = await downloadBucketFileText(publicBucketId, catalogFileId);
  const currentCatalog = safeParse(existingCatalogText, { version, generatedAt: new Date().toISOString(), books: [] });
  const metadataUrl = publicFileViewUrl(publicBucketId, metadataFileId);
  const updatedEntry = {
    id: assetsBookSlug,
    title: publishedMetadata.title,
    subtitle: publishedMetadata.subtitle,
    author: publishedMetadata.author,
    category: publishedMetadata.category,
    nextRecommendedBookId: publishedMetadata.nextRecommendedBookId,
    recommendations: publishedMetadata.recommendations,
    coverImage: publishedMetadata.coverImage,
    status: "published",
    metadataUrl,
  };

  const remainingBooks = (currentCatalog.books || []).filter((book) => book.id !== assetsBookSlug);
  const nextCatalog = {
    version,
    generatedAt: new Date().toISOString(),
    books: [...remainingBooks, updatedEntry].sort((a, b) => a.title.localeCompare(b.title)),
  };

  await uploadFile(
    catalogFileId,
    Buffer.from(JSON.stringify(nextCatalog, null, 2), "utf8"),
    "catalog.json",
  );

  return {
    catalogPath: "catalog.json",
    metadataPath: `books/${assetsBookSlug}/metadata.json`,
    manifestPath: `books/${assetsBookSlug}/${normalizedLanguageId}/${volumeId}/manifest.json`,
    assetBasePath: `${assetsBookSlug}/${normalizedLanguageId}/${volumeId}/`,
    metadataUrl,
    manifestUrl: currentManifestUrl,
    coverImageUrl: coverUrl,
    commitSummary: `Uploaded ${pageCopies.length + 3} files to bucket ${publicBucketId}.`,
    pushStatus: "succeeded",
    pushError: "",
    pushSummary: "Files uploaded to Appwrite public bucket.",
  };
}

export function buildPublishVersion() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timePart = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
  return `${datePart}-${timePart}`;
}

export async function republishBookMetadata({
  bookSlug,
  canonicalBookSlug,
  title,
  subtitle,
  author,
  description,
  category,
  nextRecommendedBookId,
  recommendations,
  defaultLanguageId,
  languageId,
  volumeId,
  version,
  languages,
}) {
  const normalizedLanguageId = normalizeLanguageId(languageId);
  const normalizedDefaultLanguageId = normalizeLanguageId(defaultLanguageId);
  const assetsBookSlug = canonicalBookSlug || bookSlug;

  const metadataFileId = fileIdFor(`${assetsBookSlug}:metadata`);
  const manifestFileId = fileIdFor(`${buildVolumeSeed(assetsBookSlug, normalizedLanguageId, volumeId)}:manifest`);
  const coverFileId = fileIdFor(`${assetsBookSlug}:cover:cover.webp`);
  const currentManifestUrl = publicFileViewUrl(publicBucketId, manifestFileId);

  const existingMetadataText = await downloadBucketFileText(publicBucketId, metadataFileId);
  const existingMetadata = safeParse(existingMetadataText, {});

  const nextLanguages =
    Array.isArray(languages) && languages.length > 0
      ? languages.map((language) => {
        const currentLanguageId = normalizeLanguageId(language.languageId);
        return {
          id: currentLanguageId,
          title: languageTitleFromId(currentLanguageId),
          nativeTitle: undefined,
          summary: language.summary,
          order: language.order,
          defaultVolumeId: language.defaultVolumeId,
          volumes: (language.volumes || []).map((volume) => {
            const existingLanguage = (existingMetadata.languages || []).find(
              (currentLanguage) => normalizeLanguageId(currentLanguage.id) === currentLanguageId,
            );
            const existingVolume = existingLanguage?.volumes?.find(
              (currentVolume) => currentVolume.id === volume.id,
            );
            const resolvedManifestUrl =
              volume.manifestUrl ||
              existingVolume?.manifestUrl ||
              (currentLanguageId === normalizedLanguageId && volume.id === volumeId
                ? currentManifestUrl
                : undefined);

            return {
              id: volume.id,
              title: volume.title,
              subtitle: volume.subtitle,
              manifestUrl: resolvedManifestUrl,
              order: volume.order,
              printedPageStartPage: volume.printedPageStartPage,
              introNote: volume.introNote,
              todayTarget: volume.todayTarget,
              tocEntries: volume.tocEntries?.length ? volume.tocEntries : existingVolume?.tocEntries,
            };
          }),
        };
      })
      : (existingMetadata.languages || []).map((language) =>
          normalizeLanguageId(language.id) === normalizedLanguageId
            ? {
                ...language,
                id: normalizedLanguageId,
                title: languageTitleFromId(normalizedLanguageId),
                nativeTitle: undefined,
                volumes: (language.volumes || []).map((volume) =>
                  volume.id === volumeId
                    ? {
                        ...volume,
                        manifestUrl: volume.manifestUrl || currentManifestUrl,
                      }
                    : volume,
                ),
              }
            : language,
        );

  const publishedMetadata = {
    ...existingMetadata,
    title,
    subtitle,
    author,
    description,
    category,
    nextRecommendedBookId,
    recommendations,
    coverImage: existingMetadata.coverImage || publicFileViewUrl(publicBucketId, coverFileId),
    defaultLanguageId:
      normalizedDefaultLanguageId || normalizeLanguageId(existingMetadata.defaultLanguageId),
    languages: nextLanguages,
  };

  await uploadFile(
    metadataFileId,
    Buffer.from(JSON.stringify(publishedMetadata, null, 2), "utf8"),
    "metadata.json",
  );

  const metadataUrl = publicFileViewUrl(publicBucketId, metadataFileId);
  const existingCatalogText = await downloadBucketFileText(publicBucketId, catalogFileId);
  const currentCatalog = safeParse(existingCatalogText, { version, generatedAt: new Date().toISOString(), books: [] });
  const updatedEntry = {
    id: assetsBookSlug,
    title,
    subtitle,
    author,
    category,
    nextRecommendedBookId,
    recommendations,
    coverImage: publishedMetadata.coverImage,
    status: "published",
    metadataUrl,
  };

  const remainingBooks = (currentCatalog.books || []).filter((book) => book.id !== assetsBookSlug);
  const nextCatalog = {
    version,
    generatedAt: new Date().toISOString(),
    books: [...remainingBooks, updatedEntry].sort((a, b) => a.title.localeCompare(b.title)),
  };

  await uploadFile(
    catalogFileId,
    Buffer.from(JSON.stringify(nextCatalog, null, 2), "utf8"),
    "catalog.json",
  );

  return {
    catalogPath: "catalog.json",
    metadataPath: `books/${assetsBookSlug}/metadata.json`,
    metadataUrl,
    manifestUrl: currentManifestUrl,
    coverImageUrl: publishedMetadata.coverImage,
    commitSummary: `Uploaded metadata for ${assetsBookSlug} to bucket ${publicBucketId}.`,
    pushStatus: "succeeded",
    pushError: "",
    pushSummary: "Files uploaded to Appwrite public bucket.",
  };
}
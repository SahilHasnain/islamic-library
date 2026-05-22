import type { PublicVolumeManifest, ResolvedManifestPageAsset } from "../data/types";
import {
  cacheRemotePage,
  getCachedPageInfo,
  getCachedPageUri,
} from "./page-asset-cache";

type ResolveManifestPageOptions = {
  cacheRemote?: boolean;
};

const inFlightDownloads = new Map<string, Promise<string | null>>();

function getPageCacheKey(
  bookId: string,
  languageId: string,
  volumeId: string,
  page: number,
) {
  return `${bookId}:${languageId}:${volumeId}:${page}`;
}

export function getManifestPageUrl(manifest: PublicVolumeManifest, page: number) {
  const explicitPage = manifest.pages?.find((entry) => entry.page === page);
  if (explicitPage?.url) {
    return explicitPage.url;
  }

  const pageToken = String(page).padStart(3, "0");
  const fileName = manifest.filePattern.replace("{page}", pageToken);
  return `${manifest.baseUrl.replace(/\/+$/, "")}/${fileName}`;
}

async function cacheRemotePageOnce(
  bookId: string,
  languageId: string,
  volumeId: string,
  page: number,
  remoteUri: string,
  extension: string,
) {
  const cacheKey = getPageCacheKey(bookId, languageId, volumeId, page);
  const existingRequest = inFlightDownloads.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = cacheRemotePage(
    bookId,
    languageId,
    volumeId,
    page,
    remoteUri,
    extension,
  )
    .catch(() => null)
    .finally(() => {
      inFlightDownloads.delete(cacheKey);
    });

  inFlightDownloads.set(cacheKey, request);
  return request;
}

export async function resolveManifestPageAsset(
  manifest: PublicVolumeManifest | null | undefined,
  page: number,
  options: ResolveManifestPageOptions = {},
): Promise<ResolvedManifestPageAsset> {
  if (!manifest) {
    return {
      kind: "missing",
      bookId: "",
      languageId: "",
      volumeId: "",
      page,
    };
  }

  const extension = manifest.extension ?? "png";
  const cachedPage = await getCachedPageInfo(
    manifest.bookId,
    manifest.languageId,
    manifest.volumeId,
    page,
    extension,
  );

  if (cachedPage.exists && cachedPage.uri) {
    return {
      kind: "local",
      source: { uri: cachedPage.uri },
      uri: cachedPage.uri,
      cacheUri: cachedPage.uri,
      bookId: manifest.bookId,
      languageId: manifest.languageId,
      volumeId: manifest.volumeId,
      page,
    };
  }

  const remoteUri = getManifestPageUrl(manifest, page);
  if (!remoteUri) {
    return {
      kind: "missing",
      bookId: manifest.bookId,
      languageId: manifest.languageId,
      volumeId: manifest.volumeId,
      page,
    };
  }

  if (options.cacheRemote) {
    const cachedUri = await cacheRemotePageOnce(
      manifest.bookId,
      manifest.languageId,
      manifest.volumeId,
      page,
      remoteUri,
      extension,
    );

    if (cachedUri) {
      return {
        kind: "local",
        source: { uri: cachedUri },
        uri: cachedUri,
        cacheUri: cachedUri,
        bookId: manifest.bookId,
        languageId: manifest.languageId,
        volumeId: manifest.volumeId,
        page,
      };
    }
  }

  return {
    kind: "remote",
    source: { uri: remoteUri },
    uri: remoteUri,
    cacheUri:
      getCachedPageUri(
        manifest.bookId,
        manifest.languageId,
        manifest.volumeId,
        page,
        extension,
      ) ?? undefined,
    bookId: manifest.bookId,
    languageId: manifest.languageId,
    volumeId: manifest.volumeId,
    page,
  };
}

export async function prefetchManifestPageAssets(
  manifest: PublicVolumeManifest | null | undefined,
  pages: number[],
) {
  if (!manifest) {
    return;
  }

  await Promise.all(
    pages.map((page) =>
      resolveManifestPageAsset(manifest, page, { cacheRemote: true }).catch(() => null),
    ),
  );
}

export async function downloadVolumeAssets(
  manifest: PublicVolumeManifest | null | undefined,
  onProgress?: (completedPages: number, totalPages: number) => void,
) {
  if (!manifest) {
    return 0;
  }

  let completed = 0;

  for (let page = 1; page <= manifest.totalPages; page += 1) {
    const result = await resolveManifestPageAsset(manifest, page, {
      cacheRemote: true,
    });

    if (result.kind === "local") {
      completed += 1;
      onProgress?.(completed, manifest.totalPages);
    }
  }

  return completed;
}

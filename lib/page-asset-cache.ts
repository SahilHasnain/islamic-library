import * as FileSystem from "expo-file-system/legacy";

const CACHE_ROOT = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}library-page-assets/`
  : null;

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function getPageFilename(page: number, extension = "png") {
  return `page-${String(page).padStart(3, "0")}.${extension}`;
}

export function getVolumeCacheDirectory(
  bookId: string,
  languageId: string,
  volumeId: string,
) {
  if (!CACHE_ROOT) {
    return null;
  }

  return `${CACHE_ROOT}${sanitizeSegment(bookId)}/${sanitizeSegment(languageId)}/${sanitizeSegment(volumeId)}/`;
}

export function getCachedPageUri(
  bookId: string,
  languageId: string,
  volumeId: string,
  page: number,
  extension = "png",
) {
  const volumeDirectory = getVolumeCacheDirectory(bookId, languageId, volumeId);
  if (!volumeDirectory) {
    return null;
  }

  return `${volumeDirectory}${getPageFilename(page, extension)}`;
}

export async function ensureVolumeCacheDirectory(
  bookId: string,
  languageId: string,
  volumeId: string,
) {
  const volumeDirectory = getVolumeCacheDirectory(bookId, languageId, volumeId);
  if (!volumeDirectory) {
    return null;
  }

  await FileSystem.makeDirectoryAsync(volumeDirectory, { intermediates: true });
  return volumeDirectory;
}

export async function getCachedPageInfo(
  bookId: string,
  languageId: string,
  volumeId: string,
  page: number,
  extension = "png",
) {
  const uri = getCachedPageUri(bookId, languageId, volumeId, page, extension);
  if (!uri) {
    return { exists: false, uri: null };
  }

  const info = await FileSystem.getInfoAsync(uri);
  return {
    exists: info.exists,
    uri,
  };
}

export async function cacheRemotePage(
  bookId: string,
  languageId: string,
  volumeId: string,
  page: number,
  remoteUri: string,
  extension = "png",
) {
  const targetUri = getCachedPageUri(bookId, languageId, volumeId, page, extension);
  if (!targetUri) {
    return null;
  }

  await ensureVolumeCacheDirectory(bookId, languageId, volumeId);

  const existingInfo = await FileSystem.getInfoAsync(targetUri);
  if (existingInfo.exists) {
    return targetUri;
  }

  await FileSystem.downloadAsync(remoteUri, targetUri);
  return targetUri;
}

export async function getCachedPageCount(
  bookId: string,
  languageId: string,
  volumeId: string,
  extension = "png",
) {
  const volumeDirectory = getVolumeCacheDirectory(bookId, languageId, volumeId);
  if (!volumeDirectory) {
    return 0;
  }

  const info = await FileSystem.getInfoAsync(volumeDirectory);
  if (!info.exists) {
    return 0;
  }

  const entries = await FileSystem.readDirectoryAsync(volumeDirectory);
  return entries.filter((entry) => entry.endsWith(`.${extension}`)).length;
}

export async function removeVolumeCache(
  bookId: string,
  languageId: string,
  volumeId: string,
) {
  const volumeDirectory = getVolumeCacheDirectory(bookId, languageId, volumeId);
  if (!volumeDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(volumeDirectory);
  if (!info.exists) {
    return;
  }

  await FileSystem.deleteAsync(volumeDirectory, { idempotent: true });
}

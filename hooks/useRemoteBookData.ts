import { useEffect, useMemo, useState } from "react";

import type {
  PublicBookMetadata,
  PublicBookMetadataLanguage,
  PublicBookMetadataVolume,
  PublicCatalogBook,
  PublicVolumeManifest,
} from "../data/types";
import { useRemoteCatalog } from "./useRemoteCatalog";

async function fetchJson<T>(url: string) {
  const response = await fetch(normalizeJsonAssetUrl(url), {
    headers: {
      "Cache-Control": "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(`request-failed:${response.status}`);
  }

  return (await response.json()) as T;
}

function normalizeJsonAssetUrl(url: string) {
  const match = url.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@/]+)@([^/]+)\/(.+)$/);
  if (!match) {
    return url;
  }

  const [, owner, repo, branch, assetPath] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${assetPath}`;
}

function withCacheBust(url: string, cacheKey: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
}

function getOrderedLanguages(languages: PublicBookMetadataLanguage[]) {
  return [...languages].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.title.localeCompare(right.title);
  });
}

function getOrderedVolumes(volumes: PublicBookMetadataVolume[]) {
  return [...volumes].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.title.localeCompare(right.title);
  });
}

export function useRemoteBookData(
  bookId?: string,
  languageId?: string,
  volumeId?: string,
) {
  const { catalog, error: catalogError, isLoading: isCatalogLoading, source } = useRemoteCatalog();
  const [metadata, setMetadata] = useState<PublicBookMetadata | null>(null);
  const [manifest, setManifest] = useState<PublicVolumeManifest | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [isManifestLoading, setIsManifestLoading] = useState(false);

  const catalogBook = useMemo<PublicCatalogBook | undefined>(() => {
    if (!catalog || !bookId) {
      return undefined;
    }

    return catalog.books.find((book) => book.id === bookId);
  }, [bookId, catalog]);

  const selectedLanguage = useMemo<PublicBookMetadataLanguage | undefined>(() => {
    if (!metadata) {
      return undefined;
    }

    const orderedLanguages = getOrderedLanguages(metadata.languages);

    return (
      orderedLanguages.find((language) => language.id === languageId) ??
      orderedLanguages.find((language) => language.id === metadata.defaultLanguageId) ??
      orderedLanguages[0]
    );
  }, [languageId, metadata]);

  const selectedVolume = useMemo<PublicBookMetadataVolume | undefined>(() => {
    if (!selectedLanguage) {
      return undefined;
    }

    const orderedVolumes = getOrderedVolumes(selectedLanguage.volumes);

    return (
      orderedVolumes.find((volume) => volume.id === volumeId) ??
      orderedVolumes.find((volume) => volume.id === selectedLanguage.defaultVolumeId) ??
      orderedVolumes[0]
    );
  }, [selectedLanguage, volumeId]);

  const remoteState = useMemo(() => {
    if (!catalogBook) {
      return "not-in-catalog" as const;
    }

    if (isMetadataLoading || isManifestLoading) {
      return "loading" as const;
    }

    if (metadataError) {
      return "metadata-error" as const;
    }

    if (!metadata) {
      return "metadata-missing" as const;
    }

    if (!selectedLanguage) {
      return "language-missing" as const;
    }

    if (!selectedVolume) {
      return "volume-missing" as const;
    }

    if (manifestError) {
      return "manifest-error" as const;
    }

    if (!manifest) {
      return "manifest-missing" as const;
    }

    return "ready" as const;
  }, [
    catalogBook,
    isManifestLoading,
    isMetadataLoading,
    manifest,
    manifestError,
    metadata,
    metadataError,
    selectedLanguage,
    selectedVolume,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadMetadata() {
      if (!catalogBook?.metadataUrl) {
        if (isMounted) {
          setMetadata(null);
          setMetadataError(null);
          setIsMetadataLoading(false);
        }
        return;
      }

      try {
        setIsMetadataLoading(true);
        const metadataUrl = withCacheBust(
          catalogBook.metadataUrl,
          catalog?.version ?? catalog?.generatedAt ?? "metadata",
        );
        const nextMetadata = await fetchJson<PublicBookMetadata>(metadataUrl);
        if (!isMounted) {
          return;
        }

        setMetadata(nextMetadata);
        setMetadataError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setMetadata(null);
        setMetadataError(loadError instanceof Error ? loadError.message : "metadata-load-failed");
      } finally {
        if (isMounted) {
          setIsMetadataLoading(false);
        }
      }
    }

    void loadMetadata();

    return () => {
      isMounted = false;
    };
  }, [catalog?.generatedAt, catalog?.version, catalogBook?.metadataUrl]);

  useEffect(() => {
    let isMounted = true;

    async function loadManifest() {
      if (!selectedVolume?.manifestUrl) {
        if (isMounted) {
          setManifest(null);
          setManifestError(null);
          setIsManifestLoading(false);
        }
        return;
      }

      try {
        setIsManifestLoading(true);
        const manifestUrl = withCacheBust(
          selectedVolume.manifestUrl,
          catalog?.version ?? catalog?.generatedAt ?? `${metadata?.id ?? bookId ?? "book"}-${metadata?.defaultLanguageId ?? "language"}`,
        );
        const nextManifest = await fetchJson<PublicVolumeManifest>(manifestUrl);
        if (!isMounted) {
          return;
        }

        setManifest(nextManifest);
        setManifestError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setManifest(null);
        setManifestError(loadError instanceof Error ? loadError.message : "manifest-load-failed");
      } finally {
        if (isMounted) {
          setIsManifestLoading(false);
        }
      }
    }

    void loadManifest();

    return () => {
      isMounted = false;
    };
  }, [bookId, catalog?.generatedAt, catalog?.version, metadata?.defaultLanguageId, metadata?.id, selectedVolume?.manifestUrl]);

  return {
    catalogBooks: catalog?.books ?? [],
    catalogBook,
    catalogError,
    isCatalogLoading,
    source,
    metadata,
    metadataError,
    isMetadataLoading,
    selectedLanguage,
    selectedVolume,
    manifest,
    manifestError,
    isManifestLoading,
    remoteState,
    hasRemoteBook: Boolean(catalogBook),
    hasRemoteMetadata: Boolean(metadata),
    hasRemoteManifest: Boolean(manifest),
  };
}

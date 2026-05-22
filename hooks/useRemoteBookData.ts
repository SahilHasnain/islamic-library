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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`request-failed:${response.status}`);
  }

  return (await response.json()) as T;
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

    return metadata.languages.find((language) => language.id === languageId) ?? metadata.languages[0];
  }, [languageId, metadata]);

  const selectedVolume = useMemo<PublicBookMetadataVolume | undefined>(() => {
    if (!selectedLanguage) {
      return undefined;
    }

    return (
      selectedLanguage.volumes.find((volume) => volume.id === volumeId) ??
      selectedLanguage.volumes[0]
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
        const nextMetadata = await fetchJson<PublicBookMetadata>(catalogBook.metadataUrl);
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
  }, [catalogBook?.metadataUrl]);

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
        const nextManifest = await fetchJson<PublicVolumeManifest>(selectedVolume.manifestUrl);
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
  }, [selectedVolume?.manifestUrl]);

  return {
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

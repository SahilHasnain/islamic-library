import { useEffect, useState } from "react";

import type { PublicCatalog } from "../data/types";
import { loadJsonEntry, saveJsonEntry } from "../lib/library-data-cache";

const DEFAULT_ENDPOINT = "http://35.200.174.46/v1";
const DEFAULT_BUCKET_ID = "public_assets";
const DEFAULT_CATALOG_FILE_ID = "catalog";
const CATALOG_CACHE_KEY = "catalog";

function buildCatalogUrl(): string {
  const override = process.env.EXPO_PUBLIC_LIBRARY_CATALOG_URL;
  if (override) {
    return override;
  }

  const endpoint = (process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || DEFAULT_ENDPOINT)
    .trim()
    .replace(/\/+$/, "");
  const projectId = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || "";
  const bucketId = process.env.EXPO_PUBLIC_APPWRITE_PUBLIC_BUCKET_ID || DEFAULT_BUCKET_ID;
  const fileId = process.env.EXPO_PUBLIC_APPWRITE_CATALOG_FILE_ID || DEFAULT_CATALOG_FILE_ID;

  const projectQuery = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
  return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view${projectQuery}`;
}

export function useRemoteCatalog() {
  const catalogUrl = buildCatalogUrl();
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(catalogUrl));
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"remote" | "fallback">("fallback");

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      if (!catalogUrl) {
        if (isMounted) {
          setCatalog(null);
          setIsLoading(false);
          setSource("fallback");
        }
        return;
      }

      // Serve the cached catalog immediately (fast, local) so screens render
      // without waiting on the network.
      const cachedEntry = await loadJsonEntry<PublicCatalog>(CATALOG_CACHE_KEY);
      if (isMounted && cachedEntry) {
        setCatalog(cachedEntry.data);
        setSource("fallback");
        setError(null);
        setIsLoading(false);
      }

      try {
        const response = await fetch(catalogUrl, {
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
        });
        if (!response.ok) {
          throw new Error(`catalog-request-failed:${response.status}`);
        }

        const payload = (await response.json()) as PublicCatalog;
        if (!isMounted) {
          return;
        }

        setCatalog(payload);
        setSource("remote");
        setError(null);
        setIsLoading(false);
        void saveJsonEntry(
          CATALOG_CACHE_KEY,
          payload.version ?? payload.generatedAt ?? "catalog",
          payload,
        );
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        if (!cachedEntry) {
          setCatalog(null);
          setError(loadError instanceof Error ? loadError.message : "catalog-load-failed");
        }
        setIsLoading(false);
      }
    }

    void loadCatalog();

    return () => {
      isMounted = false;
    };
  }, [catalogUrl]);

  return {
    catalog,
    catalogUrl,
    error,
    hasRemoteCatalog: Boolean(catalog?.books?.length),
    isConfigured: Boolean(catalogUrl),
    isLoading,
    source,
  };
}

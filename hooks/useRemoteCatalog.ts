import { useEffect, useState } from "react";

import type { PublicCatalog } from "../data/types";

const catalogUrl = process.env.EXPO_PUBLIC_LIBRARY_CATALOG_URL;

export function useRemoteCatalog() {
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

      try {
        const response = await fetch(catalogUrl);
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
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setCatalog(null);
        setSource("fallback");
        setError(loadError instanceof Error ? loadError.message : "catalog-load-failed");
        setIsLoading(false);
      }
    }

    void loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

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

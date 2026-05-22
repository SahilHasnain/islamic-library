import { useEffect, useState } from "react";

import type { PublicVolumeManifest, ResolvedManifestPageAsset } from "../data/types";
import { resolveManifestPageAsset } from "../lib/page-asset-resolver";

type ResolvedManifestPageAssetState = {
  asset: ResolvedManifestPageAsset | null;
  isLoading: boolean;
};

export function useResolvedManifestPageAsset(
  manifest: PublicVolumeManifest | null | undefined,
  page: number,
) {
  const [state, setState] = useState<ResolvedManifestPageAssetState>({
    asset: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    setState((previousState) => ({
      asset:
        previousState.asset?.bookId === manifest?.bookId &&
        previousState.asset?.languageId === manifest?.languageId &&
        previousState.asset?.volumeId === manifest?.volumeId &&
        previousState.asset?.page === page
          ? previousState.asset
          : null,
      isLoading: true,
    }));

    void resolveManifestPageAsset(manifest, page, { cacheRemote: true }).then((asset) => {
      if (cancelled) {
        return;
      }

      setState({
        asset,
        isLoading: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [manifest, page]);

  return state;
}

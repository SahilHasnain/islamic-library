"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ViewerSection = {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
};

type ViewerVolume = {
  id: string;
  title?: string;
  manifestUrl?: string;
  printedPageStartPage?: number;
  sections?: ViewerSection[];
};

type ViewerMetadata = {
  title?: string;
  languages?: {
    id: string;
    title?: string;
    volumes?: ViewerVolume[];
  }[];
};

type ViewerManifest = {
  totalPages: number;
  baseUrl?: string;
  filePattern?: string;
  pages?: {
    page: number;
    fileName: string;
    url?: string;
    width?: number;
    height?: number;
  }[];
};

async function fetchJson<T>(url: string) {
  const response = await fetch(`/api/assets/json?url=${encodeURIComponent(url)}`, {
    headers: { "Cache-Control": "no-cache" },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function getPageImageUrl(manifest: ViewerManifest, page: number) {
  const manifestPage = manifest.pages?.find((entry) => entry.page === page);
  if (manifestPage?.url) return manifestPage.url;

  const fileName = manifestPage?.fileName ?? `page-${String(page).padStart(3, "0")}.png`;
  if (manifest.baseUrl) return `${manifest.baseUrl.replace(/\/$/, "")}/${fileName}`;

  return "";
}

function getPrintedPageLabel(page: number, printedPageStartPage?: number) {
  if (!printedPageStartPage || printedPageStartPage <= 1) {
    return `Printed page ${page}`;
  }

  if (page < printedPageStartPage) {
    return `Front matter ${page} of ${printedPageStartPage - 1}`;
  }

  return `Printed page ${page - printedPageStartPage + 1}`;
}

export function BookViewer({
  metadataUrl,
  languageId,
  volumeId,
}: {
  metadataUrl?: string;
  languageId?: string;
  volumeId?: string;
}) {
  const [metadata, setMetadata] = useState<ViewerMetadata | null>(null);
  const [manifest, setManifest] = useState<ViewerManifest | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [error, setError] = useState<string>();

  const selectedLanguage = useMemo(() => {
    return metadata?.languages?.find((language) => language.id === languageId) ?? metadata?.languages?.[0];
  }, [languageId, metadata?.languages]);

  const selectedVolume = useMemo(() => {
    return selectedLanguage?.volumes?.find((volume) => volume.id === volumeId) ?? selectedLanguage?.volumes?.[0];
  }, [selectedLanguage?.volumes, volumeId]);

  const currentSection = useMemo(() => {
    return selectedVolume?.sections?.find(
      (section) => page >= section.startPage && page <= section.endPage,
    );
  }, [page, selectedVolume?.sections]);

  useEffect(() => {
    let mounted = true;

    async function loadMetadata() {
      if (!metadataUrl) {
        setError("Missing metadataUrl.");
        return;
      }

      try {
        const nextMetadata = await fetchJson<ViewerMetadata>(metadataUrl);
        if (mounted) setMetadata(nextMetadata);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Metadata load failed.");
      }
    }

    void loadMetadata();
    return () => {
      mounted = false;
    };
  }, [metadataUrl]);

  useEffect(() => {
    let mounted = true;

    async function loadManifest() {
      if (!selectedVolume?.manifestUrl) return;

      try {
        const nextManifest = await fetchJson<ViewerManifest>(selectedVolume.manifestUrl);
        if (mounted) {
          setManifest(nextManifest);
          setPage(1);
          setPageInput("1");
        }
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Manifest load failed.");
      }
    }

    void loadManifest();
    return () => {
      mounted = false;
    };
  }, [selectedVolume?.manifestUrl]);

  const totalPages = manifest?.totalPages ?? 1;
  const imageUrl = manifest ? getPageImageUrl(manifest, page) : "";

  function moveToPage(nextPage: number) {
    const safePage = Math.min(Math.max(nextPage, 1), totalPages);
    setPage(safePage);
    setPageInput(String(safePage));
  }

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-6 text-stone-50 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-4 rounded-3xl border border-stone-800 bg-stone-900/80 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="text-xs uppercase tracking-[0.24em] text-amber-300">Admin Console</Link>
            <h1 className="mt-2 text-2xl font-semibold text-stone-50">{metadata?.title || "Book Viewer"}</h1>
            <p className="mt-1 text-sm text-stone-400">
              {selectedLanguage?.title || selectedLanguage?.id || "Language"} / {selectedVolume?.title || selectedVolume?.id || "Volume"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={() => moveToPage(page - 1)} className="rounded-full border border-stone-700 px-4 py-2 text-stone-200 hover:border-amber-300">Prev</button>
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") moveToPage(Number(pageInput) || page);
              }}
              className="w-24 rounded-full border border-stone-700 bg-stone-950 px-4 py-2 text-center text-stone-100 outline-none focus:border-amber-300"
            />
            <button type="button" onClick={() => moveToPage(Number(pageInput) || page)} className="rounded-full bg-amber-300 px-4 py-2 font-medium text-stone-950">Go</button>
            <button type="button" onClick={() => moveToPage(page + 1)} className="rounded-full border border-stone-700 px-4 py-2 text-stone-200 hover:border-amber-300">Next</button>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-rose-900/60 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div> : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-300">
              <span>Rendered page {page} of {totalPages}</span>
              <span>{getPrintedPageLabel(page, selectedVolume?.printedPageStartPage)}</span>
              <span>{currentSection ? currentSection.title : "No section"}</span>
            </div>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={`Page ${page}`} className="mx-auto max-h-[78vh] max-w-full rounded-xl bg-white object-contain" />
            ) : (
              <div className="flex h-[60vh] items-center justify-center text-stone-400">Loading page...</div>
            )}
          </div>

          <aside className="space-y-4 rounded-3xl border border-stone-800 bg-stone-900/70 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Sections</p>
              <div className="mt-3 max-h-[70vh] space-y-2 overflow-auto pr-1">
                {selectedVolume?.sections?.length ? selectedVolume.sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => moveToPage(section.startPage)}
                    className={`block w-full rounded-2xl px-3 py-2 text-left text-xs transition ${currentSection?.id === section.id ? "bg-amber-300 text-stone-950" : "bg-stone-950 text-stone-300 hover:bg-stone-800"}`}
                  >
                    <span className="block font-medium">{section.title}</span>
                    <span className="mt-1 block opacity-70">Pages {section.startPage}-{section.endPage}</span>
                  </button>
                )) : <p className="text-sm text-stone-400">No sections in metadata.</p>}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { uploadPdfWithProgress } from "@/lib/appwrite-client";
import type {
  AiAnalysisJob,
  AiAnalysisDraftPayload,
  AiAnalysisResult,
  AiRecommendationRerankResult,
  JobListItem,
  MonitoringSnapshot,
  MonitoringSummary,
  PublishEventRecord,
  RecoveryAction,
} from "@/lib/ingestion";

const categories = [
  "Aqaid",
  "Baghare Tehreer",
  "Dua",
  "Fazail",
  "Fiqh",
  "Hadees",
  "Islahe Aamaal",
  "Kalaam",
  "Knowledge",
  "Mahnama",
  "Radde Bid'aat",
  "Safarname",
  "Seerat",
  "Tarikh",
  "Tasawwuf",
  "Tehqeeq",
  "Zubaano Bayaan",
];
const jobFilters = [
  { label: "All", value: "all" },
  { label: "Queued", value: "queued" },
  { label: "Active", value: "active" },
  { label: "Failed", value: "failed" },
  { label: "Published", value: "published" },
] as const;

const quickAnalysisAsJob = process.env.NEXT_PUBLIC_AI_QUICK_ANALYSIS_AS_JOB === "true";
const quickAnalysisMaxPages = Number(process.env.NEXT_PUBLIC_AI_QUICK_ANALYSIS_MAX_PAGES || "40");

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugifyTitle(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || fallback;
}

function normalizeLanguageId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function languageTitleFromId(value: string) {
  const normalized = normalizeLanguageId(value);
  if (!normalized) {
    return "";
  }

  return normalized
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function validateAiDraftForReview(draft: AiAnalysisResult["draft"] | null | undefined) {
  const issues: AiDraftValidationIssue[] = [];
  if (!draft) {
    return issues;
  }

  if (draft.category && !categories.includes(draft.category)) {
    issues.push({ severity: "error", message: `Invalid category: ${draft.category}.` });
  }

  return issues;
}

function keywordSet(value: string) {
  const stopWords = new Set(["the", "and", "for", "with", "book", "volume", "hai", "aur", "ke", "ka", "ki"]);
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 3 && !stopWords.has(word)),
  );
}

function buildAiDraftStorageKey(bookSlug: string, sourceKey?: string) {
  return `islamic-library:ai-draft:${bookSlug || "unknown"}:${sourceKey || "default"}`;
}

type SubmissionState = {
  error?: string;
  message?: string;
  jobId?: string;
  slug?: string;
  uploadProgress?: number;
};

type MetadataFormState = {
  bookSlug: string;
  title: string;
  subtitle: string;
  author: string;
  description: string;
  category: string;
  nextRecommendedBookId: string;
  recommendations: RecommendationEditorItem[];
  defaultLanguageId: string;
  requestedBy: string;
  languages: EditionLanguageEditorItem[];
};

type EditionVolumeEditorItem = {
  id: string;
  title: string;
  subtitle: string;
  order: string;
  printedPageStartPage: string;
  manifestUrl: string;
  introNote: string;
  todayTarget: string;
  sections: SectionEditorItem[];
  tocEntries: TocEntryEditorItem[];
};

type RecommendationEditorItem = {
  bookId: string;
  reason: string;
  type: string;
  score: string;
};

type EditionLanguageEditorItem = {
  id: string;
  title: string;
  nativeTitle: string;
  summary: string;
  order: string;
  defaultVolumeId: string;
  volumes: EditionVolumeEditorItem[];
};

type SectionEditorItem = {
  id: string;
  title: string;
  subtitle: string;
  kind: string;
  startPage: string;
  endPage: string;
  entryPage: string;
  order: string;
  estimatedMinutes: string;
  description: string;
};

type TocEntryEditorItem = {
  title: string;
  printedPage: number | null;
  renderedPage: number | null;
  level: number;
};

type AiDraftValidationIssue = {
  severity: "warning" | "error";
  message: string;
};

type RecommendationCandidate = {
  slug: string;
  title: string;
  author?: string;
  category?: string;
  score: number;
  reasons: string[];
};

type StoredAiDraft = AiAnalysisDraftPayload;

type PublishedMetadataPayload = {
  title?: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  nextRecommendedBookId?: string;
  recommendations?: {
    bookId?: string;
    reason?: string;
    type?: string;
    score?: number;
  }[];
  defaultLanguageId?: string;
  languages?: {
    id: string;
    title?: string;
    nativeTitle?: string;
    summary?: string;
    order?: number;
    defaultVolumeId?: string;
    volumes?: {
      id: string;
      title?: string;
      subtitle?: string;
      order?: number;
      manifestUrl?: string;
      printedPageStartPage?: number;
      introNote?: string;
      todayTarget?: string;
      sections?: unknown[];
      tocEntries?: unknown[];
    }[];
  }[];
};

function createEmptyVolume(): EditionVolumeEditorItem {
  return {
    id: "",
    title: "",
    subtitle: "",
    order: "",
    printedPageStartPage: "",
    manifestUrl: "",
    introNote: "",
    todayTarget: "",
    sections: [],
    tocEntries: [],
  };
}

function createEmptySection(): SectionEditorItem {
  return {
    id: "",
    title: "",
    subtitle: "",
    kind: "custom",
    startPage: "",
    endPage: "",
    entryPage: "",
    order: "",
    estimatedMinutes: "",
    description: "",
  };
}

function normalizeSections(value: unknown[] | undefined): SectionEditorItem[] {
  if (!value || value.length === 0) {
    return [];
  }

  return value.map((section) => {
    const item = section as Record<string, unknown>;
    return {
      id: String(item.id || ""),
      title: String(item.title || ""),
      subtitle: String(item.subtitle || ""),
      kind: String(item.kind || "custom"),
      startPage: item.startPage == null ? "" : String(item.startPage),
      endPage: item.endPage == null ? "" : String(item.endPage),
      entryPage: item.entryPage == null ? "" : String(item.entryPage),
      order: item.order == null ? "" : String(item.order),
      estimatedMinutes: item.estimatedMinutes == null ? "" : String(item.estimatedMinutes),
      description: String(item.description || ""),
    };
  });
}

function normalizeTocEntries(value: unknown[] | undefined): TocEntryEditorItem[] {
  if (!value || value.length === 0) {
    return [];
  }

  return value
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const title = String(item.title || "").trim();
      const printedPage = Number(item.printedPage);
      const renderedPage = Number(item.renderedPage);
      const level = Number(item.level);

      if (!title) {
        return null;
      }

      return {
        title,
        printedPage: Number.isFinite(printedPage) && printedPage > 0 ? printedPage : null,
        renderedPage: Number.isFinite(renderedPage) && renderedPage > 0 ? renderedPage : null,
        level: Number.isFinite(level) && level > 0 ? Math.floor(level) : 1,
      };
    })
    .filter((entry): entry is TocEntryEditorItem => Boolean(entry));
}

function normalizeLanguages(
  value: PublishedMetadataPayload["languages"],
  fallbackLanguageId?: string,
  fallbackVolumeId?: string,
): EditionLanguageEditorItem[] {
  if (!value || value.length === 0) {
    if (!fallbackLanguageId) {
      return [];
    }

    return [
      {
        id: normalizeLanguageId(fallbackLanguageId),
        title: languageTitleFromId(fallbackLanguageId),
        nativeTitle: "",
        summary: "",
        order: "1",
        defaultVolumeId: fallbackVolumeId || "volume1",
        volumes: [
          {
            id: fallbackVolumeId || "volume1",
            title: fallbackVolumeId || "Volume 1",
            subtitle: "",
            order: "1",
            printedPageStartPage: "",
            manifestUrl: "",
            introNote: "",
            todayTarget: "",
            sections: [],
            tocEntries: [],
          },
        ],
      },
    ];
  }

  return value.map((language, languageIndex) => ({
    id: normalizeLanguageId(String(language.id || "")),
    title: languageTitleFromId(String(language.id || language.title || "")),
    nativeTitle: String(language.nativeTitle || ""),
    summary: String(language.summary || ""),
    order: language.order == null ? String(languageIndex + 1) : String(language.order),
    defaultVolumeId: String(language.defaultVolumeId || ""),
    volumes:
      language.volumes?.length
        ? language.volumes.map((volume, volumeIndex) => ({
          id: String(volume.id || ""),
          title: String(volume.title || volume.id || ""),
          subtitle: String(volume.subtitle || ""),
          order: volume.order == null ? String(volumeIndex + 1) : String(volume.order),
          printedPageStartPage:
            volume.printedPageStartPage == null ? "" : String(volume.printedPageStartPage),
          manifestUrl: String(volume.manifestUrl || ""),
          introNote: String(volume.introNote || ""),
          todayTarget: String(volume.todayTarget || ""),
          sections: normalizeSections(volume.sections),
          tocEntries: normalizeTocEntries(volume.tocEntries),
        }))
        : [createEmptyVolume()],
  }));
}

function buildLanguagePayload(languages: EditionLanguageEditorItem[]) {
  return languages
    .filter((language) => language.id.trim() || language.title.trim())
    .map((language, languageIndex) => {
      const id = normalizeLanguageId(language.id);
      const title = languageTitleFromId(id);

      if (!id) {
        throw new Error(`Language ${languageIndex + 1} is incomplete.`);
      }

      const volumes = language.volumes
        .filter((volume) => volume.id.trim() || volume.title.trim())
        .map((volume, volumeIndex) => {
          const volumeId = volume.id.trim();
          const volumeTitle = volume.title.trim();

          if (!volumeId || !volumeTitle) {
            throw new Error(`Volume ${volumeIndex + 1} in ${title} is incomplete.`);
          }

          return {
            id: volumeId,
            title: volumeTitle,
            subtitle: volume.subtitle.trim() || undefined,
            order: volume.order.trim() ? Number(volume.order) : undefined,
            printedPageStartPage: volume.printedPageStartPage.trim()
              ? Number(volume.printedPageStartPage)
              : undefined,
            manifestUrl: volume.manifestUrl.trim() || undefined,
            introNote: volume.introNote.trim() || undefined,
            todayTarget: volume.todayTarget.trim() || undefined,
            tocEntries: buildTocPayload(volume.tocEntries),
          };
        });

      if (volumes.length === 0) {
        throw new Error(`Language ${title} needs at least one volume.`);
      }

      return {
        languageId: id,
        title,
        nativeTitle: undefined,
        summary: language.summary.trim() || undefined,
        order: language.order.trim() ? Number(language.order) : undefined,
        defaultVolumeId: language.defaultVolumeId.trim() || undefined,
        volumes,
      };
    });
}

function buildTocPayload(tocEntries: TocEntryEditorItem[]) {
  return tocEntries
    .filter((entry) => entry.title.trim())
    .map((entry) => ({
      title: entry.title.trim(),
      printedPage: entry.printedPage && entry.printedPage > 0 ? entry.printedPage : null,
      renderedPage: entry.renderedPage && entry.renderedPage > 0 ? entry.renderedPage : null,
      level: entry.level && entry.level > 0 ? Math.floor(entry.level) : 1,
    }));
}

function buildRecommendationPayload(recommendations: RecommendationEditorItem[]) {
  return recommendations
    .map((recommendation) => {
      const bookId = recommendation.bookId.trim();
      if (!bookId) {
        return null;
      }

      return {
        bookId,
        reason: recommendation.reason.trim() || undefined,
        type: recommendation.type.trim() || undefined,
        score: recommendation.score.trim() ? Number(recommendation.score) : undefined,
      };
    })
    .filter(Boolean);
}

function formatDate(value?: string) {
  if (!value) {
    return "Not yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(startedAt?: string, finishedAt?: string) {
  if (!startedAt) {
    return "Waiting";
  }

  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "Unknown";
  }

  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 1) {
    return "<1 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

function getStatusTone(status: JobListItem["job"]["status"]) {
  if (status === "failed") {
    return "bg-rose-950/60 text-rose-200 border-rose-900/60";
  }

  if (status === "published") {
    return "bg-emerald-950/60 text-emerald-200 border-emerald-900/60";
  }

  if (status === "processing" || status === "validating" || status === "publishing") {
    return "bg-amber-950/60 text-amber-200 border-amber-900/60";
  }

  return "bg-stone-900 text-stone-200 border-stone-700";
}

export function AdminConsole({ initialSnapshot }: { initialSnapshot: MonitoringSnapshot }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<SubmissionState>({});
  const [jobs, setJobs] = useState<JobListItem[]>(initialSnapshot.jobs);
  const [summary, setSummary] = useState<MonitoringSummary>(initialSnapshot.summary);
  const [events, setEvents] = useState<PublishEventRecord[]>(initialSnapshot.events);
  const [jobsError, setJobsError] = useState<string>();
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [dispatchingJobId, setDispatchingJobId] = useState<string>();
  const [recoveringJobId, setRecoveringJobId] = useState<string>();
  const [retryingPushJobId, setRetryingPushJobId] = useState<string>();
  const [jobFilter, setJobFilter] = useState<(typeof jobFilters)[number]["value"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeWorkspace, setActiveWorkspace] = useState<"upload" | "edit" | "jobs" | "events">("edit");
  const [isRepublishingMetadata, setIsRepublishingMetadata] = useState(false);
  const [isAnalyzingMetadata, setIsAnalyzingMetadata] = useState(false);
  const [isRerankingRecommendations, setIsRerankingRecommendations] = useState(false);
  const [aiAnalysisDepth, setAiAnalysisDepth] = useState<"quick" | "full">("quick");
  const [aiAnalysisJobStatus, setAiAnalysisJobStatus] = useState<string>();
  const [aiAnalysisJobInfo, setAiAnalysisJobInfo] = useState<AiAnalysisJob | null>(null);
  const [showAdvancedMetadata, setShowAdvancedMetadata] = useState(false);
  const [selectedAdvancedLanguageIndex, setSelectedAdvancedLanguageIndex] = useState(0);
  const [selectedAdvancedVolumeIndex, setSelectedAdvancedVolumeIndex] = useState(0);
  const [metadataState, setMetadataState] = useState<SubmissionState>({});
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisResult | null>(null);
  const [aiDraftJson, setAiDraftJson] = useState("");
  const [aiTocJson, setAiTocJson] = useState("");
  const [manualTocText, setManualTocText] = useState("");
  const [selectedAiSourceKey, setSelectedAiSourceKey] = useState("");
  const [selectedRecommendationSlug, setSelectedRecommendationSlug] = useState("");
  const [metadataForm, setMetadataForm] = useState<MetadataFormState>({
    bookSlug: "",
    title: "",
    subtitle: "",
    author: "",
    description: "",
    category: "Knowledge",
    nextRecommendedBookId: "",
    recommendations: [],
    defaultLanguageId: "",
    requestedBy: "admin-console",
    languages: [],
  });

  async function uploadPdfDirect(file: File, onProgress?: (progress: number) => void) {
    try {
      const fileId = await uploadPdfWithProgress(file, (progressInfo) => {
        const percentage = Math.round((progressInfo.chunksUploaded / progressInfo.chunksTotal) * 100);
        onProgress?.(percentage);
      });
      return fileId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF upload failed.";
      throw new Error(message);
    }
  }

  const filteredJobs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return jobs.filter(({ job, book }) => {
      const matchesFilter =
        jobFilter === "all" ||
        (jobFilter === "queued" && (job.status === "queued" || job.status === "retrying")) ||
        (jobFilter === "active" &&
          (job.status === "processing" ||
            job.status === "validating" ||
            job.status === "publishing")) ||
        (jobFilter === "failed" && job.status === "failed") ||
        (jobFilter === "published" && job.status === "published");

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        book?.title,
        job.bookSlug,
        job.jobId,
        job.languageId,
        job.volumeId,
        job.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [jobFilter, jobs, searchQuery]);

  const knownBooks = useMemo(() => {
    const map = new Map<string, JobListItem["book"]>();
    jobs.forEach(({ book }) => {
      if (book?.slug) {
        map.set(book.slug, book);
      }
    });
    return Array.from(map.values()).filter(Boolean);
  }, [jobs]);

  const aiAnalysisSources = useMemo(() => {
    const slug = metadataForm.bookSlug.trim();
    if (!slug) {
      return [];
    }

    const map = new Map<string, {
      key: string;
      sourceFileId: string;
      languageId: string;
      volumeId: string;
      status: string;
      label: string;
    }>();

    jobs.forEach(({ job }) => {
      if (job.bookSlug !== slug || !job.sourceFileId) {
        return;
      }

      const key = `${job.languageId}::${job.volumeId}::${job.sourceFileId}`;
      if (map.has(key)) {
        return;
      }

      map.set(key, {
        key,
        sourceFileId: job.sourceFileId,
        languageId: job.languageId,
        volumeId: job.volumeId,
        status: job.status,
        label: `${job.languageId} / ${job.volumeId} (${job.status})`,
      });
    });

    return Array.from(map.values()).sort((left, right) => {
      if (left.status === "published" && right.status !== "published") {
        return -1;
      }
      if (left.status !== "published" && right.status === "published") {
        return 1;
      }
      return left.label.localeCompare(right.label);
    });
  }, [jobs, metadataForm.bookSlug]);

  const selectedAiAnalysisSource = useMemo(
    () => aiAnalysisSources.find((source) => source.key === selectedAiSourceKey) || aiAnalysisSources[0],
    [aiAnalysisSources, selectedAiSourceKey],
  );

  const aiDraftValidationIssues = useMemo(() => {
    if (!aiDraftJson.trim()) {
      return [];
    }

    try {
      const draft = JSON.parse(aiDraftJson) as AiAnalysisResult["draft"];
      return validateAiDraftForReview(draft);
    } catch {
      return [{ severity: "error", message: "AI draft JSON is not valid." }] satisfies AiDraftValidationIssue[];
    }
  }, [aiDraftJson]);

  const aiDraftSectionsForReview = useMemo(() => {
    if (!aiDraftJson.trim()) {
      return [];
    }

    try {
      const draft = JSON.parse(aiDraftJson) as AiAnalysisResult["draft"];
      return Array.isArray(draft?.sections) ? draft.sections : [];
    } catch {
      return [];
    }
  }, [aiDraftJson]);

  const aiDraftForReview = useMemo(() => {
    if (!aiDraftJson.trim()) {
      return null;
    }

    try {
      return JSON.parse(aiDraftJson) as AiAnalysisResult["draft"];
    } catch {
      return null;
    }
  }, [aiDraftJson]);

  const aiTocEntriesForReview = useMemo(() => {
    if (!aiTocJson.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(aiTocJson) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((entry) => {
        const item = entry as Partial<TocEntryEditorItem>;
          const printedPage = Number(item.printedPage);
          const renderedPage = Number(item.renderedPage);
          return {
            title: String(item.title || ""),
            printedPage: Number.isFinite(printedPage) && printedPage > 0 ? printedPage : null,
            renderedPage: Number.isFinite(renderedPage) && renderedPage > 0 ? renderedPage : null,
            level: Number.isFinite(Number(item.level)) ? Number(item.level) : 1,
          } satisfies TocEntryEditorItem;
      });
    } catch {
      return [];
    }
  }, [aiTocJson]);

  const recommendationCandidates = useMemo(() => {
    const draft = aiDraftForReview;
    const currentSlug = metadataForm.bookSlug.trim();
    if (!currentSlug) {
      return [];
    }

    const sourceText = [
      metadataForm.title,
      metadataForm.subtitle,
      metadataForm.description,
      draft?.title,
      draft?.description,
      draft?.summary,
      draft?.sections?.map((section) => section.title).join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    const sourceKeywords = keywordSet(sourceText);
    const sourceAuthor = String(draft?.author || metadataForm.author || "").trim().toLowerCase();
    const sourceCategory = String(draft?.category || metadataForm.category || "").trim();
    const sourceLanguage = String(draft?.languageId || selectedAiAnalysisSource?.languageId || metadataForm.defaultLanguageId || "").trim();

    return knownBooks
      .filter((book): book is NonNullable<typeof book> => Boolean(book))
      .filter((book) => book.slug !== currentSlug && book.status === "published")
      .map((book) => {
        let score = 0;
        const reasons: string[] = [];
        if (sourceCategory && book.category === sourceCategory) {
          score += 40;
          reasons.push(`same category: ${sourceCategory}`);
        }

        if (sourceAuthor && book.author?.trim().toLowerCase() === sourceAuthor) {
          score += 30;
          reasons.push(`same author: ${book.author}`);
        }

        if (sourceLanguage && book.languageId === sourceLanguage) {
          score += 15;
          reasons.push(`same language: ${sourceLanguage}`);
        }

        const candidateKeywords = keywordSet([book.title, book.subtitle, book.description, book.category].filter(Boolean).join(" "));
        const overlap = Array.from(sourceKeywords).filter((keyword) => candidateKeywords.has(keyword));
        if (overlap.length > 0) {
          const keywordScore = Math.min(20, overlap.length * 4);
          score += keywordScore;
          reasons.push(`keyword overlap: ${overlap.slice(0, 4).join(", ")}`);
        }

        return {
          slug: book.slug,
          title: book.title,
          author: book.author,
          category: book.category,
          score,
          reasons,
        } satisfies RecommendationCandidate;
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
  }, [aiDraftForReview, knownBooks, metadataForm, selectedAiAnalysisSource]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateMetadataForm() {
      const slug = metadataForm.bookSlug.trim();
      if (!slug) {
        return;
      }

      const knownBook = knownBooks.find((book) => book?.slug === slug);
      if (!knownBook?.metadataUrl) {
        return;
      }

      try {
        const response = await fetch(knownBook.metadataUrl, { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as PublishedMetadataPayload;
        if (!isMounted) {
          return;
        }

        const matchingLanguage =
          payload.languages?.find((language) => language.id === knownBook.languageId) ??
          payload.languages?.[0];
        setMetadataForm((current) => {
          if (current.bookSlug.trim() !== slug) {
            return current;
          }

          return {
            ...current,
            title: payload.title || current.title,
            subtitle: payload.subtitle || "",
            author: payload.author || "",
            description: payload.description || "",
            category: payload.category || current.category,
            nextRecommendedBookId: payload.nextRecommendedBookId || "",
            recommendations: Array.isArray(payload.recommendations)
              ? payload.recommendations.map((recommendation) => ({
                  bookId: String(recommendation.bookId || ""),
                  reason: String(recommendation.reason || ""),
                  type: String(recommendation.type || ""),
                  score: recommendation.score == null ? "" : String(recommendation.score),
                }))
              : [],
            defaultLanguageId:
              payload.defaultLanguageId ||
              matchingLanguage?.id ||
              current.defaultLanguageId,
            languages: normalizeLanguages(
              payload.languages,
              knownBook.languageId,
              knownBook.volumeId,
            ),
          };
        });
      } catch {
        // Keep the current draft values if the published metadata cannot be loaded.
      }
    }

    void hydrateMetadataForm();

    return () => {
      isMounted = false;
    };
  }, [knownBooks, metadataForm.bookSlug]);

  async function fetchJobs() {
    try {
      const response = await fetch("/api/jobs");
      const payload = (await response.json()) as MonitoringSnapshot & { error?: string };

      if (!response.ok) {
        setJobsError(payload.error || "Could not load jobs.");
        return;
      }

      setJobs(payload.jobs || []);
      setSummary(payload.summary);
      setEvents(payload.events || []);
    } catch {
      setJobsError("Could not load jobs.");
    } finally {
      setIsLoadingJobs(false);
    }
  }

  async function loadJobs() {
    setJobsError(undefined);
    setIsLoadingJobs(true);
    await fetchJobs();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setState({});

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const pdf = formData.get("pdf");

      if (!(pdf instanceof File) || pdf.size === 0) {
        setState({ error: "A source PDF is required." });
        return;
      }

      if (pdf.type !== "application/pdf" && !pdf.name.toLowerCase().endsWith(".pdf")) {
        setState({ error: "Only PDF uploads are supported." });
        return;
      }

      setState({ message: "Uploading source PDF..." });
      const sourceFileId = await uploadPdfDirect(pdf, (progress) => {
        setState({ message: `Uploading source PDF... ${progress}%`, uploadProgress: progress });
      });

      const requestBody = {
        title: String(formData.get("title") || ""),
        slug: String(formData.get("slug") || ""),
        subtitle: String(formData.get("subtitle") || ""),
        author: String(formData.get("author") || ""),
        category: String(formData.get("category") || ""),
        createdBy: String(formData.get("createdBy") || ""),
        languageId: String(formData.get("languageId") || ""),
        volumeId: String(formData.get("volumeId") || ""),
        printedPageStartPage: String(formData.get("printedPageStartPage") || ""),
        description: String(formData.get("description") || ""),
        sourceFileId,
      };

      const response = await fetch("/api/ingestion/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as SubmissionState;

      if (!response.ok) {
        setState({ error: payload.error || "Upload failed." });
        return;
      }

      setState({
        message: payload.message || "Ingestion job queued.",
        jobId: payload.jobId,
        slug: payload.slug,
      });
      form.reset();
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error while creating the ingestion job.";
      setState({ error: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDispatch(jobId: string) {
    setDispatchingJobId(jobId);
    setJobsError(undefined);

    try {
      const response = await fetch(`/api/ingestion/dispatch/${jobId}`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setJobsError(payload.error || "Dispatch failed.");
        return;
      }

      await loadJobs();
    } catch {
      setJobsError("Dispatch failed.");
    } finally {
      setDispatchingJobId(undefined);
    }
  }

  async function handleRecover(jobId: string, action: RecoveryAction) {
    setRecoveringJobId(jobId);
    setJobsError(undefined);

    try {
      const response = await fetch(`/api/ingestion/recover/${jobId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setJobsError(payload.error || "Recovery action failed.");
        return;
      }

      await loadJobs();
    } catch {
      setJobsError("Recovery action failed.");
    } finally {
      setRecoveringJobId(undefined);
    }
  }

  async function handleRetryPush(jobId: string) {
    setRetryingPushJobId(jobId);
    setJobsError(undefined);

    try {
      const response = await fetch(`/api/ingestion/retry-push/${jobId}`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setJobsError(payload.error || "Retry push failed.");
        return;
      }

      await loadJobs();
    } catch {
      setJobsError("Retry push failed.");
    } finally {
      setRetryingPushJobId(undefined);
    }
  }

  async function handleMetadataRepublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRepublishingMetadata(true);
    setMetadataState({});

    try {
      const languages = buildLanguagePayload(metadataForm.languages);
      const recommendations = buildRecommendationPayload(metadataForm.recommendations);
      if (
        metadataForm.nextRecommendedBookId &&
        metadataForm.nextRecommendedBookId === metadataForm.bookSlug.trim()
      ) {
        setMetadataState({ error: "Next recommended book cannot be the current book." });
        return;
      }

      if (recommendations.some((recommendation) => recommendation?.bookId === metadataForm.bookSlug.trim())) {
        setMetadataState({ error: "Related recommendations cannot include the current book." });
        return;
      }

      const response = await fetch("/api/books/republish-metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...metadataForm,
          recommendations,
          defaultLanguageId: metadataForm.defaultLanguageId.trim() || undefined,
          languages,
        }),
      });

      const payload = (await response.json()) as SubmissionState & { error?: string };
      if (!response.ok) {
        setMetadataState({ error: payload.error || "Metadata republish failed." });
        return;
      }

      setMetadataState({
        message: payload.message || "Published metadata updated.",
        slug: metadataForm.bookSlug,
      });
      await loadJobs();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Metadata republish failed.";
      setMetadataState({ error: message });
    } finally {
      setIsRepublishingMetadata(false);
    }
  }

  async function handleAiAnalyzeMetadata(analysisMode: "draft" | "toc-only" | "metadata-only" = "draft") {
    const slug = metadataForm.bookSlug.trim();
    const analysisSource = selectedAiAnalysisSource;
    if (!analysisSource?.sourceFileId) {
      setMetadataState({ error: "Select a book language/volume with a source PDF before running AI analysis." });
      return;
    }

    setIsAnalyzingMetadata(true);
    setMetadataState({});
    setAiAnalysis(null);
    setAiDraftJson("");
    setAiTocJson("");
    setAiAnalysisJobInfo(null);

    try {
      const requestBody = {
        sourceFileId: analysisSource.sourceFileId,
        maxPages: aiAnalysisDepth === "full" ? 0 : quickAnalysisMaxPages,
        analysisMode,
        context: {
          bookSlug: slug,
          title: metadataForm.title,
          subtitle: metadataForm.subtitle,
          author: metadataForm.author,
          category: metadataForm.category,
          languageId: analysisSource.languageId,
          volumeId: analysisSource.volumeId,
        },
      };

      if (aiAnalysisDepth === "full" || quickAnalysisAsJob || analysisMode !== "draft") {
        const modeLabel = analysisMode === "toc-only"
          ? "TOC"
          : analysisMode === "metadata-only"
            ? "Metadata"
            : aiAnalysisDepth === "full"
              ? "Full"
              : "Quick";
        setAiAnalysisJobStatus(`Starting ${modeLabel.toLowerCase()} analysis...`);
        const startResponse = await fetch("/api/ai/analyze/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const startPayload = (await startResponse.json()) as AiAnalysisJob & { error?: string };
        if (!startResponse.ok) {
          setMetadataState({ error: startPayload.error || "AI analysis failed." });
          return;
        }
        setAiAnalysisJobInfo(startPayload);

        const analysisId = startPayload.analysisId || startPayload.id;
        if (!analysisId) {
          setMetadataState({ error: "AI analysis did not return a job ID." });
          return;
        }

        for (let attempt = 0; attempt < 600; attempt += 1) {
          await wait(3000);
          const statusResponse = await fetch(`/api/ai/analyze/status?id=${encodeURIComponent(analysisId)}`);
          const statusPayload = (await statusResponse.json()) as AiAnalysisJob & { error?: string };
          if (!statusResponse.ok) {
            setMetadataState({ error: statusPayload.error || "AI analysis status failed." });
            return;
          }

          setAiAnalysisJobInfo(statusPayload);
          setAiAnalysisJobStatus(`${modeLabel} analysis ${statusPayload.phase || statusPayload.status}...`);
          if (statusPayload.status === "completed" && statusPayload.result) {
            setAiAnalysis(statusPayload.result);
            setAiDraftJson(statusPayload.result.draft ? JSON.stringify(statusPayload.result.draft, null, 2) : "");
            setAiTocJson(statusPayload.result.tocEntries ? JSON.stringify(statusPayload.result.tocEntries, null, 2) : "");
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                getAiDraftStorageKey(),
                JSON.stringify({
                  savedAt: new Date().toISOString(),
                  aiAnalysis: statusPayload.result,
                  aiDraftJson: statusPayload.result.draft ? JSON.stringify(statusPayload.result.draft, null, 2) : "",
                  aiTocJson: statusPayload.result.tocEntries ? JSON.stringify(statusPayload.result.tocEntries, null, 2) : "",
                  manualTocText,
                } satisfies StoredAiDraft),
              );
            }
            setMetadataState({
              message: statusPayload.result.aiEnabled
                ? "AI draft generated."
                : "PDF analyzed. Configure OPENAI_API_KEY for richer AI drafts.",
            });
            return;
          }

          if (statusPayload.status === "failed") {
            setMetadataState({ error: statusPayload.error || "AI analysis failed." });
            return;
          }
        }

        setMetadataState({ error: "AI analysis timed out while waiting for the worker." });
        return;
      }

      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as AiAnalysisResult & { error?: string };
      if (!response.ok) {
        setMetadataState({ error: payload.error || "AI analysis failed." });
        return;
      }

      setAiAnalysis(payload);
      setAiDraftJson(payload.draft ? JSON.stringify(payload.draft, null, 2) : "");
      setAiTocJson(payload.tocEntries ? JSON.stringify(payload.tocEntries, null, 2) : "");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          getAiDraftStorageKey(),
          JSON.stringify({
            savedAt: new Date().toISOString(),
            aiAnalysis: payload,
            aiDraftJson: payload.draft ? JSON.stringify(payload.draft, null, 2) : "",
            aiTocJson: payload.tocEntries ? JSON.stringify(payload.tocEntries, null, 2) : "",
            manualTocText,
          } satisfies StoredAiDraft),
        );
      }
      setMetadataState({ message: payload.aiEnabled ? "AI draft generated." : "PDF analyzed. Configure OPENAI_API_KEY for richer AI drafts." });
    } catch (error) {
      setMetadataState({ error: error instanceof Error ? error.message : "AI analysis failed." });
    } finally {
      setIsAnalyzingMetadata(false);
      setAiAnalysisJobStatus(undefined);
    }
  }

  function updateFirstVolume(updater: (volume: EditionVolumeEditorItem) => EditionVolumeEditorItem) {
    setMetadataForm((current) => ({
      ...current,
      languages: current.languages.map((language, languageIndex) => ({
        ...language,
        volumes: language.volumes.map((volume, volumeIndex) =>
          languageIndex === 0 && volumeIndex === 0 ? updater(volume) : volume,
        ),
      })),
    }));
  }

  function getEditableAiDraft() {
    if (!aiDraftJson.trim()) {
      return null;
    }

    try {
      return JSON.parse(aiDraftJson) as NonNullable<AiAnalysisResult["draft"]>;
    } catch {
      setMetadataState({ error: "AI draft JSON is not valid. Fix it before applying." });
      return null;
    }
  }

  async function copyAiDraftJson() {
    if (!aiDraftJson.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(aiDraftJson);
      setMetadataState({ message: "Copied AI draft JSON." });
    } catch {
      setMetadataState({ error: "Could not copy AI draft JSON." });
    }
  }

  function applyRecommendedBook(slug?: string) {
    const nextSlug = slug || selectedRecommendationSlug || recommendationCandidates[0]?.slug;
    if (!nextSlug) {
      setMetadataState({ error: "No recommendation candidate selected." });
      return;
    }

    setSelectedRecommendationSlug(nextSlug);
    setMetadataForm((current) => ({ ...current, nextRecommendedBookId: nextSlug }));
    setMetadataState({ message: `Applied next recommended book: ${nextSlug}.` });
  }

  function applyRelatedRecommendations() {
    const candidates = recommendationCandidates.slice(0, 5);
    if (candidates.length === 0) {
      setMetadataState({ error: "No recommendation candidates available." });
      return;
    }

    setMetadataForm((current) => ({
      ...current,
      nextRecommendedBookId: current.nextRecommendedBookId || candidates[0].slug,
      recommendations: candidates.map((candidate) => ({
        bookId: candidate.slug,
        reason: candidate.reasons.join("; "),
        type: candidate.author === (aiDraftForReview?.author || current.author) ? "same-author" : "same-category",
        score: String(candidate.score),
      })),
    }));
    setMetadataState({ message: `Applied ${candidates.length} related recommendation(s).` });
  }

  async function rerankRelatedRecommendations() {
    const candidates = recommendationCandidates;
    if (candidates.length === 0) {
      setMetadataState({ error: "No recommendation candidates available." });
      return;
    }

    const allowedSlugs = new Set(candidates.map((candidate) => candidate.slug));
    setIsRerankingRecommendations(true);
    setMetadataState({ message: "Reranking recommendation candidates with AI..." });

    try {
      const response = await fetch("/api/ai/recommendations/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentBook: {
            slug: metadataForm.bookSlug.trim(),
            title: aiDraftForReview?.title || metadataForm.title,
            subtitle: aiDraftForReview?.subtitle || metadataForm.subtitle,
            author: aiDraftForReview?.author || metadataForm.author,
            category: aiDraftForReview?.category || metadataForm.category,
            description: aiDraftForReview?.description || metadataForm.description,
            summary: aiDraftForReview?.summary,
            languageId: aiDraftForReview?.languageId || selectedAiAnalysisSource?.languageId || metadataForm.defaultLanguageId,
          },
          candidates,
        }),
      });
      const payload = (await response.json()) as AiRecommendationRerankResult & { error?: string };

      if (!response.ok || payload.error) {
        throw new Error(payload.error || "AI recommendation rerank failed.");
      }

      const recommendations = (payload.recommendations || [])
        .filter((recommendation) => allowedSlugs.has(recommendation.bookId))
        .slice(0, 5)
        .map((recommendation) => ({
          bookId: recommendation.bookId,
          reason: recommendation.reason || candidates.find((candidate) => candidate.slug === recommendation.bookId)?.reasons.join("; ") || "",
          type: recommendation.type || "same-topic",
          score: recommendation.score == null ? "" : String(recommendation.score),
        }));

      if (recommendations.length === 0) {
        throw new Error("AI did not return any valid candidate slugs.");
      }

      setMetadataForm((current) => ({
        ...current,
        nextRecommendedBookId: current.nextRecommendedBookId || recommendations[0].bookId,
        recommendations,
      }));
      setSelectedRecommendationSlug(recommendations[0].bookId);
      setMetadataState({ message: `AI reranked ${recommendations.length} related recommendation(s).` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI recommendation rerank failed.";
      setMetadataState({ error: message });
    } finally {
      setIsRerankingRecommendations(false);
    }
  }

  function getAiDraftStorageKey() {
    return buildAiDraftStorageKey(metadataForm.bookSlug.trim(), selectedAiAnalysisSource?.key);
  }

  async function saveAiDraftToStorage() {
    if (typeof window === "undefined") {
      return;
    }

    const slug = metadataForm.bookSlug.trim();
    if (!slug || !selectedAiAnalysisSource) {
      setMetadataState({ error: "Select a book and AI source before saving a draft." });
      return;
    }

    const payload: StoredAiDraft = {
      savedAt: new Date().toISOString(),
      aiAnalysis,
      aiDraftJson,
      aiTocJson,
      manualTocText,
    };
    window.localStorage.setItem(getAiDraftStorageKey(), JSON.stringify(payload));

    try {
      const response = await fetch("/api/ai/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookSlug: slug,
          sourceKey: selectedAiAnalysisSource.key,
          sourceFileId: selectedAiAnalysisSource.sourceFileId,
          savedBy: metadataForm.requestedBy,
          draft: payload,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        throw new Error(result.error || "Shared save failed.");
      }
      setMetadataState({ message: "Saved AI draft to shared storage." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shared save failed.";
      setMetadataState({ message: `Saved AI draft in this browser. Shared save failed: ${message}` });
    }
  }

  async function loadAiDraftFromStorage() {
    if (typeof window === "undefined") {
      return;
    }

    const slug = metadataForm.bookSlug.trim();
    if (!slug || !selectedAiAnalysisSource) {
      setMetadataState({ error: "Select a book and AI source before loading a draft." });
      return;
    }

    try {
      const url = new URL("/api/ai/drafts", window.location.origin);
      url.searchParams.set("bookSlug", slug);
      url.searchParams.set("sourceKey", selectedAiAnalysisSource.key);
      const response = await fetch(url);
      const result = (await response.json()) as { draft?: StoredAiDraft | null; error?: string };
      if (!response.ok || result.error) {
        throw new Error(result.error || "Shared load failed.");
      }

      if (result.draft) {
        setAiAnalysis(result.draft.aiAnalysis);
        setAiDraftJson(result.draft.aiDraftJson || "");
        setAiTocJson(result.draft.aiTocJson || "");
        setManualTocText(result.draft.manualTocText || "");
        setMetadataState({ message: `Loaded shared AI draft from ${formatDate(result.draft.savedAt)}.` });
        return;
      }
    } catch {
      // Fall through to browser-local recovery.
    }

    const stored = window.localStorage.getItem(getAiDraftStorageKey());
    if (!stored) {
      setMetadataState({ error: "No saved AI draft found for this book/source." });
      return;
    }

    try {
      const payload = JSON.parse(stored) as StoredAiDraft;
      setAiAnalysis(payload.aiAnalysis);
      setAiDraftJson(payload.aiDraftJson || "");
      setAiTocJson(payload.aiTocJson || "");
      setManualTocText(payload.manualTocText || "");
      setMetadataState({ message: `Loaded saved AI draft from ${formatDate(payload.savedAt)}.` });
    } catch {
      setMetadataState({ error: "Saved AI draft is corrupted." });
    }
  }

  async function clearAiDraftFromStorage() {
    if (typeof window === "undefined") {
      return;
    }

    const slug = metadataForm.bookSlug.trim();
    if (!slug || !selectedAiAnalysisSource) {
      setMetadataState({ error: "Select a book and AI source before clearing a draft." });
      return;
    }

    window.localStorage.removeItem(getAiDraftStorageKey());
    try {
      const url = new URL("/api/ai/drafts", window.location.origin);
      url.searchParams.set("bookSlug", slug);
      url.searchParams.set("sourceKey", selectedAiAnalysisSource.key);
      const response = await fetch(url, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        throw new Error(result.error || "Shared clear failed.");
      }
      setMetadataState({ message: "Cleared saved AI draft for this book/source." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shared clear failed.";
      setMetadataState({ message: `Cleared browser draft. Shared clear failed: ${message}` });
    }
  }

  async function copyAiTocJson() {
    if (!aiTocJson.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(aiTocJson);
      setMetadataState({ message: "Copied TOC JSON." });
    } catch {
      setMetadataState({ error: "Could not copy TOC JSON." });
    }
  }

  function updateEditableTocEntry(index: number, field: keyof TocEntryEditorItem, value: string) {
    const entries = aiTocEntriesForReview.map((entry) => ({ ...entry }));
    const current = entries[index];
    if (!current) {
      return;
    }

    entries[index] = {
      ...current,
      [field]: field === "title" ? value : Number.isFinite(Number(value)) ? Number(value) : null,
    } as TocEntryEditorItem;
    setAiTocJson(JSON.stringify(entries, null, 2));
  }

  function addEditableTocEntry() {
    const entries = [
      ...aiTocEntriesForReview,
      { title: "", printedPage: null, renderedPage: null, level: 1 },
    ];
    setAiTocJson(JSON.stringify(entries, null, 2));
  }

  function removeEditableTocEntry(index: number) {
    const entries = aiTocEntriesForReview.filter((_, currentIndex) => currentIndex !== index);
    setAiTocJson(JSON.stringify(entries, null, 2));
  }

  function convertManualTocText() {
    const entries = manualTocText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.*?)\s*[.·•\-–—\s]+(\d{1,4})$/);
        const title = (match ? match[1] : line).replace(/[.·•\-–—\s]+$/g, "").trim();
        const printedPage = match ? Number(match[2]) : null;
        if (!title || ["contents", "content", "index", "fehrist", "fahrist"].includes(title.toLowerCase())) {
          return null;
        }

        return {
          title,
          printedPage,
          renderedPage: null,
          level: /^\s/.test(line) ? 2 : 1,
        } satisfies TocEntryEditorItem;
      })
      .filter(Boolean) as TocEntryEditorItem[];

    if (entries.length === 0) {
      setMetadataState({ error: "No TOC entries could be parsed from the pasted text." });
      return;
    }

    setAiTocJson(JSON.stringify(entries, null, 2));
    setMetadataState({ message: `Converted ${entries.length} pasted TOC entr${entries.length === 1 ? "y" : "ies"}.` });
  }

  function updateEditableAiDraft(updater: (draft: NonNullable<AiAnalysisResult["draft"]>) => NonNullable<AiAnalysisResult["draft"]>) {
    const draft = getEditableAiDraft();
    if (!draft) {
      return;
    }

    setAiDraftJson(JSON.stringify(updater(draft), null, 2));
  }

  function updateEditableAiSection(index: number, field: string, value: string) {
    updateEditableAiDraft((draft) => {
      const sections = Array.isArray(draft.sections) ? [...draft.sections] : [];
      const current = sections[index];
      if (!current) {
        return draft;
      }

      const numericFields = new Set(["startPage", "endPage", "estimatedMinutes"]);
      sections[index] = {
        ...current,
        [field]: numericFields.has(field) ? Number(value) || 0 : value,
      };

      return { ...draft, sections };
    });
  }

  function autoFixEditableAiSectionRanges() {
    updateEditableAiDraft((draft) => {
      const pageCount = Number(aiAnalysis?.pageCount || 0);
      const sections = Array.isArray(draft.sections)
        ? draft.sections
            .map((section, index) => ({
              ...section,
              id: section.id || slugifyTitle(String(section.title || ""), `section-${index + 1}`),
              kind: section.kind || "chapter",
              title: section.title || `Section ${index + 1}`,
              startPage: Math.max(1, Math.floor(Number(section.startPage) || 1)),
              endPage: Math.max(1, Math.floor(Number(section.endPage) || Number(section.startPage) || 1)),
            }))
            .sort((left, right) => Number(left.startPage) - Number(right.startPage))
        : [];

      const fixedSections = sections.map((section, index) => {
        const previous = index > 0 ? sections[index - 1] : null;
        const next = sections[index + 1];
        const startPage = previous
          ? Math.max(Number(section.startPage), Number(previous.startPage) + 1)
          : Number(section.startPage);
        const endPage = next
          ? Math.max(startPage, Number(next.startPage) - 1)
          : Math.max(startPage, pageCount || Number(section.endPage));

        return {
          ...section,
          id: slugifyTitle(String(section.title), String(section.id || `section-${index + 1}`)),
          startPage,
          endPage,
          estimatedMinutes: Math.max(3, (endPage - startPage + 1) * 2),
        };
      });

      return {
        ...draft,
        sections: fixedSections,
        notes: [draft.notes, "Section ranges auto-fixed in admin review."].filter(Boolean).join("\n"),
      };
    });
    setMetadataState({ message: "Auto-fixed section ranges in the editable AI draft." });
  }

  function applyAiMetadataDraft() {
    const draft = getEditableAiDraft();
    if (!draft) {
      return;
    }

    setMetadataForm((current) => ({
      ...current,
      title: draft.title || current.title,
      subtitle: draft.subtitle || current.subtitle,
      author: draft.author || current.author,
      category: draft.category || current.category,
      description: draft.description || current.description,
      languages: current.languages.map((language, languageIndex) => ({
        ...language,
        summary: draft.summary && languageIndex === 0 ? draft.summary : language.summary,
        id: draft.languageId && languageIndex === 0 ? normalizeLanguageId(draft.languageId) : language.id,
        title: languageIndex === 0 && draft.languageId ? languageTitleFromId(draft.languageId) : language.title,
        nativeTitle: "",
        volumes: language.volumes.map((volume, volumeIndex) =>
          languageIndex === 0 && volumeIndex === 0
            ? {
                ...volume,
                title: draft.volumeTitle || volume.title,
                introNote: draft.introNote || volume.introNote,
                todayTarget: draft.todayTarget || volume.todayTarget,
              }
            : volume,
        ),
      })),
    }));
    setMetadataState({ message: "Applied AI metadata draft to the form." });
  }

  function applyAiPageNumberingDraft() {
    const startPage = getEditableAiDraft()?.printedPageStartPage;
    if (!startPage) {
      setMetadataState({ error: "AI draft does not include printed page start." });
      return;
    }

    updateFirstVolume((volume) => ({ ...volume, printedPageStartPage: String(startPage) }));
    setMetadataState({ message: "Applied AI page numbering to the first volume." });
  }

  function applyAiTocDraft() {
    const tocEntries = aiTocEntriesForReview.filter((entry) => entry.title.trim());
    if (tocEntries.length === 0) {
      setMetadataState({ error: "AI analysis does not include valid TOC entries." });
      return;
    }

    updateFirstVolume((volume) => ({ ...volume, tocEntries }));
    setMetadataState({ message: `Applied ${tocEntries.length} TOC entries to the first volume.` });
  }

  function applyAiAnalysisDraft() {
    applyAiMetadataDraft();
    applyAiPageNumberingDraft();
    applyAiTocDraft();
  }

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-10 text-stone-50">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.28em] text-amber-300">
            Islamic Library Admin
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-50">
            Upload a source PDF and queue ingestion
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
            This admin console uploads the original PDF to Appwrite and queues one
            language/volume ingestion job. <strong className="text-amber-300">For new books:</strong> provide title and other metadata. <strong className="text-amber-300">For existing books:</strong> just provide the slug, language, volume, and PDF.
          </p>
        </div>

        <nav className="mb-8 flex flex-wrap gap-2 rounded-3xl border border-stone-800 bg-stone-900/70 p-2">
          {[
            { id: "edit", label: "Edit Book" },
            { id: "upload", label: "Upload PDF" },
            { id: "jobs", label: "Jobs" },
            { id: "events", label: "Publish Events" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveWorkspace(tab.id as typeof activeWorkspace)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeWorkspace === tab.id
                ? "bg-amber-300 text-stone-950"
                : "text-stone-300 hover:bg-stone-800 hover:text-amber-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeWorkspace === "upload" ? (
        <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-stone-800 bg-stone-900/80 p-6 shadow-2xl shadow-black/20">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Title <span className="text-stone-500">(required for new books)</span></span>
                  <input name="title" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="Light of the Prophet" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Book slug <span className="text-amber-300">(required for existing books)</span></span>
                  <input
                    name="slug"
                    list="known-book-slugs"
                    className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                    placeholder="seerat-e-mustafa"
                  />
                  <datalist id="known-book-slugs">
                    {knownBooks.map((book) => (
                      <option key={book!.$id} value={book!.slug} />
                    ))}
                  </datalist>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Subtitle <span className="text-stone-500">(optional)</span></span>
                  <input name="subtitle" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="A gentle seerah reading journey" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Author <span className="text-stone-500">(optional)</span></span>
                  <input name="author" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="Editorial Edition" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Category <span className="text-stone-500">(optional)</span></span>
                  <select
                    name="category"
                    defaultValue="Knowledge"
                    className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Created By</span>
                  <input name="createdBy" defaultValue="admin-console" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Language ID <span className="text-rose-300">*</span></span>
                  <input required name="languageId" defaultValue="english" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="english, urdu, hindi" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Volume ID <span className="text-rose-300">*</span></span>
                  <input required name="volumeId" defaultValue="volume1" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="volume1, volume2" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Printed page 1 starts at rendered page</span>
                  <input name="printedPageStartPage" inputMode="numeric" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="e.g. 7" />
                  <span className="block text-xs leading-5 text-stone-500">Leave empty if the first rendered page is printed page 1.</span>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-stone-200">Description <span className="text-stone-500">(optional)</span></span>
                <textarea name="description" rows={5} className="w-full rounded-3xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 outline-none transition focus:border-amber-300" placeholder="Short public-facing description for the book card and metadata." />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-stone-200">Source PDF <span className="text-rose-300">*</span></span>
                <input required type="file" name="pdf" accept="application/pdf" className="block w-full rounded-2xl border border-dashed border-stone-700 bg-stone-950 px-4 py-4 text-sm text-stone-300 file:mr-4 file:rounded-full file:border-0 file:bg-amber-300 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-950" />
              </label>

              <button type="submit" disabled={isSubmitting} className="rounded-full bg-amber-300 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Uploading and queueing..." : "Upload and queue job"}
              </button>
            </form>
          </section>

          <aside className="space-y-5 rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Pipeline</p>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-stone-300">
                <li>1. Source PDF goes to Appwrite `source_pdfs`.</li>
                <li>2. The job either creates a new book slug or attaches to an existing one.</li>
                <li>3. One language/volume ingestion job is created for the VPS worker.</li>
                <li>4. Worker converts, validates, and publishes assets.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-amber-900/30 bg-amber-950/20 p-4 mt-4">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-400">Quick Guide</p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-amber-200/80">
                <li><strong>New Book:</strong> Fill in title + metadata fields</li>
                <li><strong>New Edition:</strong> Just provide slug + language + volume + PDF</li>
                <li><strong>Fields marked with <span className="text-rose-300">*</span> are always required</strong></li>
              </ul>
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Submission</p>
              {state.error ? (
                <p className="mt-3 text-sm leading-6 text-rose-300">{state.error}</p>
              ) : state.message ? (
                <div className="mt-3 space-y-2 text-sm leading-6 text-emerald-300">
                  <p>{state.message}</p>
                  <p>Job ID: {state.jobId}</p>
                  <p>Book slug: {state.slug}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-stone-400">
                  No upload yet. Successful submissions will show the queued job details here.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4 text-sm leading-6 text-stone-400">
              Keep `APPWRITE_API_KEY` only in server-side env files for this Next app. The browser should never see it.
            </div>
          </aside>
        </div>
        ) : null}

        {activeWorkspace === "edit" ? (
        <section className="rounded-3xl border border-stone-800 bg-stone-900/80 p-6 shadow-2xl shadow-black/20">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Published Metadata</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-50">Update title or subtitle without re-rendering</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
              This updates the published book metadata and catalog entry only. It does not re-upload or reconvert the PDF.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleMetadataRepublish}>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-stone-200">Book slug</span>
                <input
                  required
                  list="known-book-slugs"
                  value={metadataForm.bookSlug}
                  onChange={(event) => {
                    const slug = event.target.value;
                    const knownBook = knownBooks.find((book) => book?.slug === slug);
                    setSelectedAiSourceKey("");
                    setMetadataForm((current) => ({
                      ...current,
                      bookSlug: slug,
                      title: knownBook?.title || current.title,
                      subtitle: knownBook?.subtitle || current.subtitle,
                      author: knownBook?.author || current.author,
                      description: knownBook?.description || current.description,
                      category: knownBook?.category || current.category,
                      nextRecommendedBookId: knownBook?.nextRecommendedBookId || current.nextRecommendedBookId,
                      defaultLanguageId: knownBook?.defaultLanguageId || knownBook?.languageId || current.defaultLanguageId,
                      languages: knownBook
                        ? normalizeLanguages(undefined, knownBook.languageId, knownBook.volumeId)
                        : [],
                    }));
                  }}
                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                  placeholder="shifa-shareef-roman-urdu"
                />
                <datalist id="known-book-slugs">
                  {knownBooks.map((book) => (
                    <option key={book!.$id} value={book!.slug} />
                  ))}
                </datalist>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-stone-200">Title</span>
                <input
                  required
                  value={metadataForm.title}
                  onChange={(event) => {
                    setMetadataForm((current) => ({ ...current, title: event.target.value }));
                  }}
                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-stone-200">Subtitle</span>
                <input
                  value={metadataForm.subtitle}
                  onChange={(event) => {
                    setMetadataForm((current) => ({ ...current, subtitle: event.target.value }));
                  }}
                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-stone-200">Author</span>
                <input
                  value={metadataForm.author}
                  onChange={(event) => {
                    setMetadataForm((current) => ({ ...current, author: event.target.value }));
                  }}
                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-stone-200">Category</span>
                <select
                  value={metadataForm.category}
                  onChange={(event) => {
                    setMetadataForm((current) => ({ ...current, category: event.target.value }));
                  }}
                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                >
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-stone-200">Requested By</span>
                <input
                  value={metadataForm.requestedBy}
                  onChange={(event) => {
                    setMetadataForm((current) => ({
                      ...current,
                      requestedBy: event.target.value,
                    }));
                  }}
                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-stone-200">Next recommended book</span>
                <select
                  value={metadataForm.nextRecommendedBookId}
                  onChange={(event) => {
                    setMetadataForm((current) => ({
                      ...current,
                      nextRecommendedBookId: event.target.value,
                    }));
                  }}
                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                >
                  <option value="">None</option>
                  {knownBooks
                    .filter((book) => book?.status === "published" && book.slug !== metadataForm.bookSlug)
                    .map((book) => (
                      <option key={book!.$id} value={book!.slug}>
                        {book!.title} ({book!.slug})
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-stone-200">Description</span>
              <textarea
                rows={4}
                value={metadataForm.description}
                onChange={(event) => {
                  setMetadataForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }));
                }}
                className="w-full rounded-3xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 outline-none transition focus:border-amber-300"
                />
            </label>

            {metadataForm.languages.length > 0 ? (
              <div className="space-y-4 rounded-3xl border border-amber-900/40 bg-amber-950/10 p-4">
                <div>
                  <span className="text-sm text-amber-200">Page numbering</span>
                  <p className="mt-1 text-xs leading-5 text-stone-400">
                    For existing books, set where printed page 1 starts. Example: if rendered page 7 is printed page 1, enter 7.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {metadataForm.languages.flatMap((language, languageIndex) =>
                    language.volumes.map((volume, volumeIndex) => (
                      <label key={`${language.id}-${volume.id}-${volumeIndex}-page-start`} className="space-y-2">
                        <span className="text-xs text-stone-300">
                          {language.title || language.id} / {volume.title || volume.id}
                        </span>
                        <input
                          inputMode="numeric"
                          value={volume.printedPageStartPage}
                          onChange={(event) => {
                            const value = event.target.value;
                            setMetadataForm((current) => ({
                              ...current,
                              languages: current.languages.map((item, currentIndex) =>
                                currentIndex === languageIndex
                                  ? {
                                    ...item,
                                    volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                      currentVolumeIndex === volumeIndex
                                        ? { ...currentVolume, printedPageStartPage: value }
                                        : currentVolume,
                                    ),
                                  }
                                  : item,
                              ),
                            }));
                          }}
                          className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                          placeholder="Leave empty for rendered numbering"
                        />
                      </label>
                    )),
                  )}
                </div>
              </div>
            ) : null}

            <div className="space-y-4 rounded-3xl border border-emerald-900/40 bg-emerald-950/10 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <span className="text-sm text-emerald-200">AI Assist</span>
                  <p className="mt-1 text-xs leading-5 text-stone-400">
                    Analyze the original source PDF and draft metadata, page numbering, and sections. Review before publishing.
                  </p>
                  {aiAnalysisJobStatus ? (
                    <p className="mt-2 text-xs text-emerald-300">{aiAnalysisJobStatus}</p>
                  ) : null}
                  <p className="mt-2 text-xs leading-5 text-stone-500">
                    Quick analysis mode: {quickAnalysisAsJob ? "background job" : "direct request"}. Separate AI steps always use background jobs.
                  </p>
                  {aiAnalysisJobInfo && !aiAnalysis?.draft ? (
                    <div className="mt-3 rounded-2xl border border-stone-800 bg-stone-950/80 p-3 text-xs leading-5 text-stone-300">
                      <div className="flex flex-wrap gap-2 text-stone-500">
                        <span>Provider: {aiAnalysisJobInfo.provider || "unknown"}</span>
                        <span>Model: {aiAnalysisJobInfo.model || "unknown"}</span>
                        <span>Mode: {aiAnalysisJobInfo.analysisMode || "draft"}</span>
                      </div>
                      {aiAnalysisJobInfo.logs?.length ? (
                        <ul className="mt-2 space-y-1">
                          {aiAnalysisJobInfo.logs.slice(-4).map((log, index) => (
                            <li key={`${log.at}-${index}`}>
                              <span className="text-stone-500">{log.phase}</span>: {log.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={selectedAiAnalysisSource?.key || ""}
                    onChange={(event) => setSelectedAiSourceKey(event.target.value)}
                    disabled={aiAnalysisSources.length === 0}
                    className="rounded-full border border-emerald-900 bg-stone-950 px-4 py-2 text-xs font-medium text-emerald-100 outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiAnalysisSources.length === 0 ? (
                      <option value="">No source PDF found</option>
                    ) : null}
                    {aiAnalysisSources.map((source) => (
                      <option key={source.key} value={source.key}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={aiAnalysisDepth}
                    onChange={(event) => setAiAnalysisDepth(event.target.value as "quick" | "full")}
                    className="rounded-full border border-emerald-900 bg-stone-950 px-4 py-2 text-xs font-medium text-emerald-100 outline-none transition focus:border-emerald-300"
                  >
                    <option value="quick">Quick: first {quickAnalysisMaxPages} pages</option>
                    <option value="full">Full: all pages</option>
                  </select>
                  <button
                    type="button"
                    disabled={!metadataForm.bookSlug.trim() || !selectedAiAnalysisSource}
                    onClick={() => void loadAiDraftFromStorage()}
                    className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Load saved
                  </button>
                  <button
                    type="button"
                    disabled={!metadataForm.bookSlug.trim() || !selectedAiAnalysisSource || !aiDraftJson.trim()}
                    onClick={() => void saveAiDraftToStorage()}
                    className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    disabled={!metadataForm.bookSlug.trim() || !selectedAiAnalysisSource}
                    onClick={() => void clearAiDraftFromStorage()}
                    className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear saved
                  </button>
                  <button
                    type="button"
                    disabled={isAnalyzingMetadata || !metadataForm.bookSlug.trim() || !selectedAiAnalysisSource}
                    onClick={() => void handleAiAnalyzeMetadata("toc-only")}
                    className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Extract TOC
                  </button>
                  <button
                    type="button"
                    disabled={isAnalyzingMetadata || !metadataForm.bookSlug.trim() || !selectedAiAnalysisSource}
                    onClick={() => void handleAiAnalyzeMetadata("metadata-only")}
                    className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Metadata only
                  </button>
                  <button
                    type="button"
                    disabled={isAnalyzingMetadata || !metadataForm.bookSlug.trim() || !selectedAiAnalysisSource}
                    onClick={() => void handleAiAnalyzeMetadata("draft")}
                    className="rounded-full border border-emerald-800 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isAnalyzingMetadata ? "Analyzing..." : "Analyze PDF"}
                  </button>
                </div>
              </div>
              {aiAnalysis?.draft ? (
                <div className="space-y-3 rounded-2xl border border-stone-800 bg-stone-950/70 p-4 text-sm leading-6 text-stone-300">
                  {aiAnalysisJobInfo ? (
                    <details className="rounded-2xl border border-stone-800 bg-stone-950/80 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-emerald-200">
                        AI progress logs
                      </summary>
                      <div className="mt-3 space-y-2 text-xs leading-5 text-stone-300">
                        <div className="flex flex-wrap gap-2 text-stone-500">
                          <span>Provider: {aiAnalysisJobInfo.provider || "unknown"}</span>
                          <span>Model: {aiAnalysisJobInfo.model || "unknown"}</span>
                          <span>Mode: {aiAnalysisJobInfo.analysisMode || "draft"}</span>
                        </div>
                        {aiAnalysisJobInfo.logs?.length ? (
                          <ul className="space-y-2">
                            {aiAnalysisJobInfo.logs.map((log, index) => (
                              <li key={`${log.at}-${index}`} className="rounded-xl bg-stone-900/70 p-2">
                                <span className="text-stone-500">{log.phase}</span>: {log.message}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-stone-500">No progress logs yet.</p>
                        )}
                      </div>
                    </details>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-stone-400">
                    <span>Pages: {aiAnalysis.pageCount ?? "?"}</span>
                    <span>Analyzed: {aiAnalysis.analyzedPages ?? "?"}</span>
                    <span>Text pages: {aiAnalysis.extractableTextPages ?? "?"}</span>
                    <span>Confidence: {aiAnalysis.draft.confidence || "unknown"}</span>
                  </div>
                  <div className="rounded-2xl border border-stone-800 bg-stone-950/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-stone-300">Draft validation</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        aiDraftValidationIssues.some((issue) => issue.severity === "error")
                          ? "bg-rose-950 text-rose-200"
                          : aiDraftValidationIssues.length > 0
                            ? "bg-amber-950 text-amber-200"
                            : "bg-emerald-950 text-emerald-200"
                      }`}>
                        {aiDraftValidationIssues.some((issue) => issue.severity === "error")
                          ? "Needs fixes"
                          : aiDraftValidationIssues.length > 0
                            ? "Warnings"
                            : "Looks valid"}
                      </span>
                    </div>
                    {aiDraftValidationIssues.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-xs leading-5">
                        {aiDraftValidationIssues.map((issue, index) => (
                          <li
                            key={`${issue.severity}-${index}`}
                            className={issue.severity === "error" ? "text-rose-300" : "text-amber-300"}
                          >
                            {issue.severity === "error" ? "Error" : "Warning"}: {issue.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-emerald-300">No obvious section/category issues found.</p>
                    )}
                  </div>
                  <details className="rounded-2xl border border-stone-800 bg-stone-950/80 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-emerald-200">
                      Next recommended book ({recommendationCandidates.length})
                    </summary>
                    {recommendationCandidates.length > 0 ? (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={selectedRecommendationSlug || recommendationCandidates[0]?.slug || ""}
                            onChange={(event) => setSelectedRecommendationSlug(event.target.value)}
                            className="rounded-full border border-stone-700 bg-stone-950 px-4 py-2 text-xs font-medium text-stone-200 outline-none transition focus:border-emerald-300"
                          >
                            {recommendationCandidates.map((candidate) => (
                              <option key={candidate.slug} value={candidate.slug}>
                                {candidate.title} ({candidate.slug})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => applyRecommendedBook()}
                            className="rounded-full border border-emerald-800 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-300"
                          >
                            Apply recommendation
                          </button>
                          <button
                            type="button"
                            onClick={applyRelatedRecommendations}
                            className="rounded-full border border-emerald-800 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-300"
                          >
                            Apply related shelf
                          </button>
                          <button
                            type="button"
                            onClick={rerankRelatedRecommendations}
                            disabled={isRerankingRecommendations}
                            className="rounded-full border border-sky-800 px-4 py-2 text-xs font-medium text-sky-100 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isRerankingRecommendations ? "Reranking..." : "AI rerank shelf"}
                          </button>
                        </div>
                        {metadataForm.recommendations.length > 0 ? (
                          <p className="text-xs text-stone-500">
                            Related shelf selected: {metadataForm.recommendations.map((recommendation) => recommendation.bookId).join(", ")}
                          </p>
                        ) : null}
                        <div className="space-y-2 text-xs leading-5 text-stone-300">
                          {recommendationCandidates.map((candidate) => (
                            <button
                              key={candidate.slug}
                              type="button"
                              onClick={() => setSelectedRecommendationSlug(candidate.slug)}
                              className={`block w-full rounded-2xl border p-3 text-left transition ${
                                (selectedRecommendationSlug || recommendationCandidates[0]?.slug) === candidate.slug
                                  ? "border-emerald-700 bg-emerald-950/20"
                                  : "border-stone-800 bg-stone-900/60 hover:border-stone-700"
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-stone-100">{candidate.title}</span>
                                <span className="text-stone-500">{candidate.slug}</span>
                                <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[11px] text-emerald-200">score {candidate.score}</span>
                              </div>
                              <p className="mt-1 text-stone-400">
                                {[candidate.category, candidate.author].filter(Boolean).join(" · ") || "No metadata"}
                              </p>
                              {candidate.reasons.length ? (
                                <p className="mt-1 text-stone-500">{candidate.reasons.join("; ")}</p>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-stone-400">No suitable published recommendation candidates found yet.</p>
                    )}
                  </details>
                  {aiDraftSectionsForReview.length > 0 ? (
                    <details className="rounded-2xl border border-stone-800 bg-stone-950/80 p-3" open>
                      <summary className="cursor-pointer text-xs font-medium text-emerald-200">
                        Section review ({aiDraftSectionsForReview.length})
                      </summary>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={autoFixEditableAiSectionRanges}
                          className="rounded-full border border-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-300"
                        >
                          Auto-fix ranges
                        </button>
                      </div>
                      <div className="mt-3 max-h-96 overflow-auto rounded-xl bg-stone-900/60">
                        <table className="w-full min-w-[860px] text-left text-xs text-stone-300">
                          <thead className="sticky top-0 bg-stone-900 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                            <tr>
                              <th className="px-3 py-2 font-medium">Title</th>
                              <th className="px-3 py-2 font-medium">Start</th>
                              <th className="px-3 py-2 font-medium">End</th>
                              <th className="px-3 py-2 font-medium">Kind</th>
                              <th className="px-3 py-2 font-medium">Minutes</th>
                              <th className="px-3 py-2 font-medium">ID</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiDraftSectionsForReview.map((section, index) => (
                              <tr key={`${section.id || section.title || "section"}-${index}`} className="border-t border-stone-800 align-top">
                                <td className="px-3 py-2">
                                  <input
                                    value={String(section.title || "")}
                                    onChange={(event) => updateEditableAiSection(index, "title", event.target.value)}
                                    className="w-56 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="numeric"
                                    value={String(section.startPage || "")}
                                    onChange={(event) => updateEditableAiSection(index, "startPage", event.target.value)}
                                    className="w-20 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="numeric"
                                    value={String(section.endPage || "")}
                                    onChange={(event) => updateEditableAiSection(index, "endPage", event.target.value)}
                                    className="w-20 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    value={String(section.kind || "chapter")}
                                    onChange={(event) => updateEditableAiSection(index, "kind", event.target.value)}
                                    className="w-28 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="numeric"
                                    value={String(section.estimatedMinutes || "")}
                                    onChange={(event) => updateEditableAiSection(index, "estimatedMinutes", event.target.value)}
                                    className="w-20 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    value={String(section.id || "")}
                                    onChange={(event) => updateEditableAiSection(index, "id", event.target.value)}
                                    className="w-48 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ) : null}
                  {aiDraftForReview?.summary || aiDraftForReview?.introNote || aiDraftForReview?.todayTarget ? (
                    <details className="rounded-2xl border border-stone-800 bg-stone-950/80 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-emerald-200">
                        Summary and volume notes
                      </summary>
                      <div className="mt-3 space-y-3 text-xs leading-5 text-stone-300">
                        {aiDraftForReview.summary ? (
                          <p><span className="text-stone-500">Summary:</span> {aiDraftForReview.summary}</p>
                        ) : null}
                        {aiDraftForReview.introNote ? (
                          <p><span className="text-stone-500">Intro note:</span> {aiDraftForReview.introNote}</p>
                        ) : null}
                        {aiDraftForReview.todayTarget ? (
                          <p><span className="text-stone-500">Today target:</span> {aiDraftForReview.todayTarget}</p>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-stone-300">Editable response JSON</span>
                      <button
                        type="button"
                        onClick={() => void copyAiDraftJson()}
                        className="rounded-full border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-emerald-300"
                      >
                        Copy JSON
                      </button>
                    </div>
                    <textarea
                      value={aiDraftJson}
                      onChange={(event) => setAiDraftJson(event.target.value)}
                      spellCheck={false}
                      className="min-h-72 w-full rounded-2xl border border-stone-800 bg-stone-950 p-3 font-mono text-xs leading-5 text-stone-300 outline-none transition focus:border-emerald-400"
                    />
                  </div>
                  {aiAnalysis ? (
                    <details className="rounded-2xl border border-stone-800 bg-stone-950/80 p-3" open>
                      <summary className="cursor-pointer text-xs font-medium text-emerald-200">
                        TOC review ({aiTocEntriesForReview.length})
                      </summary>
                      <div className="mt-3 space-y-2 rounded-2xl border border-stone-800 bg-stone-950/80 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-stone-300">Manual TOC paste</span>
                          <button
                            type="button"
                            onClick={convertManualTocText}
                            className="rounded-full border border-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-300"
                          >
                            Convert pasted TOC
                          </button>
                        </div>
                        <textarea
                          value={manualTocText}
                          onChange={(event) => setManualTocText(event.target.value)}
                          rows={4}
                          className="w-full rounded-2xl border border-stone-800 bg-stone-950 p-3 text-xs leading-5 text-stone-300 outline-none transition focus:border-emerald-400"
                          placeholder="Paste TOC lines, for example: Khutba ........ 12"
                        />
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-stone-300">Editable TOC JSON</span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={addEditableTocEntry}
                              className="rounded-full border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-emerald-300"
                            >
                              Add row
                            </button>
                            <button
                              type="button"
                              onClick={() => void copyAiTocJson()}
                              className="rounded-full border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-emerald-300"
                            >
                              Copy TOC
                            </button>
                            <button
                              type="button"
                              onClick={applyAiTocDraft}
                              className="rounded-full border border-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-300"
                            >
                              Apply TOC
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={aiTocJson}
                          onChange={(event) => setAiTocJson(event.target.value)}
                          spellCheck={false}
                          className="min-h-48 w-full rounded-2xl border border-stone-800 bg-stone-950 p-3 font-mono text-xs leading-5 text-stone-300 outline-none transition focus:border-emerald-400"
                        />
                      </div>
                      <div className="mt-3 max-h-96 overflow-auto rounded-xl bg-stone-900/60">
                        <table className="w-full min-w-[760px] text-left text-xs text-stone-300">
                          <thead className="sticky top-0 bg-stone-900 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                            <tr>
                              <th className="px-3 py-2 font-medium">Title</th>
                              <th className="px-3 py-2 font-medium">Printed</th>
                              <th className="px-3 py-2 font-medium">Rendered</th>
                              <th className="px-3 py-2 font-medium">Level</th>
                              <th className="px-3 py-2 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiTocEntriesForReview.map((entry, index) => (
                              <tr key={`${entry.title}-${index}`} className="border-t border-stone-800">
                                <td className="px-3 py-2">
                                  <input
                                    value={entry.title}
                                    onChange={(event) => updateEditableTocEntry(index, "title", event.target.value)}
                                    className="w-72 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="numeric"
                                    value={entry.printedPage ?? ""}
                                    onChange={(event) => updateEditableTocEntry(index, "printedPage", event.target.value)}
                                    className="w-20 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="numeric"
                                    value={entry.renderedPage ?? ""}
                                    onChange={(event) => updateEditableTocEntry(index, "renderedPage", event.target.value)}
                                    className="w-20 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="numeric"
                                    value={entry.level}
                                    onChange={(event) => updateEditableTocEntry(index, "level", event.target.value)}
                                    className="w-16 rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 outline-none transition focus:border-emerald-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => removeEditableTocEntry(index)}
                                    className="rounded-full border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-rose-400 hover:text-rose-200"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ) : null}
                  {aiAnalysis.extractedTextPreview?.length ? (
                    <details className="rounded-2xl border border-stone-800 bg-stone-950/80 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-emerald-200">
                        View extracted text preview
                      </summary>
                      <div className="mt-3 max-h-96 space-y-3 overflow-auto text-xs leading-5 text-stone-300">
                        {aiAnalysis.extractedTextPreview.map((page) => (
                          <div key={page.page} className="rounded-xl bg-stone-900/70 p-3">
                            <div className="mb-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                              <span>Rendered page {page.page}</span>
                              <span>{page.textLength} chars extracted</span>
                            </div>
                            <pre className="whitespace-pre-wrap font-sans text-xs leading-5 text-stone-300">
                              {page.text || "[no extractable text]"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyAiMetadataDraft}
                      className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-medium text-stone-950 transition hover:bg-emerald-200"
                    >
                      Apply metadata
                    </button>
                    <button
                      type="button"
                      onClick={applyAiPageNumberingDraft}
                      className="rounded-full border border-emerald-800 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-300"
                    >
                      Apply page numbering
                    </button>
                    <button
                      type="button"
                      onClick={applyAiTocDraft}
                      className="rounded-full border border-emerald-800 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-300"
                    >
                      Apply TOC
                    </button>
                    <button
                      type="button"
                      onClick={applyAiAnalysisDraft}
                      className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-emerald-300"
                    >
                      Apply all
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-3xl border border-stone-800 bg-stone-950/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-sm text-stone-200">Existing edition details</span>
                  <p className="mt-1 text-xs leading-5 text-stone-400">
                    Edit details for languages and volumes that already exist. Add new editions from Upload PDF.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedMetadata((current) => !current)}
                  className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-amber-300 hover:text-amber-200"
                >
                  {showAdvancedMetadata ? "Hide advanced" : "Show advanced"}
                </button>
              </div>

              {!showAdvancedMetadata ? (
                <div className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4 text-sm leading-6 text-stone-400">
                  Current structure: {metadataForm.languages.length || 0} existing language(s), {metadataForm.languages.reduce((count, language) => count + language.volumes.length, 0)} existing volume(s). Add new languages or volumes from Upload PDF using the existing book slug.
                </div>
              ) : (
                <>
                  <div className="grid gap-4 rounded-2xl border border-stone-800 bg-stone-950/60 p-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-xs text-stone-300">Language to edit</span>
                      <select
                        value={Math.min(selectedAdvancedLanguageIndex, Math.max(0, metadataForm.languages.length - 1))}
                        onChange={(event) => {
                          setSelectedAdvancedLanguageIndex(Number(event.target.value));
                          setSelectedAdvancedVolumeIndex(0);
                        }}
                        className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                      >
                        {metadataForm.languages.map((language, index) => (
                          <option key={`${language.id || "language"}-${index}`} value={index}>
                            {language.title || language.id || `Language ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs text-stone-300">Volume to edit</span>
                      <select
                        value={Math.min(
                          selectedAdvancedVolumeIndex,
                          Math.max(0, (metadataForm.languages[selectedAdvancedLanguageIndex]?.volumes.length ?? 1) - 1),
                        )}
                        onChange={(event) => setSelectedAdvancedVolumeIndex(Number(event.target.value))}
                        className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                      >
                        {(metadataForm.languages[selectedAdvancedLanguageIndex]?.volumes ?? []).map((volume, index) => (
                          <option key={`${volume.id || "volume"}-${index}`} value={index}>
                            {volume.title || volume.id || `Volume ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 text-xs leading-5 text-amber-100/80">
                    To add a new language or volume, go to <strong>Upload PDF</strong>, enter this book slug, set the new language/volume ID, and upload the source PDF. This editor only updates existing published editions.
                  </div>

              <label className="block space-y-2">
                <span className="text-xs text-stone-300">Default language ID</span>
                <input
                  value={metadataForm.defaultLanguageId}
                  onChange={(event) => {
                    setMetadataForm((current) => ({
                      ...current,
                      defaultLanguageId: normalizeLanguageId(event.target.value),
                    }));
                  }}
                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                  placeholder="roman-urdu"
                />
              </label>

              {metadataForm.languages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-700 bg-stone-950/60 p-4 text-sm text-stone-400">
                  No languages yet. Add the first language above.
                </div>
              ) : (
                <div className="space-y-5">
                  {metadataForm.languages.map((language, languageIndex) => {
                    if (languageIndex !== selectedAdvancedLanguageIndex) {
                      return null;
                    }

                    return (
                    <div
                      key={`${language.id || "language"}-${languageIndex}`}
                      className="rounded-3xl border border-stone-800 bg-stone-950/60 p-4"
                    >
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-stone-100">Language {languageIndex + 1}</p>
                          <p className="text-xs text-stone-400">
                            Existing language edition. Use Upload PDF to add a new language.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-xs text-stone-300">Language ID</span>
                          <input
                            value={language.id}
                            onChange={(event) => {
                              const value = normalizeLanguageId(event.target.value);
                              setMetadataForm((current) => ({
                                ...current,
                                languages: current.languages.map((item, currentIndex) =>
                                  currentIndex === languageIndex
                                    ? { ...item, id: value, title: languageTitleFromId(value), nativeTitle: "" }
                                    : item,
                                ),
                              }));
                            }}
                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                            placeholder="roman-urdu"
                          />
                        </label>
                        <div className="space-y-2 rounded-2xl border border-stone-800 bg-stone-950/70 px-4 py-3">
                          <span className="text-xs text-stone-300">Language title</span>
                          <p className="text-sm text-stone-100">{languageTitleFromId(language.id) || "Derived from language ID"}</p>
                          <p className="text-xs text-stone-500">Automatically generated from the normalized ID.</p>
                        </div>
                        <label className="space-y-2">
                          <span className="text-xs text-stone-300">Order</span>
                          <input
                            inputMode="numeric"
                            value={language.order}
                            onChange={(event) => {
                              const value = event.target.value;
                              setMetadataForm((current) => ({
                                ...current,
                                languages: current.languages.map((item, currentIndex) =>
                                  currentIndex === languageIndex ? { ...item, order: value } : item,
                                ),
                              }));
                            }}
                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                          />
                        </label>
                        <label className="space-y-2 md:col-span-2">
                          <span className="text-xs text-stone-300">Summary</span>
                          <input
                            value={language.summary}
                            onChange={(event) => {
                              const value = event.target.value;
                              setMetadataForm((current) => ({
                                ...current,
                                languages: current.languages.map((item, currentIndex) =>
                                  currentIndex === languageIndex ? { ...item, summary: value } : item,
                                ),
                              }));
                            }}
                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                            placeholder="For readers who want a Roman Urdu devotional edition."
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs text-stone-300">Default volume ID</span>
                          <input
                            value={language.defaultVolumeId}
                            onChange={(event) => {
                              const value = event.target.value;
                              setMetadataForm((current) => ({
                                ...current,
                                languages: current.languages.map((item, currentIndex) =>
                                  currentIndex === languageIndex ? { ...item, defaultVolumeId: value } : item,
                                ),
                              }));
                            }}
                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                            placeholder="volume1"
                          />
                        </label>
                      </div>

                      <div className="mt-5 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <span className="text-xs uppercase tracking-[0.18em] text-stone-400">Selected volume</span>
                            <p className="mt-1 text-xs text-stone-500">
                              Existing readable unit for this language. Use Upload PDF to add another volume.
                            </p>
                          </div>
                        </div>

                        {language.volumes.map((volume, volumeIndex) => {
                          if (volumeIndex !== selectedAdvancedVolumeIndex) {
                            return null;
                          }

                          return (
                          <div
                            key={`${volume.id || "volume"}-${volumeIndex}`}
                            className="rounded-2xl border border-stone-800 bg-stone-900/40 p-4"
                          >
                            <div className="mb-4 flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-medium text-stone-100">Volume {volumeIndex + 1}</p>
                                <p className="text-xs text-stone-400">
                                  Existing volume details and sections.
                                </p>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <label className="space-y-2">
                                <span className="text-xs text-stone-300">Volume ID</span>
                                <input
                                  value={volume.id}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? { ...currentVolume, id: value }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                  placeholder="volume1"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-xs text-stone-300">Title</span>
                                <input
                                  value={volume.title}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? { ...currentVolume, title: value }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                  placeholder="Volume 1"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-xs text-stone-300">Subtitle</span>
                                <input
                                  value={volume.subtitle}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? { ...currentVolume, subtitle: value }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                  placeholder="Majalis 1-3"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-xs text-stone-300">Order</span>
                                <input
                                  inputMode="numeric"
                                  value={volume.order}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? { ...currentVolume, order: value }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-xs text-stone-300">Printed page 1 starts at rendered page</span>
                                <input
                                  inputMode="numeric"
                                  value={volume.printedPageStartPage}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? { ...currentVolume, printedPageStartPage: value }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                  placeholder="e.g. 7"
                                />
                              </label>
                              <label className="space-y-2 md:col-span-2">
                                <span className="text-xs text-stone-300">Manifest URL</span>
                                <input
                                  value={volume.manifestUrl}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? { ...currentVolume, manifestUrl: value }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                  placeholder="Optional for now"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-xs text-stone-300">Intro note</span>
                                <input
                                  value={volume.introNote}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? { ...currentVolume, introNote: value }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-xs text-stone-300">Today target</span>
                                <input
                                  value={volume.todayTarget}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? { ...currentVolume, todayTarget: value }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                />
                              </label>
                            </div>

                            <div className="mt-5 space-y-4">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <span className="text-sm text-stone-200">Sections</span>
                                  <p className="mt-1 text-xs leading-5 text-stone-400">
                                    Author real reading sections for this specific volume.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMetadataForm((current) => ({
                                      ...current,
                                      languages: current.languages.map((item, currentIndex) =>
                                        currentIndex === languageIndex
                                          ? {
                                            ...item,
                                            volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                              currentVolumeIndex === volumeIndex
                                                ? {
                                                  ...currentVolume,
                                                  sections: [...currentVolume.sections, createEmptySection()],
                                                }
                                                : currentVolume,
                                            ),
                                          }
                                          : item,
                                      ),
                                    }));
                                  }}
                                  className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-amber-300 hover:text-amber-200"
                                >
                                  Add section
                                </button>
                              </div>

                              {volume.sections.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-stone-700 bg-stone-950/60 p-4 text-sm text-stone-400">
                                  No sections yet for this volume.
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {volume.sections.map((section, sectionIndex) => (
                                    <div
                                      key={`${section.id || "section"}-${sectionIndex}`}
                                      className="rounded-3xl border border-stone-800 bg-stone-950/60 p-4"
                                    >
                                      <div className="mb-4 flex items-center justify-between gap-4">
                                        <div>
                                          <p className="text-sm font-medium text-stone-100">Section {sectionIndex + 1}</p>
                                          <p className="text-xs text-stone-400">Use clear, reader-friendly names for this volume.</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setMetadataForm((current) => ({
                                              ...current,
                                              languages: current.languages.map((item, currentIndex) =>
                                                currentIndex === languageIndex
                                                  ? {
                                                    ...item,
                                                    volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                      currentVolumeIndex === volumeIndex
                                                        ? {
                                                          ...currentVolume,
                                                          sections: currentVolume.sections.filter((_, currentSectionIndex) => currentSectionIndex !== sectionIndex),
                                                        }
                                                        : currentVolume,
                                                    ),
                                                  }
                                                  : item,
                                              ),
                                            }));
                                          }}
                                          className="rounded-full border border-rose-900/60 px-4 py-2 text-xs font-medium text-rose-200 transition hover:border-rose-400 hover:text-rose-100"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                      <div className="grid gap-4 md:grid-cols-2">
                                        <label className="space-y-2">
                                          <span className="text-xs text-stone-300">Section ID</span>
                                          <input
                                            value={section.id}
                                            onChange={(event) => {
                                              const value = event.target.value;
                                              setMetadataForm((current) => ({
                                                ...current,
                                                languages: current.languages.map((item, currentIndex) =>
                                                  currentIndex === languageIndex
                                                    ? {
                                                      ...item,
                                                      volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                        currentVolumeIndex === volumeIndex
                                                          ? {
                                                            ...currentVolume,
                                                            sections: currentVolume.sections.map((currentSection, currentSectionIndex) =>
                                                              currentSectionIndex === sectionIndex ? { ...currentSection, id: value } : currentSection,
                                                            ),
                                                          }
                                                          : currentVolume,
                                                      ),
                                                    }
                                                    : item,
                                                ),
                                              }));
                                            }}
                                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                          />
                                        </label>
                                        <label className="space-y-2">
                                          <span className="text-xs text-stone-300">Title</span>
                                          <input
                                            value={section.title}
                                            onChange={(event) => {
                                              const value = event.target.value;
                                              setMetadataForm((current) => ({
                                                ...current,
                                                languages: current.languages.map((item, currentIndex) =>
                                                  currentIndex === languageIndex
                                                    ? {
                                                      ...item,
                                                      volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                        currentVolumeIndex === volumeIndex
                                                          ? {
                                                            ...currentVolume,
                                                            sections: currentVolume.sections.map((currentSection, currentSectionIndex) =>
                                                              currentSectionIndex === sectionIndex ? { ...currentSection, title: value } : currentSection,
                                                            ),
                                                          }
                                                          : currentVolume,
                                                      ),
                                                    }
                                                    : item,
                                                ),
                                              }));
                                            }}
                                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                          />
                                        </label>
                                        <label className="space-y-2">
                                          <span className="text-xs text-stone-300">Start page</span>
                                          <input
                                            inputMode="numeric"
                                            value={section.startPage}
                                            onChange={(event) => {
                                              const value = event.target.value;
                                              setMetadataForm((current) => ({
                                                ...current,
                                                languages: current.languages.map((item, currentIndex) =>
                                                  currentIndex === languageIndex
                                                    ? {
                                                      ...item,
                                                      volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                        currentVolumeIndex === volumeIndex
                                                          ? {
                                                            ...currentVolume,
                                                            sections: currentVolume.sections.map((currentSection, currentSectionIndex) =>
                                                              currentSectionIndex === sectionIndex ? { ...currentSection, startPage: value } : currentSection,
                                                            ),
                                                          }
                                                          : currentVolume,
                                                      ),
                                                    }
                                                    : item,
                                                ),
                                              }));
                                            }}
                                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                          />
                                        </label>
                                        <label className="space-y-2">
                                          <span className="text-xs text-stone-300">End page</span>
                                          <input
                                            inputMode="numeric"
                                            value={section.endPage}
                                            onChange={(event) => {
                                              const value = event.target.value;
                                              setMetadataForm((current) => ({
                                                ...current,
                                                languages: current.languages.map((item, currentIndex) =>
                                                  currentIndex === languageIndex
                                                    ? {
                                                      ...item,
                                                      volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                        currentVolumeIndex === volumeIndex
                                                          ? {
                                                            ...currentVolume,
                                                            sections: currentVolume.sections.map((currentSection, currentSectionIndex) =>
                                                              currentSectionIndex === sectionIndex ? { ...currentSection, endPage: value } : currentSection,
                                                            ),
                                                          }
                                                          : currentVolume,
                                                      ),
                                                    }
                                                    : item,
                                                ),
                                              }));
                                            }}
                                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>


                          </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={isRepublishingMetadata}
              className="rounded-full bg-amber-300 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRepublishingMetadata ? "Updating published metadata..." : "Update published metadata"}
            </button>
          </form>

          <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Metadata Publish</p>
            {metadataState.error ? (
              <p className="mt-3 text-sm leading-6 text-rose-300">{metadataState.error}</p>
            ) : metadataState.message ? (
              <div className="mt-3 space-y-2 text-sm leading-6 text-emerald-300">
                <p>{metadataState.message}</p>
                <p>Book slug: {metadataState.slug}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-stone-400">
                Published title, subtitle, description, author, and category can be updated here without touching page assets.
              </p>
            )}
          </div>
        </section>
        ) : null}

        {activeWorkspace === "jobs" ? (
        <>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Queue</p>
            <p className="mt-3 text-3xl font-semibold text-stone-50">{summary.queuedJobs}</p>
            <p className="mt-2 text-sm text-stone-400">Queued or retrying jobs waiting for worker pickup.</p>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Active</p>
            <p className="mt-3 text-3xl font-semibold text-stone-50">{summary.activeJobs}</p>
            <p className="mt-2 text-sm text-stone-400">Jobs currently processing, validating, or publishing.</p>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Published</p>
            <p className="mt-3 text-3xl font-semibold text-stone-50">{summary.publishedBooks}</p>
            <p className="mt-2 text-sm text-stone-400">Books visible through the published asset catalog.</p>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Push Health</p>
            <p className="mt-3 text-3xl font-semibold text-stone-50">{summary.pushedJobs}</p>
            <p className="mt-2 text-sm text-stone-400">
              Pushed: {summary.pushedJobs} | Pending: {summary.pushPendingJobs} | Failed: {summary.pushFailedJobs}
            </p>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Failures</p>
            <p className="mt-3 text-3xl font-semibold text-stone-50">{summary.failedJobs}</p>
            <p className="mt-2 text-sm text-stone-400">Jobs that need operator attention or a retry pass.</p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
          <p className="text-sm text-stone-300">
            Last published event: <span className="text-stone-50">{formatDate(summary.latestPublishedAt)}</span>
            {" | "}
            Total jobs: <span className="text-stone-50">{summary.totalJobs}</span>
            {" | "}
            Total books: <span className="text-stone-50">{summary.totalBooks}</span>
          </p>
        </section>

        <section className="mt-8 rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Pipeline Jobs</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-50">Worker handoff and monitoring</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                This view tracks the current job queue, processing state, and operator-triggered dispatch into the worker.
              </p>
            </div>
            <button type="button" onClick={() => void loadJobs()} className="rounded-full border border-stone-700 px-4 py-2 text-sm text-stone-200 transition hover:border-amber-300 hover:text-amber-200">
              Refresh jobs
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {jobFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setJobFilter(filter.value);
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-medium transition ${jobFilter === filter.value
                    ? "border-amber-300 bg-amber-300 text-stone-950"
                    : "border-stone-700 text-stone-300 hover:border-amber-300 hover:text-amber-200"
                    }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
              }}
              placeholder="Search job, slug, language..."
              className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-amber-300 lg:max-w-sm"
            />
          </div>

          {jobsError ? (
            <div className="mt-5 rounded-2xl border border-rose-900/60 bg-rose-950/40 p-4 text-sm text-rose-200">
              {jobsError}
            </div>
          ) : null}

          {isLoadingJobs ? (
            <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5 text-sm text-stone-400">
              Loading recent jobs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5 text-sm text-stone-400">
              No jobs yet. Upload the first source PDF to create one.
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5 text-sm text-stone-400">
              No jobs match the current filter or search.
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-stone-800">
              <div className="grid grid-cols-[1.55fr_0.9fr_0.75fr_0.7fr_0.9fr_0.9fr] bg-stone-950/80 px-4 py-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                <span>Book</span>
                <span>Status</span>
                <span>Language</span>
                <span>Attempt</span>
                <span>Duration</span>
                <span>Action</span>
              </div>
              {filteredJobs.map(({ job, book }) => (
                <div key={job.$id} className="grid grid-cols-[1.55fr_0.9fr_0.75fr_0.7fr_0.9fr_0.9fr] items-center gap-3 border-t border-stone-800 px-4 py-4 text-sm">
                  <div>
                    <p className="font-medium text-stone-50">{book?.title || job.bookSlug}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      {job.jobId} | {job.volumeId} | {formatDate(job.updatedAt)}
                    </p>
                    {job.errorMessage ? <p className="mt-2 text-xs text-rose-300">{job.errorMessage}</p> : null}
                    {job.status === "published" && job.pushStatus === "failed" ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-amber-300">Push failed</span>
                        {job.pushError ? (
                          <span className="text-xs text-stone-500 break-all">{job.pushError}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {job.status === "published" && job.pushStatus === "succeeded" ? (
                      <div className="mt-2">
                        <span className="text-xs text-emerald-300">Pushed</span>
                      </div>
                    ) : null}
                    {book?.metadataUrl ? (
                      <a
                        href={`/viewer?metadataUrl=${encodeURIComponent(book.metadataUrl)}&language=${encodeURIComponent(job.languageId)}&volume=${encodeURIComponent(job.volumeId)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex rounded-full border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-amber-300 hover:text-amber-200"
                      >
                        View book
                      </a>
                    ) : null}
                  </div>
                  <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(job.status)}`}>
                    {job.status}
                  </span>
                  <span className="text-stone-300">{job.languageId}</span>
                  <span className="text-stone-300">{job.attempt}</span>
                  <span className="text-stone-300">{formatDuration(job.startedAt, job.finishedAt)}</span>
                  <div className="flex flex-col items-start gap-2">
                    <button
                      type="button"
                      disabled={dispatchingJobId === job.jobId || job.status !== "queued"}
                      onClick={() => void handleDispatch(job.jobId)}
                      className="rounded-full bg-amber-300 px-4 py-2 text-xs font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-300"
                    >
                      {dispatchingJobId === job.jobId ? "Dispatching..." : "Dispatch"}
                    </button>
                    {job.status === "failed" || job.status === "retrying" ? (
                      <button
                        type="button"
                        disabled={recoveringJobId === job.jobId}
                        onClick={() => void handleRecover(job.jobId, "requeue")}
                        className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-amber-300 hover:text-amber-200 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-500"
                      >
                        {recoveringJobId === job.jobId ? "Requeueing..." : "Requeue"}
                      </button>
                    ) : null}

                    {job.status === "published" && job.pushStatus === "failed" ? (
                      <button
                        type="button"
                        disabled={retryingPushJobId === job.jobId}
                        onClick={() => void handleRetryPush(job.jobId)}
                        className="rounded-full border border-amber-900/60 px-4 py-2 text-xs font-medium text-amber-200 transition hover:border-amber-300 hover:text-amber-100 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-500"
                      >
                        {retryingPushJobId === job.jobId ? "Retrying push..." : "Retry push"}
                      </button>
                    ) : null}
                    {job.status === "processing" ||
                      job.status === "validating" ||
                      job.status === "publishing" ? (
                      <button
                        type="button"
                        disabled={recoveringJobId === job.jobId}
                        onClick={() => void handleRecover(job.jobId, "reset-stuck")}
                        className="rounded-full border border-rose-900/60 px-4 py-2 text-xs font-medium text-rose-200 transition hover:border-rose-400 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-500"
                      >
                        {recoveringJobId === job.jobId ? "Resetting..." : "Reset stuck"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
        ) : null}

        {activeWorkspace === "events" ? (
        <section className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Publish Events</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-50">Recent publish activity</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
              These events are written by the worker after publish steps, so they give you the final delivery trail into the assets catalog.
            </p>
          </div>

          {events.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5 text-sm text-stone-400">
              No publish events yet. The first successful pipeline run will appear here.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {events.map((event) => (
                <div key={event.$id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-stone-50">{event.bookSlug}</p>
                      <p className="mt-1 text-xs text-stone-400">
                        {event.jobId} | {formatDate(event.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm text-stone-300">{event.status}</span>
                  </div>
                  {event.commitSha ? (
                    <p className="mt-3 text-xs text-stone-400">Commit: {event.commitSha}</p>
                  ) : null}
                  {event.catalogUrl ? (
                    <p className="mt-2 break-all text-xs text-stone-400">Catalog: {event.catalogUrl}</p>
                  ) : null}
                  {event.manifestUrl ? (
                    <p className="mt-2 break-all text-xs text-stone-400">Manifest: {event.manifestUrl}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
        ) : null}
      </div>
    </main>
  );
}

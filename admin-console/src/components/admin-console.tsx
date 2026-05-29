"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { uploadPdfWithProgress } from "@/lib/appwrite-client";
import type {
  JobListItem,
  MonitoringSnapshot,
  MonitoringSummary,
  PublishEventRecord,
  RecoveryAction,
} from "@/lib/ingestion";

const categories = ["Seerah", "Durood", "Dua", "Akhlaq", "Motivation", "Other"];
const jobFilters = [
  { label: "All", value: "all" },
  { label: "Queued", value: "queued" },
  { label: "Active", value: "active" },
  { label: "Failed", value: "failed" },
  { label: "Published", value: "published" },
] as const;

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
  defaultLanguageId: string;
  requestedBy: string;
  languages: EditionLanguageEditorItem[];
};

type EditionVolumeEditorItem = {
  id: string;
  title: string;
  subtitle: string;
  order: string;
  manifestUrl: string;
  introNote: string;
  todayTarget: string;
  sections: SectionEditorItem[];
  plans: PlanEditorItem[];
};

type PlanEditorItem = {
  id: string;
  title: string;
  description: string;
  totalDays: string;
  items: PlanDayEditorItem[];
};

type PlanDayEditorItem = {
  day: string;
  label: string;
  startPage: string;
  endPage: string;
  estimatedMinutes: string;
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

const publicAppwriteConfig = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  sourcePdfsBucketId: process.env.NEXT_PUBLIC_APPWRITE_SOURCE_PDFS_BUCKET_ID,
};

type PublishedMetadataPayload = {
  title?: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
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
      introNote?: string;
      todayTarget?: string;
      sections?: unknown[];
      plans?: unknown[];
    }[];
  }[];
};

function createEmptyVolume(): EditionVolumeEditorItem {
  return {
    id: "",
    title: "",
    subtitle: "",
    order: "",
    manifestUrl: "",
    introNote: "",
    todayTarget: "",
    sections: getDefaultSections(),
    plans: [],
  };
}

function createEmptyPlanDay(): PlanDayEditorItem {
  return {
    day: "",
    label: "",
    startPage: "",
    endPage: "",
    estimatedMinutes: "",
  };
}

function createEmptyPlan(): PlanEditorItem {
  return {
    id: "",
    title: "",
    description: "",
    totalDays: "",
    items: [createEmptyPlanDay()],
  };
}

function createEmptyLanguage(): EditionLanguageEditorItem {
  return {
    id: "",
    title: "",
    nativeTitle: "",
    summary: "",
    order: "",
    defaultVolumeId: "",
    volumes: [createEmptyVolume()],
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

function getDefaultSections() {
  return [
    {
      id: "muqaddimah",
      title: "Muqaddimah",
      subtitle: "Opening pages and devotional framing",
      kind: "front-matter",
      startPage: "1",
      endPage: "12",
      entryPage: "1",
      order: "1",
      estimatedMinutes: "8",
      description: "A gentle place to begin.",
    },
  ];
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

function normalizePlans(value: unknown[] | undefined): PlanEditorItem[] {
  if (!value || value.length === 0) {
    return [];
  }

  return value.map((plan) => {
    const item = plan as Record<string, unknown>;
    const rawItems = Array.isArray(item.items) ? item.items : [];
    return {
      id: String(item.id || ""),
      title: String(item.title || ""),
      description: String(item.description || ""),
      totalDays: item.totalDays == null ? "" : String(item.totalDays),
      items: rawItems.length
        ? rawItems.map((dayItem) => {
          const day = dayItem as Record<string, unknown>;
          return {
            day: day.day == null ? "" : String(day.day),
            label: String(day.label || ""),
            startPage: day.startPage == null ? "" : String(day.startPage),
            endPage: day.endPage == null ? "" : String(day.endPage),
            estimatedMinutes:
              day.estimatedMinutes == null ? "" : String(day.estimatedMinutes),
          };
        })
        : [createEmptyPlanDay()],
    };
  });
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
        id: fallbackLanguageId,
        title: fallbackLanguageId,
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
            manifestUrl: "",
            introNote: "",
            todayTarget: "",
            sections: getDefaultSections(),
            plans: [],
          },
        ],
      },
    ];
  }

  return value.map((language, languageIndex) => ({
    id: String(language.id || ""),
    title: String(language.title || language.id || ""),
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
          manifestUrl: String(volume.manifestUrl || ""),
          introNote: String(volume.introNote || ""),
          todayTarget: String(volume.todayTarget || ""),
          sections: normalizeSections(volume.sections),
          plans: normalizePlans((volume as { plans?: unknown[] }).plans),
        }))
        : [createEmptyVolume()],
  }));
}

function buildLanguagePayload(languages: EditionLanguageEditorItem[]) {
  return languages
    .filter((language) => language.id.trim() || language.title.trim())
    .map((language, languageIndex) => {
      const id = language.id.trim();
      const title = language.title.trim();

      if (!id || !title) {
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
            manifestUrl: volume.manifestUrl.trim() || undefined,
            introNote: volume.introNote.trim() || undefined,
            todayTarget: volume.todayTarget.trim() || undefined,
            sections: buildSectionPayload(volume.sections),
            plans: volume.plans
              .filter((plan) => plan.id.trim() || plan.title.trim())
              .map((plan, planIndex) => {
                const id = plan.id.trim();
                const title = plan.title.trim();
                const totalDays = Number(plan.totalDays);

                if (!id || !title || !Number.isFinite(totalDays)) {
                  throw new Error(
                    `Plan ${planIndex + 1} in ${title || volumeTitle} is incomplete.`,
                  );
                }

                const items = plan.items
                  .filter((item) => item.day.trim() || item.label.trim())
                  .map((item, itemIndex) => {
                    const day = Number(item.day);
                    const startPage = Number(item.startPage);
                    const endPage = Number(item.endPage);
                    const estimatedMinutes = Number(item.estimatedMinutes);

                    if (
                      !Number.isFinite(day) ||
                      !item.label.trim() ||
                      !Number.isFinite(startPage) ||
                      !Number.isFinite(endPage) ||
                      !Number.isFinite(estimatedMinutes)
                    ) {
                      throw new Error(
                        `Plan day ${itemIndex + 1} in ${title} is incomplete.`,
                      );
                    }

                    return {
                      day,
                      label: item.label.trim(),
                      startPage,
                      endPage,
                      estimatedMinutes,
                    };
                  });

                if (items.length === 0) {
                  throw new Error(`Plan ${title} needs at least one day item.`);
                }

                return {
                  id,
                  title,
                  description: plan.description.trim(),
                  totalDays,
                  items,
                };
              }),
          };
        });

      if (volumes.length === 0) {
        throw new Error(`Language ${title} needs at least one volume.`);
      }

      return {
        languageId: id,
        title,
        nativeTitle: language.nativeTitle.trim() || undefined,
        summary: language.summary.trim() || undefined,
        order: language.order.trim() ? Number(language.order) : undefined,
        defaultVolumeId: language.defaultVolumeId.trim() || undefined,
        volumes,
      };
    });
}

function buildSectionPayload(sections: SectionEditorItem[]) {
  return sections
    .filter((section) => section.id.trim() || section.title.trim())
    .map((section, index) => {
      const id = section.id.trim();
      const title = section.title.trim();
      const startPage = Number(section.startPage);
      const endPage = Number(section.endPage);
      const estimatedMinutes = Number(section.estimatedMinutes);

      if (!id || !title || !Number.isFinite(startPage) || !Number.isFinite(endPage) || !Number.isFinite(estimatedMinutes)) {
        throw new Error(`Section ${index + 1} is incomplete.`);
      }

      return {
        id,
        title,
        subtitle: section.subtitle.trim() || undefined,
        kind: section.kind || undefined,
        startPage,
        endPage,
        estimatedMinutes,
        description: section.description.trim() || undefined,
        entryPage: section.entryPage.trim() ? Number(section.entryPage) : undefined,
        order: section.order.trim() ? Number(section.order) : undefined,
      };
    });
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
  const [isRepublishingMetadata, setIsRepublishingMetadata] = useState(false);
  const [metadataState, setMetadataState] = useState<SubmissionState>({});
  const [metadataForm, setMetadataForm] = useState<MetadataFormState>({
    bookSlug: "",
    title: "",
    subtitle: "",
    author: "",
    description: "",
    category: "Other",
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

      const response = await fetch("/api/books/republish-metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...metadataForm,
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
                  <select name="category" defaultValue="" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300">
                    <option value="">-- Select Category --</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
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

        <section className="mt-8 rounded-3xl border border-stone-800 bg-stone-900/80 p-6 shadow-2xl shadow-black/20">
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
                    setMetadataForm((current) => ({
                      ...current,
                      bookSlug: slug,
                      title: knownBook?.title || current.title,
                      subtitle: knownBook?.subtitle || current.subtitle,
                      author: knownBook?.author || current.author,
                      description: knownBook?.description || current.description,
                      category: knownBook?.category || current.category,
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
                    <option key={category} value={category}>
                      {category}
                    </option>
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

            <div className="space-y-4 rounded-3xl border border-stone-800 bg-stone-950/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-sm text-stone-200">Languages and Volumes</span>
                  <p className="mt-1 text-xs leading-5 text-stone-400">
                    Define which languages exist under this book and which volumes belong to each language.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMetadataForm((current) => ({
                      ...current,
                      languages: [...current.languages, createEmptyLanguage()],
                    }));
                  }}
                  className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-amber-300 hover:text-amber-200"
                >
                  Add language
                </button>
              </div>

              <label className="block space-y-2">
                <span className="text-xs text-stone-300">Default language ID</span>
                <input
                  value={metadataForm.defaultLanguageId}
                  onChange={(event) => {
                    setMetadataForm((current) => ({
                      ...current,
                      defaultLanguageId: event.target.value,
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
                  {metadataForm.languages.map((language, languageIndex) => (
                    <div
                      key={`${language.id || "language"}-${languageIndex}`}
                      className="rounded-3xl border border-stone-800 bg-stone-950/60 p-4"
                    >
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-stone-100">Language {languageIndex + 1}</p>
                          <p className="text-xs text-stone-400">
                            One reading edition family with its own default volume and ordering.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMetadataForm((current) => ({
                              ...current,
                              languages: current.languages.filter((_, currentIndex) => currentIndex !== languageIndex),
                            }));
                          }}
                          className="rounded-full border border-rose-900/60 px-4 py-2 text-xs font-medium text-rose-200 transition hover:border-rose-400 hover:text-rose-100"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-xs text-stone-300">Language ID</span>
                          <input
                            value={language.id}
                            onChange={(event) => {
                              const value = event.target.value;
                              setMetadataForm((current) => ({
                                ...current,
                                languages: current.languages.map((item, currentIndex) =>
                                  currentIndex === languageIndex ? { ...item, id: value } : item,
                                ),
                              }));
                            }}
                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                            placeholder="roman-urdu"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs text-stone-300">Title</span>
                          <input
                            value={language.title}
                            onChange={(event) => {
                              const value = event.target.value;
                              setMetadataForm((current) => ({
                                ...current,
                                languages: current.languages.map((item, currentIndex) =>
                                  currentIndex === languageIndex ? { ...item, title: value } : item,
                                ),
                              }));
                            }}
                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                            placeholder="Roman Urdu"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs text-stone-300">Native title</span>
                          <input
                            value={language.nativeTitle}
                            onChange={(event) => {
                              const value = event.target.value;
                              setMetadataForm((current) => ({
                                ...current,
                                languages: current.languages.map((item, currentIndex) =>
                                  currentIndex === languageIndex ? { ...item, nativeTitle: value } : item,
                                ),
                              }));
                            }}
                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                          />
                        </label>
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
                            <span className="text-xs uppercase tracking-[0.18em] text-stone-400">Volumes</span>
                            <p className="mt-1 text-xs text-stone-500">
                              Each language can carry one or more publishable reading volumes.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setMetadataForm((current) => ({
                                ...current,
                                languages: current.languages.map((item, currentIndex) =>
                                  currentIndex === languageIndex
                                    ? { ...item, volumes: [...item.volumes, createEmptyVolume()] }
                                    : item,
                                ),
                              }));
                            }}
                            className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-200 transition hover:border-amber-300 hover:text-amber-200"
                          >
                            Add volume
                          </button>
                        </div>

                        {language.volumes.map((volume, volumeIndex) => (
                          <div
                            key={`${volume.id || "volume"}-${volumeIndex}`}
                            className="rounded-2xl border border-stone-800 bg-stone-900/40 p-4"
                          >
                            <div className="mb-4 flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-medium text-stone-100">Volume {volumeIndex + 1}</p>
                                <p className="text-xs text-stone-400">
                                  This is the concrete readable unit for the selected language.
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
                                          volumes: item.volumes.filter((_, currentVolumeIndex) => currentVolumeIndex !== volumeIndex),
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

                            <div className="mt-5 space-y-4">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <span className="text-sm text-stone-200">Plans</span>
                                  <p className="mt-1 text-xs leading-5 text-stone-400">
                                    Author reading plans for this specific volume.
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
                                                  plans: [...currentVolume.plans, createEmptyPlan()],
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
                                  Add plan
                                </button>
                              </div>

                              {volume.plans.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-stone-700 bg-stone-950/60 p-4 text-sm text-stone-400">
                                  No plans yet for this volume.
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {volume.plans.map((plan, planIndex) => (
                                    <div
                                      key={`${plan.id || "plan"}-${planIndex}`}
                                      className="rounded-3xl border border-stone-800 bg-stone-950/60 p-4"
                                    >
                                      <div className="mb-4 flex items-center justify-between gap-4">
                                        <div>
                                          <p className="text-sm font-medium text-stone-100">Plan {planIndex + 1}</p>
                                          <p className="text-xs text-stone-400">A structured pace for this volume.</p>
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
                                                          plans: currentVolume.plans.filter((_, currentPlanIndex) => currentPlanIndex !== planIndex),
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
                                          <span className="text-xs text-stone-300">Plan ID</span>
                                          <input
                                            value={plan.id}
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
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? { ...currentPlan, id: value } : currentPlan,
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
                                            value={plan.title}
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
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? { ...currentPlan, title: value } : currentPlan,
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
                                          <span className="text-xs text-stone-300">Total days</span>
                                          <input
                                            inputMode="numeric"
                                            value={plan.totalDays}
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
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? { ...currentPlan, totalDays: value } : currentPlan,
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
                                        <label className="space-y-2 md:col-span-2">
                                          <span className="text-xs text-stone-300">Description</span>
                                          <textarea
                                            rows={3}
                                            value={plan.description}
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
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? { ...currentPlan, description: value } : currentPlan,
                                                            ),
                                                          }
                                                          : currentVolume,
                                                      ),
                                                    }
                                                    : item,
                                                ),
                                              }));
                                            }}
                                            className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 outline-none transition focus:border-amber-300"
                                          />
                                        </label>
                                      </div>

                                      <div className="mt-4 space-y-3">
                                        <div className="flex items-center justify-between gap-4">
                                          <span className="text-xs uppercase tracking-[0.18em] text-stone-400">Plan days</span>
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
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex
                                                                ? { ...currentPlan, items: [...currentPlan.items, createEmptyPlanDay()] }
                                                                : currentPlan,
                                                            ),
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
                                            Add day
                                          </button>
                                        </div>

                                        {plan.items.map((planItem, itemIndex) => (
                                          <div
                                            key={`${planItem.day || "day"}-${itemIndex}`}
                                            className="rounded-2xl border border-stone-800 bg-stone-900/40 p-4"
                                          >
                                            <div className="mb-3 flex items-center justify-between gap-4">
                                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
                                                Day {itemIndex + 1}
                                              </p>
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
                                                                plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                                  currentPlanIndex === planIndex
                                                                    ? {
                                                                      ...currentPlan,
                                                                      items: currentPlan.items.filter((_, currentItemIndex) => currentItemIndex !== itemIndex),
                                                                    }
                                                                    : currentPlan,
                                                                ),
                                                              }
                                                              : currentVolume,
                                                          ),
                                                        }
                                                        : item,
                                                    ),
                                                  }));
                                                }}
                                                className="rounded-full border border-rose-900/60 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:border-rose-400 hover:text-rose-100"
                                              >
                                                Remove
                                              </button>
                                            </div>
                                            <div className="grid gap-4 md:grid-cols-2">
                                              <label className="space-y-2">
                                                <span className="text-xs text-stone-300">Day</span>
                                                <input inputMode="numeric" value={planItem.day} onChange={(event) => {
                                                  const value = event.target.value;
                                                  setMetadataForm((current) => ({
                                                    ...current,
                                                    languages: current.languages.map((item, currentIndex) =>
                                                      currentIndex === languageIndex ? {
                                                        ...item,
                                                        volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                          currentVolumeIndex === volumeIndex ? {
                                                            ...currentVolume,
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? {
                                                                ...currentPlan,
                                                                items: currentPlan.items.map((currentItem, currentItemIndex) =>
                                                                  currentItemIndex === itemIndex ? { ...currentItem, day: value } : currentItem,
                                                                ),
                                                              } : currentPlan,
                                                            ),
                                                          } : currentVolume,
                                                        ),
                                                      } : item,
                                                    ),
                                                  }));
                                                }} className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                                              </label>
                                              <label className="space-y-2">
                                                <span className="text-xs text-stone-300">Label</span>
                                                <input value={planItem.label} onChange={(event) => {
                                                  const value = event.target.value;
                                                  setMetadataForm((current) => ({
                                                    ...current,
                                                    languages: current.languages.map((item, currentIndex) =>
                                                      currentIndex === languageIndex ? {
                                                        ...item,
                                                        volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                          currentVolumeIndex === volumeIndex ? {
                                                            ...currentVolume,
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? {
                                                                ...currentPlan,
                                                                items: currentPlan.items.map((currentItem, currentItemIndex) =>
                                                                  currentItemIndex === itemIndex ? { ...currentItem, label: value } : currentItem,
                                                                ),
                                                              } : currentPlan,
                                                            ),
                                                          } : currentVolume,
                                                        ),
                                                      } : item,
                                                    ),
                                                  }));
                                                }} className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                                              </label>
                                              <label className="space-y-2">
                                                <span className="text-xs text-stone-300">Start page</span>
                                                <input inputMode="numeric" value={planItem.startPage} onChange={(event) => {
                                                  const value = event.target.value;
                                                  setMetadataForm((current) => ({
                                                    ...current,
                                                    languages: current.languages.map((item, currentIndex) =>
                                                      currentIndex === languageIndex ? {
                                                        ...item,
                                                        volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                          currentVolumeIndex === volumeIndex ? {
                                                            ...currentVolume,
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? {
                                                                ...currentPlan,
                                                                items: currentPlan.items.map((currentItem, currentItemIndex) =>
                                                                  currentItemIndex === itemIndex ? { ...currentItem, startPage: value } : currentItem,
                                                                ),
                                                              } : currentPlan,
                                                            ),
                                                          } : currentVolume,
                                                        ),
                                                      } : item,
                                                    ),
                                                  }));
                                                }} className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                                              </label>
                                              <label className="space-y-2">
                                                <span className="text-xs text-stone-300">End page</span>
                                                <input inputMode="numeric" value={planItem.endPage} onChange={(event) => {
                                                  const value = event.target.value;
                                                  setMetadataForm((current) => ({
                                                    ...current,
                                                    languages: current.languages.map((item, currentIndex) =>
                                                      currentIndex === languageIndex ? {
                                                        ...item,
                                                        volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                          currentVolumeIndex === volumeIndex ? {
                                                            ...currentVolume,
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? {
                                                                ...currentPlan,
                                                                items: currentPlan.items.map((currentItem, currentItemIndex) =>
                                                                  currentItemIndex === itemIndex ? { ...currentItem, endPage: value } : currentItem,
                                                                ),
                                                              } : currentPlan,
                                                            ),
                                                          } : currentVolume,
                                                        ),
                                                      } : item,
                                                    ),
                                                  }));
                                                }} className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                                              </label>
                                              <label className="space-y-2">
                                                <span className="text-xs text-stone-300">Estimated minutes</span>
                                                <input inputMode="numeric" value={planItem.estimatedMinutes} onChange={(event) => {
                                                  const value = event.target.value;
                                                  setMetadataForm((current) => ({
                                                    ...current,
                                                    languages: current.languages.map((item, currentIndex) =>
                                                      currentIndex === languageIndex ? {
                                                        ...item,
                                                        volumes: item.volumes.map((currentVolume, currentVolumeIndex) =>
                                                          currentVolumeIndex === volumeIndex ? {
                                                            ...currentVolume,
                                                            plans: currentVolume.plans.map((currentPlan, currentPlanIndex) =>
                                                              currentPlanIndex === planIndex ? {
                                                                ...currentPlan,
                                                                items: currentPlan.items.map((currentItem, currentItemIndex) =>
                                                                  currentItemIndex === itemIndex ? { ...currentItem, estimatedMinutes: value } : currentItem,
                                                                ),
                                                              } : currentPlan,
                                                            ),
                                                          } : currentVolume,
                                                        ),
                                                      } : item,
                                                    ),
                                                  }));
                                                }} className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                                              </label>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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

        <section className="mt-8 rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
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
      </div>
    </main>
  );
}

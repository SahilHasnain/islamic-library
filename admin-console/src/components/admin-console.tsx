"use client";

import { FormEvent, useMemo, useState } from "react";

import { uploadPdfWithProgress } from "@/lib/appwrite-client";
import type {
  JobListItem,
  BookRecord,
  MetadataEditInput,
  MonitoringSnapshot,
  MonitoringSummary,
  PublishEventRecord,
  RecoveryAction,
} from "@/lib/ingestion";

const jobFilters = [
  { label: "All", value: "all" },
  { label: "Queued", value: "queued" },
  { label: "Active", value: "active" },
  { label: "Failed", value: "failed" },
  { label: "Published", value: "published" },
] as const;

function slugifyTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

type SubmissionState = {
  error?: string;
  message?: string;
  jobId?: string;
  slug?: string;
  uploadProgress?: number;
};

type TocVolumeOption = {
  id: string;
  title?: string;
  tocEntries?: MetadataEditInput["tocEntries"];
};

type TocLanguageOption = {
  id: string;
  title?: string;
  volumes: TocVolumeOption[];
};

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
  const [books, setBooks] = useState<BookRecord[]>(initialSnapshot.books);
  const [jobsError, setJobsError] = useState<string>();
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [dispatchingJobId, setDispatchingJobId] = useState<string>();
  const [recoveringJobId, setRecoveringJobId] = useState<string>();
  const [jobFilter, setJobFilter] = useState<(typeof jobFilters)[number]["value"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeWorkspace, setActiveWorkspace] = useState<"upload" | "jobs" | "metadata" | "events">("upload");
  const [titleValue, setTitleValue] = useState("");
  const [metadataBookId, setMetadataBookId] = useState("");
  const [metadataDraft, setMetadataDraft] = useState<MetadataEditInput | null>(null);
  const [metadataSearch, setMetadataSearch] = useState("");
  const [metadataState, setMetadataState] = useState<{ error?: string; message?: string }>({});
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [tocLanguages, setTocLanguages] = useState<TocLanguageOption[]>([]);
  const [isLoadingToc, setIsLoadingToc] = useState(false);
  const [tocAnalysisId, setTocAnalysisId] = useState<string>();
  const [tocAnalysisStatus, setTocAnalysisStatus] = useState<string>();
  const [metadataAnalysisId, setMetadataAnalysisId] = useState<string>();
  const [metadataAnalysisStatus, setMetadataAnalysisStatus] = useState<string>();

  const autoSlug = useMemo(() => slugifyTitle(titleValue), [titleValue]);

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

  const bookGroups = useMemo(() => {
    const groups = new Map<string, { key: string; book: BookRecord; editions: BookRecord[] }>();

    for (const book of books) {
      const key = book.canonicalBookSlug || book.slug;
      const current = groups.get(key);
      if (current) {
        current.editions.push(book);
        if (!current.book.metadataUrl && book.metadataUrl) {
          current.book = book;
        }
      } else {
        groups.set(key, { key, book, editions: [book] });
      }
    }

    return [...groups.values()];
  }, [books]);

  const filteredBookGroups = useMemo(() => {
    const normalizedQuery = metadataSearch.trim().toLowerCase();
    return bookGroups.filter(({ book, editions }) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        book.title,
        book.slug,
        book.author,
        book.category,
        ...editions.flatMap((edition) => [edition.languageId, edition.volumeId]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [bookGroups, metadataSearch]);

  const selectedMetadataBook = books.find((book) => book.$id === metadataBookId);

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
      setBooks(payload.books || []);
    } catch {
      setJobsError("Could not load jobs.");
    } finally {
      setIsLoadingJobs(false);
    }
  }

  async function selectBookForMetadata(book: BookRecord) {
    setMetadataBookId(book.$id);
    setMetadataDraft({
      title: book.title || "",
      author: book.author || "",
      category: book.category || "",
      nextRecommendedBookId: book.nextRecommendedBookId || "",
      defaultLanguageId: book.defaultLanguageId || book.languageId || "",
      recommendations: (book.recommendations || []).map((recommendation) => ({
        bookId: recommendation.bookId,
        reason: recommendation.reason || "",
        type: recommendation.type || "same-topic",
        score: recommendation.score || 1,
      })),
      tocLanguageId: "",
      tocVolumeId: "",
      tocEntries: [],
    });
    setMetadataState({});
    setTocAnalysisId(undefined);
    setTocAnalysisStatus(undefined);
    setMetadataAnalysisId(undefined);
    setMetadataAnalysisStatus(undefined);

    if (!book.metadataUrl) {
      setTocLanguages([]);
      return;
    }

    setIsLoadingToc(true);
    try {
      const response = await fetch(`/api/assets/json?url=${encodeURIComponent(book.metadataUrl)}`);
      if (!response.ok) {
        throw new Error("Could not load the current table of contents.");
      }

      const metadata = (await response.json()) as {
        languages?: Array<{
          id: string;
          title?: string;
          volumes?: Array<{
            id: string;
            title?: string;
            tocEntries?: MetadataEditInput["tocEntries"];
          }>;
        }>;
      };
      const languages = (metadata.languages || []).map((language) => ({
        id: language.id,
        title: language.title,
        volumes: (language.volumes || []).map((volume) => ({
          id: volume.id,
          title: volume.title,
          tocEntries: Array.isArray(volume.tocEntries) ? volume.tocEntries : [],
        })),
      }));
      setTocLanguages(languages);

      const selectedLanguage =
        languages.find((language) => language.id === (book.defaultLanguageId || book.languageId)) || languages[0];
      const selectedVolume =
        selectedLanguage?.volumes.find((volume) => volume.id === (book.defaultVolumeId || book.volumeId)) ||
        selectedLanguage?.volumes[0];

      setMetadataDraft((current) => current ? {
        ...current,
        tocLanguageId: selectedLanguage?.id || "",
        tocVolumeId: selectedVolume?.id || "",
        tocEntries: selectedVolume?.tocEntries || [],
      } : current);
    } catch (error) {
      setMetadataState({
        error: error instanceof Error ? error.message : "Could not load the current table of contents.",
      });
      setTocLanguages([]);
    } finally {
      setIsLoadingToc(false);
    }
  }

  function selectTocLocation(languageId: string, volumeId: string) {
    const language = tocLanguages.find((candidate) => candidate.id === languageId);
    const volume = language?.volumes.find((candidate) => candidate.id === volumeId);
    setMetadataDraft((current) => current ? {
      ...current,
      tocLanguageId: languageId,
      tocVolumeId: volumeId,
      tocEntries: volume?.tocEntries || [],
    } : current);
  }

  async function handleGenerateToc() {
    if (!metadataBookId || !metadataDraft?.tocLanguageId || !metadataDraft.tocVolumeId) return;

    setTocAnalysisStatus("starting");
    setMetadataState({});
    try {
      const startResponse = await fetch(`/api/books/${metadataBookId}/toc/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languageId: metadataDraft.tocLanguageId,
          volumeId: metadataDraft.tocVolumeId,
        }),
      });
      const startPayload = (await startResponse.json()) as { analysisId?: string; error?: string };
      if (!startResponse.ok || !startPayload.analysisId) {
        throw new Error(startPayload.error || "Could not start AI TOC analysis.");
      }

      setTocAnalysisId(startPayload.analysisId);
      // Gemini may retry a slow provider request; keep polling longer than the
      // provider's retry budget without treating a still-running analysis as failed.
      for (let attempt = 0; attempt < 450; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(
          `/api/books/${metadataBookId}/toc/status?analysisId=${encodeURIComponent(startPayload.analysisId)}`,
        );
        const statusPayload = (await statusResponse.json()) as {
          status?: string;
          phase?: string;
          error?: string;
          result?: { tocEntries?: MetadataEditInput["tocEntries"] };
        };
        if (!statusResponse.ok) throw new Error(statusPayload.error || "Could not read AI TOC status.");
        setTocAnalysisStatus(statusPayload.phase || statusPayload.status || "processing");

        if (statusPayload.status === "completed") {
          const tocEntries = statusPayload.result?.tocEntries || [];
          setMetadataDraft((current) => current ? { ...current, tocEntries } : current);
          setMetadataState({ message: `AI generated ${tocEntries.length} TOC entries. Review the draft, then save and publish.` });
          return;
        }
        if (statusPayload.status === "failed") {
          throw new Error(statusPayload.error || "AI TOC analysis failed.");
        }
      }
      throw new Error("AI TOC analysis timed out.");
    } catch (error) {
      setTocAnalysisStatus("failed");
      setMetadataState({ error: error instanceof Error ? error.message : "AI TOC analysis failed." });
    }
  }

  async function handleGenerateMetadata() {
    if (!metadataBookId) return;
    setMetadataAnalysisStatus("starting");
    setMetadataState({});

    try {
      const startResponse = await fetch(`/api/books/${metadataBookId}/metadata/ai`, { method: "POST" });
      const startPayload = (await startResponse.json()) as { analysisId?: string; error?: string };
      if (!startResponse.ok || !startPayload.analysisId) {
        throw new Error(startPayload.error || "Could not start AI metadata analysis.");
      }

      setMetadataAnalysisId(startPayload.analysisId);
      for (let attempt = 0; attempt < 450; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const response = await fetch(
          `/api/books/${metadataBookId}/toc/status?analysisId=${encodeURIComponent(startPayload.analysisId)}`,
        );
        const payload = (await response.json()) as {
          status?: string;
          phase?: string;
          error?: string;
          result?: {
            draft?: {
              author?: string;
              category?: string;
              nextRecommendedBookId?: string;
              recommendations?: MetadataEditInput["recommendations"];
            };
          };
        };
        if (!response.ok) throw new Error(payload.error || "Could not read AI metadata status.");
        setMetadataAnalysisStatus(payload.phase || payload.status || "processing");

        if (payload.status === "completed") {
          const draft = payload.result?.draft;
          if (!draft) throw new Error("AI returned an empty metadata draft.");
          setMetadataDraft((current) => current ? {
            ...current,
            author: draft.author || current.author,
            category: draft.category || current.category,
            nextRecommendedBookId: draft.nextRecommendedBookId || current.nextRecommendedBookId,
            recommendations: draft.recommendations || current.recommendations,
          } : current);
          setMetadataState({ message: "AI metadata draft ready. Review it, then save and publish." });
          return;
        }
        if (payload.status === "failed") throw new Error(payload.error || "AI metadata analysis failed.");
      }
      throw new Error("AI metadata analysis timed out.");
    } catch (error) {
      setMetadataAnalysisStatus("failed");
      setMetadataState({ error: error instanceof Error ? error.message : "AI metadata analysis failed." });
    }
  }

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!metadataBookId || !metadataDraft) {
      return;
    }

    setIsSavingMetadata(true);
    setMetadataState({});

    try {
      const response = await fetch(`/api/books/${metadataBookId}/metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadataDraft),
      });
      const payload = (await response.json()) as { error?: string; book?: BookRecord };

      if (!response.ok || !payload.book) {
        setMetadataState({ error: payload.error || "Could not publish metadata." });
        return;
      }

      setBooks((current) => current.map((book) => (book.$id === payload.book?.$id ? payload.book : book)));
      setMetadataState({ message: "Metadata saved and published to the public catalog." });
      await loadJobs();
    } catch (error) {
      setMetadataState({
        error: error instanceof Error ? error.message : "Could not publish metadata.",
      });
    } finally {
      setIsSavingMetadata(false);
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

      const title = titleValue.trim();
      if (!title) {
        setState({ error: "Title is required." });
        return;
      }

      setState({ message: "Uploading source PDF..." });
      const sourceFileId = await uploadPdfDirect(pdf, (progress) => {
        setState({ message: `Uploading source PDF... ${progress}%`, uploadProgress: progress });
      });

      const requestBody = {
        title,
        slug: autoSlug,
        subtitle: "",
        author: "",
        category: "",
        createdBy: "admin-console",
        languageId: String(formData.get("languageId") || ""),
        volumeId: String(formData.get("volumeId") || ""),
        printedPageStartPage: String(formData.get("printedPageStartPage") || ""),
        description: "",
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
      setTitleValue("");
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
            language/volume ingestion job. <strong className="text-amber-300">For new books:</strong> provide a title and pick a language/volume. <strong className="text-amber-300">For a new edition of an existing book:</strong> type the existing book&apos;s title and the slug will match automatically.
          </p>
        </div>

        <nav className="mb-8 flex flex-wrap gap-2 rounded-3xl border border-stone-800 bg-stone-900/70 p-2">
          {[
            { id: "upload", label: "Upload PDF" },
            { id: "jobs", label: "Jobs" },
            { id: "metadata", label: "Metadata" },
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
                  <span className="text-sm text-stone-200">Title <span className="text-rose-300">*</span></span>
                  <input
                    value={titleValue}
                    onChange={(event) => setTitleValue(event.target.value)}
                    className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                    placeholder="Light of the Prophet"
                  />
                  {autoSlug ? (
                    <span className="block text-xs text-stone-500">
                      Book slug: <span className="text-amber-300">{autoSlug}</span>
                    </span>
                  ) : null}
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
                <li><strong>New Book:</strong> Fill in the title</li>
                <li><strong>New Edition:</strong> Use the existing book&apos;s exact title; the slug will match</li>
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
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Published Jobs</p>
            <p className="mt-3 text-3xl font-semibold text-stone-50">{summary.publishedJobs}</p>
            <p className="mt-2 text-sm text-stone-400">Jobs that completed publishing to the public bucket.</p>
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

        {activeWorkspace === "metadata" ? (
          <section className="grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Published Books</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-50">Choose a book</h2>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                Choose a logical book once. Metadata changes apply to all of its language and volume editions without rerendering PDFs.
              </p>
              <input
                value={metadataSearch}
                onChange={(event) => setMetadataSearch(event.target.value)}
                placeholder="Search title, slug, author..."
                className="mt-5 w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-amber-300"
              />
              <div className="mt-5 space-y-2">
                {filteredBookGroups.length === 0 ? (
                  <p className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4 text-sm text-stone-400">
                    No books match this search.
                  </p>
                ) : (
                  filteredBookGroups.map(({ key, book, editions }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectBookForMetadata(book)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${metadataBookId === book.$id
                        ? "border-amber-300 bg-amber-950/30"
                        : "border-stone-800 bg-stone-950/60 hover:border-amber-300/60"
                      }`}
                    >
                      <p className="font-medium text-stone-50">{book.title}</p>
                      <p className="mt-1 text-xs text-stone-400">{book.slug}</p>
                      <p className="mt-2 text-xs text-stone-500">
                        {editions.length} {editions.length === 1 ? "edition" : "editions"} · {editions
                          .map((edition) => `${edition.languageId}/${edition.volumeId}`)
                          .join(", ")}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Metadata Editor</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-50">
                {selectedMetadataBook?.title || "Select a book"}
              </h2>

              {!metadataDraft ? (
                <p className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5 text-sm leading-6 text-stone-400">
                  Select a book to edit its shared metadata. Saving updates every edition record and republishes `metadata.json` plus the public catalog.
                </p>
              ) : (
                <form className="mt-5 space-y-5" onSubmit={handleMetadataSave}>
                  <div className="flex flex-col gap-3 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-amber-200">AI metadata assistant</p>
                      <p className="mt-1 text-xs leading-5 text-amber-200/70">
                        Suggest author, category, next reading, and related books from the PDF and existing catalog.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={metadataAnalysisStatus === "starting" || metadataAnalysisStatus === "processing"}
                      onClick={() => void handleGenerateMetadata()}
                      className="shrink-0 rounded-full bg-amber-300 px-4 py-2 text-xs font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {metadataAnalysisStatus === "starting" || metadataAnalysisStatus === "processing" ? "Generating..." : "Generate with AI"}
                    </button>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm text-stone-200">Title <span className="text-rose-300">*</span></span>
                      <input
                        required
                        maxLength={255}
                        value={metadataDraft.title}
                        onChange={(event) => setMetadataDraft({ ...metadataDraft, title: event.target.value })}
                        className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-stone-200">Author</span>
                      <input
                        maxLength={255}
                        value={metadataDraft.author}
                        onChange={(event) => setMetadataDraft({ ...metadataDraft, author: event.target.value })}
                        className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-stone-200">Category</span>
                      <input
                        maxLength={120}
                        value={metadataDraft.category}
                        onChange={(event) => setMetadataDraft({ ...metadataDraft, category: event.target.value })}
                        className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-stone-200">Default language ID</span>
                      <input
                        maxLength={64}
                        value={metadataDraft.defaultLanguageId}
                        onChange={(event) => setMetadataDraft({ ...metadataDraft, defaultLanguageId: event.target.value })}
                        className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-stone-200">Next recommended book ID</span>
                      <input
                        maxLength={128}
                        value={metadataDraft.nextRecommendedBookId}
                        onChange={(event) => setMetadataDraft({ ...metadataDraft, nextRecommendedBookId: event.target.value })}
                        className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300"
                        placeholder="Optional book slug"
                      />
                    </label>
                  </div>

                  {metadataDraft.recommendations.length > 0 ? (
                    <div className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-400">AI recommendations</p>
                      <p className="mt-2 text-sm text-stone-300">
                        Next reading: <span className="text-amber-200">{metadataDraft.nextRecommendedBookId || "Not selected"}</span>
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-stone-400">
                        {metadataDraft.recommendations.map((recommendation) => (
                          <li key={recommendation.bookId} className="flex justify-between gap-4 rounded-xl border border-stone-800 px-3 py-2">
                            <span>{recommendation.bookId}</span>
                            <span className="text-xs text-stone-500">{recommendation.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {metadataAnalysisId ? <p className="text-xs text-stone-500">Metadata analysis: {metadataAnalysisId} · {metadataAnalysisStatus || "ready"}</p> : null}

                  <div className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-400">AI table of contents</p>
                        <p className="mt-2 text-sm leading-6 text-stone-400">
                          Generate a TOC from the selected edition&apos;s source PDF, review the draft, then approve it with the metadata publish.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isLoadingToc || tocAnalysisStatus === "starting" || tocAnalysisStatus === "processing" || !metadataDraft.tocLanguageId || !metadataDraft.tocVolumeId}
                        onClick={() => void handleGenerateToc()}
                        className="rounded-full border border-amber-300/70 px-4 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-300 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                      >
                        {tocAnalysisStatus === "starting" || tocAnalysisStatus === "processing" ? "Generating..." : "Generate with AI"}
                      </button>
                    </div>

                    {isLoadingToc ? (
                      <p className="mt-4 text-sm text-stone-400">Loading edition metadata...</p>
                    ) : tocLanguages.length === 0 ? (
                      <p className="mt-4 text-sm text-stone-400">No published language or volume metadata was found.</p>
                    ) : (
                      <>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm text-stone-200">Language</span>
                            <select
                              value={metadataDraft.tocLanguageId}
                              onChange={(event) => {
                                const language = tocLanguages.find((candidate) => candidate.id === event.target.value);
                                selectTocLocation(event.target.value, language?.volumes[0]?.id || "");
                              }}
                              className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none focus:border-amber-300"
                            >
                              {tocLanguages.map((language) => <option key={language.id} value={language.id}>{language.title || language.id}</option>)}
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm text-stone-200">Volume</span>
                            <select
                              value={metadataDraft.tocVolumeId}
                              onChange={(event) => selectTocLocation(metadataDraft.tocLanguageId, event.target.value)}
                              className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none focus:border-amber-300"
                            >
                              {(tocLanguages.find((language) => language.id === metadataDraft.tocLanguageId)?.volumes || []).map((volume) => <option key={volume.id} value={volume.id}>{volume.title || volume.id}</option>)}
                            </select>
                          </label>
                        </div>
                        <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                          <p className="text-sm text-stone-300">
                            {metadataDraft.tocEntries.length
                              ? `${metadataDraft.tocEntries.length} AI-generated entries ready for review.`
                              : "No TOC draft yet. Generate one with AI."}
                          </p>
                          {metadataDraft.tocEntries.length > 0 ? (
                            <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm text-stone-300">
                              {metadataDraft.tocEntries.map((entry, index) => (
                                <li key={`${index}-${entry.title}`} className="flex gap-3 rounded-xl border border-stone-800 px-3 py-2">
                                  <span className="w-6 shrink-0 text-stone-500">{index + 1}.</span>
                                  <span className="flex-1">{entry.title}</span>
                                  <span className="text-xs text-stone-500">p. {entry.renderedPage ?? "-"}</span>
                                </li>
                              ))}
                            </ol>
                          ) : null}
                          {tocAnalysisId ? <p className="mt-3 text-xs text-stone-500">Analysis: {tocAnalysisId} · {tocAnalysisStatus || "ready"}</p> : null}
                        </div>
                      </>
                    )}
                  </div>

                  {metadataState.error ? (
                    <p className="rounded-2xl border border-rose-900/60 bg-rose-950/40 p-4 text-sm leading-6 text-rose-200">
                      {metadataState.error}
                    </p>
                  ) : metadataState.message ? (
                    <p className="rounded-2xl border border-emerald-900/60 bg-emerald-950/40 p-4 text-sm leading-6 text-emerald-200">
                      {metadataState.message}
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-stone-500">
                      This republishes metadata only. PDF pages and manifests are not rerendered.
                    </p>
                    <button
                      type="submit"
                      disabled={isSavingMetadata}
                      className="rounded-full bg-amber-300 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingMetadata ? "Publishing metadata..." : "Save and publish"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
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

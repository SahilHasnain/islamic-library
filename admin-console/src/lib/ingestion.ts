import "server-only";

import { Query } from "node-appwrite";

import { APPWRITE_IDS, appwriteDatabases } from "@/lib/appwrite";

export type JobStatus =
  | "draft"
  | "queued"
  | "processing"
  | "validating"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled"
  | "retrying";

export type BookStatus =
  | "draft"
  | "queued"
  | "processing"
  | "published"
  | "failed"
  | "archived";

export type BookRecord = {
  $id: string;
  slug: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  metadataUrl?: string;
  manifestUrl?: string;
  nextRecommendedBookId?: string;
  languageId: string;
  volumeId: string;
  defaultLanguageId?: string;
  defaultVolumeId?: string;
  sourceFileId: string;
  status: BookStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EditionVolumeInput = {
  id: string;
  title: string;
  subtitle?: string;
  order?: number;
  introNote?: string;
  todayTarget?: string;
  sourceFileId?: string;
  manifestUrl?: string;
  printedPageStartPage?: number;
  sections?: {
    id: string;
    title: string;
    subtitle?: string;
    kind?: string;
    startPage: number;
    endPage: number;
    estimatedMinutes: number;
    description?: string;
    entryPage?: number;
    order?: number;
  }[];
  plans?: {
    id: string;
    title: string;
    description: string;
    totalDays: number;
    items: {
      day: number;
      label: string;
      startPage: number;
      endPage: number;
      estimatedMinutes: number;
    }[];
  }[];
};

export type EditionLanguageInput = {
  languageId: string;
  title: string;
  nativeTitle?: string;
  summary?: string;
  order?: number;
  defaultVolumeId?: string;
  volumes: EditionVolumeInput[];
};

export type JobRecord = {
  $id: string;
  jobId: string;
  bookSlug: string;
  sourceFileId: string;
  languageId: string;
  volumeId: string;
  printedPageStartPage?: number;
  status: JobStatus;
  attempt: number;
  workerId?: string;
  workerVersion?: string;
  errorCode?: string;
  errorMessage?: string;
  outputVersion?: string;
  pageCount?: number;
  pushStatus?: "pending" | "succeeded" | "failed" | "skipped";
  pushError?: string;
  pushAttempts?: number;
  lastPushAttempt?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkerJobPayload = {
  jobId: string;
  bookSlug: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  nextRecommendedBookId?: string;
  languageId: string;
  volumeId: string;
  printedPageStartPage?: number;
  sourceFileId: string;
  requestedBy: string;
  publishMode: "public";
  dispatchToken?: string;
};

export type MetadataRepublishPayload = {
  bookSlug: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  nextRecommendedBookId?: string;
  defaultLanguageId?: string;
  requestedBy: string;
  languages?: EditionLanguageInput[];
  sections?: {
    id: string;
    title: string;
    subtitle?: string;
    kind?: string;
    startPage: number;
    endPage: number;
    estimatedMinutes: number;
    description?: string;
    entryPage?: number;
    order?: number;
  }[];
};

export type AiAnalysisDraft = {
  title?: string | null;
  subtitle?: string | null;
  author?: string | null;
  category?: string | null;
  description?: string | null;
  languageId?: string | null;
  volumeTitle?: string | null;
  printedPageStartPage?: number | null;
  sections?: EditionVolumeInput["sections"];
  confidence?: "low" | "medium" | "high";
  notes?: string;
};

export type AiAnalysisResult = {
  ok: boolean;
  pageCount?: number;
  analyzedPages?: number;
  extractableTextPages?: number;
  extractedTextPreview?: {
    page: number;
    text: string;
    textLength: number;
  }[];
  aiEnabled?: boolean;
  draft?: AiAnalysisDraft;
};

export type AiAnalysisJob = {
  ok: boolean;
  id?: string;
  analysisId?: string;
  status: "queued" | "processing" | "completed" | "failed";
  phase?: string;
  createdAt?: string;
  updatedAt?: string;
  result?: AiAnalysisResult;
  error?: string;
};

export type PublishEventRecord = {
  $id: string;
  jobId: string;
  bookSlug: string;
  status: string;
  commitSha?: string;
  catalogUrl?: string;
  metadataUrl?: string;
  manifestUrl?: string;
  createdAt: string;
};

export type JobListItem = {
  job: JobRecord;
  book?: BookRecord;
};

export type MonitoringSummary = {
  totalJobs: number;
  queuedJobs: number;
  activeJobs: number;
  failedJobs: number;
  publishedJobs: number;
  pushedJobs: number;
  pushFailedJobs: number;
  pushPendingJobs: number;
  totalBooks: number;
  publishedBooks: number;
  latestPublishedAt?: string;
};

export type MonitoringSnapshot = {
  jobs: JobListItem[];
  events: PublishEventRecord[];
  summary: MonitoringSummary;
};

export type RecoveryAction = "requeue" | "reset-stuck";

function requireWorkerEnv(name: "WORKER_API_URL" | "WORKER_API_TOKEN") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required worker environment variable: ${name}`);
  }
  return value;
}

export async function listRecentJobs(limit = 10) {
  const jobsResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    [Query.orderDesc("$createdAt"), Query.limit(limit)],
  );

  const booksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.limit(100)],
  );

  const booksBySlug = new Map(
    booksResponse.documents.map((book) => [book.slug, book as unknown as BookRecord]),
  );

  return jobsResponse.documents.map((job) => {
    const typedJob = job as unknown as JobRecord;
    return {
      job: typedJob,
      book: booksBySlug.get(typedJob.bookSlug),
    };
  });
}

export async function listRecentPublishEvents(limit = 8) {
  const response = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.publishEventsCollectionId,
    [Query.orderDesc("$createdAt"), Query.limit(limit)],
  );

  return response.documents as unknown as PublishEventRecord[];
}

export async function getMonitoringSnapshot(limit = 12): Promise<MonitoringSnapshot> {
  const [jobs, events, booksResponse, jobsResponse] = await Promise.all([
    listRecentJobs(limit),
    listRecentPublishEvents(8),
    appwriteDatabases.listDocuments(APPWRITE_IDS.databaseId, APPWRITE_IDS.booksCollectionId, [
      Query.limit(100),
    ]),
    appwriteDatabases.listDocuments(APPWRITE_IDS.databaseId, APPWRITE_IDS.jobsCollectionId, [
      Query.limit(100),
    ]),
  ]);

  const allJobs = jobsResponse.documents as unknown as JobRecord[];
  const allBooks = booksResponse.documents as unknown as BookRecord[];
  const latestPublishedAt = events.find((event) => event.status === "published")?.createdAt;
  const publishedJobs = allJobs.filter((job) => job.status === "published");
  const pushedJobs = publishedJobs.filter((job) => job.pushStatus === "succeeded").length;
  const pushFailedJobs = publishedJobs.filter((job) => job.pushStatus === "failed").length;
  const pushPendingJobs = publishedJobs.filter(
    (job) => !job.pushStatus || job.pushStatus === "pending",
  ).length;

  return {
    jobs,
    events,
    summary: {
      totalJobs: allJobs.length,
      queuedJobs: allJobs.filter((job) => job.status === "queued" || job.status === "retrying")
        .length,
      activeJobs: allJobs.filter((job) =>
        job.status === "processing" ||
        job.status === "validating" ||
        job.status === "publishing"
      ).length,
      failedJobs: allJobs.filter((job) => job.status === "failed").length,
      publishedJobs: allJobs.filter((job) => job.status === "published").length,
      pushedJobs,
      pushFailedJobs,
      pushPendingJobs,
      totalBooks: allBooks.length,
      publishedBooks: allBooks.filter((book) => book.status === "published").length,
      latestPublishedAt,
    },
  };
}

export async function getDispatchPayload(jobId: string) {
  const jobsResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    [Query.equal("jobId", jobId), Query.limit(1)],
  );

  const job = jobsResponse.documents[0] as unknown as JobRecord | undefined;
  if (!job) {
    throw new Error("Job not found.");
  }

  const booksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.equal("slug", job.bookSlug), Query.limit(1)],
  );

  const book = booksResponse.documents[0] as unknown as BookRecord | undefined;
  if (!book) {
    throw new Error("Book not found for job.");
  }

  const payload: WorkerJobPayload = {
    jobId: job.jobId,
    bookSlug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    description: book.description,
    category: book.category,
    nextRecommendedBookId: book.nextRecommendedBookId,
    languageId: job.languageId,
    volumeId: job.volumeId,
    sourceFileId: job.sourceFileId,
    requestedBy: book.createdBy,
    publishMode: "public",
  };

  return { job, book, payload };
}

async function getJobAndBook(jobId: string) {
  const { job, book } = await getDispatchPayload(jobId);
  return { job, book };
}

export async function recoverJob(jobId: string, action: RecoveryAction) {
  const { job, book } = await getJobAndBook(jobId);
  const now = new Date().toISOString();

  if (action === "requeue") {
    if (!["failed", "retrying", "queued"].includes(job.status)) {
      throw new Error("Only failed, retrying, or queued jobs can be requeued.");
    }

    await appwriteDatabases.updateDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      job.$id,
      {
        status: "queued",
        updatedAt: now,
        startedAt: "",
        finishedAt: "",
        errorCode: "",
        errorMessage: "",
        workerId: "",
        workerVersion: "",
      },
    );

    await appwriteDatabases.updateDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.booksCollectionId,
      book.$id,
      {
        status: "queued",
        updatedAt: now,
      },
    );

    return { ok: true, action, nextStatus: "queued" as const };
  }

  if (!["processing", "validating", "publishing"].includes(job.status)) {
    throw new Error("Only in-flight jobs can be reset as stuck.");
  }

  await appwriteDatabases.updateDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    job.$id,
    {
      status: "queued",
      updatedAt: now,
      startedAt: "",
      finishedAt: "",
      errorCode: "OPERATOR_RESET",
      errorMessage: "Job was reset to queued by an operator after getting stuck.",
      workerId: "",
      workerVersion: "",
    },
  );

  await appwriteDatabases.updateDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    book.$id,
    {
      status: "queued",
      updatedAt: now,
    },
  );

  return { ok: true, action, nextStatus: "queued" as const };
}

export async function dispatchJobToWorker(jobId: string) {
  const workerApiUrl = requireWorkerEnv("WORKER_API_URL");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");
  const { job, payload } = await getDispatchPayload(jobId);
  const now = new Date().toISOString();

  // Prevent accidental double-dispatch (queue + manual, or multiple requests).
  // The worker will enforce this token as an idempotency lock.
  const dispatchToken = `dispatch_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  await appwriteDatabases.updateDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    job.$id,
    {
      status: "processing",
      workerId: "vps-worker",
      workerVersion: "v1",
      workerDispatchToken: dispatchToken,
      startedAt: now,
      updatedAt: now,
      errorCode: "",
      errorMessage: "",
    },
  );

  const response = await fetch(`${workerApiUrl.replace(/\/$/, "")}/jobs/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerApiToken}`,
    },
    body: JSON.stringify({ ...payload, dispatchToken }),
  });

  if (!response.ok) {
    const message = await response.text();

    await appwriteDatabases.updateDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      job.$id,
      {
        status: "queued",
        updatedAt: new Date().toISOString(),
        errorCode: "WORKER_DISPATCH_FAILED",
        errorMessage: message.slice(0, 5000),
      },
    );

    throw new Error(`Worker dispatch failed: ${message}`);
  }

  return {
    dispatched: true,
    payload,
    workerResponse: await response.json().catch(() => ({})),
  };
}

export async function republishBookMetadata(payload: MetadataRepublishPayload) {
  const workerApiUrl = requireWorkerEnv("WORKER_API_URL");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");

  const booksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.equal("slug", payload.bookSlug), Query.limit(1)],
  );

  const book = booksResponse.documents[0] as unknown as BookRecord | undefined;
  if (!book) {
    throw new Error("Book not found.");
  }

  const nextRecommendedBookId = payload.nextRecommendedBookId?.trim();
  if (nextRecommendedBookId) {
    if (nextRecommendedBookId === payload.bookSlug) {
      throw new Error("Next recommended book cannot be the current book.");
    }

    const recommendedBooksResponse = await appwriteDatabases.listDocuments(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.booksCollectionId,
      [
        Query.equal("slug", nextRecommendedBookId),
        Query.equal("status", "published"),
        Query.limit(1),
      ],
    );

    if (recommendedBooksResponse.documents.length === 0) {
      throw new Error("Next recommended book must be a published book.");
    }
  }

  const now = new Date().toISOString();
  await appwriteDatabases.updateDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    book.$id,
    {
      title: payload.title,
      subtitle: payload.subtitle || "",
      author: payload.author || "",
      description: payload.description || "",
      category: payload.category || "",
      nextRecommendedBookId: nextRecommendedBookId || "",
      defaultLanguageId: payload.defaultLanguageId || "",
      defaultVolumeId:
        payload.languages?.find((language) => language.languageId === payload.defaultLanguageId)
          ?.defaultVolumeId || "",
      updatedAt: now,
    },
  );

  const response = await fetch(`${workerApiUrl.replace(/\/$/, "")}/books/republish-metadata`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerApiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Metadata republish failed: ${message}`);
  }

  return response.json().catch(() => ({}));
}

export async function analyzeBookWithAi({
  sourceFileId,
  context,
  maxPages,
}: {
  sourceFileId: string;
  context: Record<string, unknown>;
  maxPages?: number;
}) {
  const workerApiUrl = requireWorkerEnv("WORKER_API_URL");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");

  const response = await fetch(`${workerApiUrl.replace(/\/$/, "")}/ai/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerApiToken}`,
    },
    body: JSON.stringify({ sourceFileId, context, maxPages }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI analysis failed: ${message}`);
  }

  return (await response.json()) as AiAnalysisResult;
}

export async function startBookAiAnalysis({
  sourceFileId,
  context,
  maxPages,
}: {
  sourceFileId: string;
  context: Record<string, unknown>;
  maxPages?: number;
}) {
  const workerApiUrl = requireWorkerEnv("WORKER_API_URL");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");

  const response = await fetch(`${workerApiUrl.replace(/\/$/, "")}/ai/analyze/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerApiToken}`,
    },
    body: JSON.stringify({ sourceFileId, context, maxPages }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI analysis start failed: ${message}`);
  }

  return (await response.json()) as AiAnalysisJob;
}

export async function getBookAiAnalysisStatus(analysisId: string) {
  const workerApiUrl = requireWorkerEnv("WORKER_API_URL");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");
  const url = new URL(`${workerApiUrl.replace(/\/$/, "")}/ai/analyze/status`);
  url.searchParams.set("id", analysisId);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${workerApiToken}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI analysis status failed: ${message}`);
  }

  return (await response.json()) as AiAnalysisJob;
}

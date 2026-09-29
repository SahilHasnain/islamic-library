import "server-only";

import { Query } from "node-appwrite";

import { APPWRITE_IDS, appwriteDatabases } from "@/lib/appwrite";
import {
  describeWorkerFailure,
  postIngestJob,
  recordUnreachableDispatchFailure,
  resolveDispatchToken,
  WorkerUnreachableError,
  type WorkerIngestResult,
} from "@/lib/worker-client";

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
  workerDispatchToken?: string;
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
        // An explicit operator requeue is a deliberate new attempt. Without this reset a
        // job that exhausted its attempts can never be recovered after a transient outage.
        attempt: 0,
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
      attempt: 0,
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
  const { job, payload } = await getDispatchPayload(jobId);
  const now = new Date().toISOString();

  // Reuse the job's existing token so retries are accepted by the worker's idempotency
  // lock. Minting a new one per attempt keeps the 409 guard unreachable.
  const dispatchToken = resolveDispatchToken(job);

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

  const dispatchStartedAt = Date.now();
  let result: WorkerIngestResult;
  try {
    result = await postIngestJob(payload, dispatchToken);
  } catch (error) {
    if (error instanceof WorkerUnreachableError) {
      await recordUnreachableDispatchFailure(job, error, { dispatchStartedAt });
    }
    throw error;
  }

  if (!result.ok) {
    // The worker already wrote the authoritative status/attempt before responding.
    // Overwriting it here (e.g. forcing "queued") is what caused unbounded retry loops.
    throw new Error(`Worker dispatch failed: ${describeWorkerFailure(result)}`);
  }

  return {
    dispatched: true,
    payload,
    workerResponse: result.error ?? safeParseJson(result.rawBody) ?? {},
  };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

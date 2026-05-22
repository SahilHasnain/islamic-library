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
  languageId: string;
  volumeId: string;
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
  status: JobStatus;
  attempt: number;
  workerId?: string;
  workerVersion?: string;
  errorCode?: string;
  errorMessage?: string;
  outputVersion?: string;
  pageCount?: number;
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
  languageId: string;
  volumeId: string;
  sourceFileId: string;
  requestedBy: string;
  publishMode: "public";
};

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
    [Query.orderDesc("createdAt"), Query.limit(limit)],
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
    languageId: job.languageId,
    volumeId: job.volumeId,
    sourceFileId: job.sourceFileId,
    requestedBy: book.createdBy,
    publishMode: "public",
  };

  return { job, book, payload };
}

export async function dispatchJobToWorker(jobId: string) {
  const workerApiUrl = requireWorkerEnv("WORKER_API_URL");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");
  const { job, payload } = await getDispatchPayload(jobId);
  const now = new Date().toISOString();

  await appwriteDatabases.updateDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    job.$id,
    {
      status: "processing",
      workerId: "vps-worker",
      workerVersion: "v1",
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
    body: JSON.stringify(payload),
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

import "server-only";

import { APPWRITE_IDS, appwriteDatabases } from "@/lib/appwrite";
import type { JobRecord } from "@/lib/ingestion";
import { Query } from "node-appwrite";

/**
 * Job Queue Manager
 * 
 * Handles sequential processing of queued jobs to prevent concurrent
 * execution issues when multiple books are dispatched at once.
 */

type QueueStatus = {
  isProcessing: boolean;
  currentJobId?: string;
  queuedCount: number;
  processingStartedAt?: string;
};

// In-memory queue status (could be moved to Redis for multi-instance deployments)
let queueStatus: QueueStatus = {
  isProcessing: false,
  queuedCount: 0,
};

function requireWorkerEnv(name: "WORKER_API_URL" | "WORKER_API_TOKEN") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required worker environment variable: ${name}`);
  }
  return value;
}

/**
 * Get the current queue status
 */
export function getQueueStatus(): QueueStatus {
  return { ...queueStatus };
}

/**
 * Get all queued jobs from the database
 */
async function getQueuedJobs(): Promise<JobRecord[]> {
  const response = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    [
      Query.equal("status", ["queued", "retrying"]),
      Query.orderAsc("$createdAt"),
      Query.limit(100),
    ],
  );

  return response.documents as unknown as JobRecord[];
}

/**
 * Dispatch a single job to the worker
 */
async function dispatchSingleJob(job: JobRecord): Promise<void> {
  const workerApiUrl = requireWorkerEnv("WORKER_API_URL");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");

  // Get book details
  const booksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.equal("slug", job.bookSlug), Query.limit(1)],
  );

  const book = booksResponse.documents[0];
  if (!book) {
    throw new Error(`Book not found for job ${job.jobId}`);
  }

  const now = new Date().toISOString();

  // Update job status to processing
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

  const payload = {
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
}

/**
 * Process the job queue sequentially
 */
async function processQueue(): Promise<void> {
  if (queueStatus.isProcessing) {
    console.log("Queue processor already running, skipping...");
    return;
  }

  queueStatus.isProcessing = true;
  queueStatus.processingStartedAt = new Date().toISOString();

  try {
    while (true) {
      const queuedJobs = await getQueuedJobs();
      queueStatus.queuedCount = queuedJobs.length;

      if (queuedJobs.length === 0) {
        console.log("No more queued jobs, stopping queue processor");
        break;
      }

      const nextJob = queuedJobs[0];
      queueStatus.currentJobId = nextJob.jobId;

      console.log(
        `Processing job ${nextJob.jobId} (${queuedJobs.length} remaining in queue)`,
      );

      try {
        await dispatchSingleJob(nextJob);
        console.log(`Job ${nextJob.jobId} dispatched successfully`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Job ${nextJob.jobId} failed:`, message);
        // Continue to next job even if this one failed
      }

      // Small delay between jobs to prevent overwhelming the worker
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } finally {
    queueStatus.isProcessing = false;
    queueStatus.currentJobId = undefined;
    queueStatus.queuedCount = 0;
    queueStatus.processingStartedAt = undefined;
  }
}

/**
 * Start processing the queue (non-blocking)
 * Returns immediately while processing continues in the background
 */
export function startQueueProcessor(): void {
  // Start processing asynchronously
  processQueue().catch((error) => {
    console.error("Queue processor error:", error);
    queueStatus.isProcessing = false;
    queueStatus.currentJobId = undefined;
  });
}

/**
 * Trigger queue processing if not already running
 */
export async function triggerQueueProcessing(): Promise<{
  triggered: boolean;
  status: QueueStatus;
}> {
  const wasProcessing = queueStatus.isProcessing;

  if (!wasProcessing) {
    startQueueProcessor();
  }

  return {
    triggered: !wasProcessing,
    status: getQueueStatus(),
  };
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  status: QueueStatus;
  queuedJobs: number;
  processingJobs: number;
}> {
  const [queuedResponse, processingResponse] = await Promise.all([
    appwriteDatabases.listDocuments(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      [Query.equal("status", ["queued", "retrying"]), Query.limit(1)],
    ),
    appwriteDatabases.listDocuments(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      [
        Query.equal("status", ["processing", "validating", "publishing"]),
        Query.limit(1),
      ],
    ),
  ]);

  return {
    status: getQueueStatus(),
    queuedJobs: queuedResponse.total,
    processingJobs: processingResponse.total,
  };
}

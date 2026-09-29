import "server-only";

import { APPWRITE_IDS, appwriteDatabases } from "@/lib/appwrite";
import type { JobRecord } from "@/lib/ingestion";
import { Query } from "node-appwrite";

import {
  describeWorkerFailure,
  postIngestJob,
  recordUnreachableDispatchFailure,
  resolveDispatchToken,
  WorkerUnreachableError,
} from "@/lib/worker-client";

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

const QUEUE_SUCCESS_DELAY_MS = 2_000;
const QUEUE_RETRY_BASE_DELAY_MS = 15_000;
const QUEUE_RETRY_MAX_DELAY_MS = 5 * 60_000;

/**
 * Keep the flag on globalThis rather than in module scope. Next.js can load this module
 * into more than one instance per server process (separate route bundles, dev HMR), and
 * each copy would otherwise run its own processor against the same Appwrite collection.
 */
const queueGlobals = globalThis as typeof globalThis & {
  __ingestionQueueStatus?: QueueStatus;
};

const queueStatus: QueueStatus = (queueGlobals.__ingestionQueueStatus ??= {
  isProcessing: false,
  queuedCount: 0,
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff between attempts. The previous fixed 2s delay, combined with
 * resetting failed jobs back to "queued", retried a broken job in a tight loop and
 * exhausted the Appwrite connection pool.
 */
function retryDelayForAttempt(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 8));
  return Math.min(QUEUE_RETRY_BASE_DELAY_MS * 2 ** exponent, QUEUE_RETRY_MAX_DELAY_MS);
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

  const dispatchToken = resolveDispatchToken(job);

  // Update job status to processing
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

  const payload = {
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
    printedPageStartPage: job.printedPageStartPage,
    sourceFileId: job.sourceFileId,
    requestedBy: book.createdBy,
    publishMode: "public" as const,
  };

  const dispatchStartedAt = Date.now();
  let result;
  try {
    result = await postIngestJob(payload, dispatchToken);
  } catch (error) {
    if (error instanceof WorkerUnreachableError) {
      await recordUnreachableDispatchFailure(job, error, { dispatchStartedAt });
    }
    throw error;
  }

  if (!result.ok) {
    // The worker already recorded the authoritative status/attempt on its own document
    // before responding. Writing "queued" here re-armed this job and made the queue
    // re-dispatch it forever, which is what exhausted the Appwrite connection pool.
    throw new Error(`Worker dispatch failed: ${describeWorkerFailure(result)}`);
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

      let failed = false;
      try {
        await dispatchSingleJob(nextJob);
        console.log(`Job ${nextJob.jobId} dispatched successfully`);
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Job ${nextJob.jobId} failed:`, message);
        // Continue to next job even if this one failed
      }

      // Small delay between jobs to prevent overwhelming the worker. Failures back off
      // exponentially so an unreachable worker cannot spin this loop.
      await sleep(failed ? retryDelayForAttempt(Number(nextJob.attempt || 0) + 1) : QUEUE_SUCCESS_DELAY_MS);
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

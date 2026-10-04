import "server-only";

import { APPWRITE_IDS, appwriteDatabases } from "@/lib/appwrite";
import type { JobRecord, WorkerJobPayload } from "@/lib/ingestion";

/**
 * Worker dispatch client.
 *
 * Two rules this module exists to enforce:
 *
 * 1. The worker ACKNOWLEDGES before it works. `POST /jobs/ingest` validates, claims the
 *    job in Appwrite, replies 202, and only then renders and publishes in the background.
 *    So the response arrives in well under a second and the timeout here only needs to
 *    cover a hung TCP connect — it is not a render budget. We previously held the request
 *    for the whole render with a 20-minute ceiling, and proxies dropped that idle
 *    connection: a 160-page book published fine in 6m12s while the console sat waiting and
 *    then wrote a failure over the finished job.
 * 2. The worker writes the authoritative `status`/`attempt` to the job document, and it
 *    does so asynchronously after the 202. The console therefore NEVER decides a job's
 *    outcome from the dispatch outcome: `ok` here means "the worker accepted it", not
 *    "it is finished". The job document is the single source of truth for completion.
 */

// Only needs to cover connection setup plus a few Appwrite reads. Generous so a slow
// VPS or a cold start never trips it, small enough that a genuinely dead worker is
// noticed quickly.
const WORKER_REQUEST_TIMEOUT_MS = Number(process.env.WORKER_REQUEST_TIMEOUT_MS || 60_000);
const WORKER_DISPATCH_MAX_ATTEMPTS = Number(process.env.WORKER_DISPATCH_MAX_ATTEMPTS || 3);

function requireWorkerEnv(name: "WORKER_API_URL" | "WORKER_API_TOKEN") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required worker environment variable: ${name}`);
  }
  return value;
}

/**
 * The worker was never reached, so it did not touch the job document.
 */
export class WorkerUnreachableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WorkerUnreachableError";
    this.cause = cause;
  }
}

export type WorkerErrorBody = {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  nextAttempt?: number;
};

export type WorkerIngestResult = {
  ok: boolean;
  status: number;
  rawBody: string;
  /** Parsed JSON error body, or null when the body is HTML / empty. */
  error: WorkerErrorBody | null;
  /**
   * The worker accepted the job and will finish it in the background. This is a
   * successful dispatch, NOT a completed ingest — read the job document for that.
   */
  accepted: boolean;
};

export type MetadataRepublishPayload = {
  bookSlug: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  nextRecommendedBookId?: string;
  recommendations?: Array<{
    bookId: string;
    reason?: string;
    type?: string;
    score?: number;
  }>;
  defaultLanguageId?: string;
  languageId: string;
  volumeId: string;
  requestedBy: string;
  languages?: Array<{
    languageId: string;
    summary?: string;
    order?: number;
    defaultVolumeId?: string;
    volumes: Array<{
      id: string;
      title?: string;
      subtitle?: string;
      manifestUrl?: string;
      order?: number;
      printedPageStartPage?: number;
      introNote?: string;
      todayTarget?: string;
      tocEntries?: Array<{
        title: string;
        printedPage?: number;
        renderedPage?: number;
        level?: number;
      }>;
    }>;
  }>;
};

export type MetadataRepublishResult = {
  ok: boolean;
  status: number;
  rawBody: string;
  error?: string;
  metadataUrl?: string;
  manifestUrl?: string;
  outputVersion?: string;
};

export type AiTocStartResult = {
  analysisId: string;
  status: string;
};

export type AiTocStatusResult = {
  status: "queued" | "processing" | "completed" | "failed";
  phase?: string;
  error?: string;
  result?: {
    tocEntries?: Array<{
      title: string;
      printedPage?: number;
      renderedPage?: number;
      level?: number;
    }>;
  };
};

/**
 * Reuse the job's existing dispatch token so retries are accepted by the worker's
 * idempotency lock. Minting a fresh token per attempt writes a new value to the document
 * before the call, so the worker's 409 guard can never fire and duplicate work is never
 * rejected.
 */
export function resolveDispatchToken(job: Pick<JobRecord, "workerDispatchToken">): string {
  const existing = job.workerDispatchToken?.trim();
  if (existing) {
    return existing;
  }
  return `dispatch_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function postIngestJob(
  payload: WorkerJobPayload,
  dispatchToken: string,
): Promise<WorkerIngestResult> {
  const baseUrl = requireWorkerEnv("WORKER_API_URL").replace(/\/$/, "");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/jobs/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerApiToken}`,
      },
      body: JSON.stringify({ ...payload, dispatchToken }),
      signal: AbortSignal.timeout(WORKER_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    throw new WorkerUnreachableError(
      `Worker request failed after ${WORKER_REQUEST_TIMEOUT_MS}ms: ${detail}`,
      error,
    );
  }

  const rawBody = await response.text().catch(() => "");

  let error: WorkerErrorBody | null = null;
  if (!response.ok && rawBody) {
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object") {
        error = parsed as WorkerErrorBody;
      }
    } catch {
      error = null;
    }
  }

  // 202 is the worker's "claimed, rendering now" acknowledgement. 200 is kept accepted
  // for compatibility with an older worker that finishes before replying.
  const accepted = response.status === 202 || response.status === 200;

  return { ok: response.ok, status: response.status, rawBody, error, accepted };
}

export async function postMetadataRepublish(
  payload: MetadataRepublishPayload,
): Promise<MetadataRepublishResult> {
  const baseUrl = requireWorkerEnv("WORKER_API_URL").replace(/\/$/, "");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/books/republish-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerApiToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Metadata publish request failed: ${detail}`);
  }

  const rawBody = await response.text().catch(() => "");
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    // Preserve the raw response for the caller below.
  }

  if (!response.ok) {
    throw new Error(
      typeof parsed.error === "string"
        ? parsed.error
        : `Metadata publish failed with status ${response.status}.`,
    );
  }

  return {
    ok: true,
    status: response.status,
    rawBody,
    metadataUrl: typeof parsed.metadataUrl === "string" ? parsed.metadataUrl : undefined,
    manifestUrl: typeof parsed.manifestUrl === "string" ? parsed.manifestUrl : undefined,
    outputVersion: typeof parsed.outputVersion === "string" ? parsed.outputVersion : undefined,
  };
}

async function workerFetch(path: string, init: RequestInit = {}) {
  const baseUrl = requireWorkerEnv("WORKER_API_URL").replace(/\/$/, "");
  const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${workerApiToken}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(60_000),
  });
}

export async function startAiTocAnalysis(payload: {
  sourceFileId: string;
  context: Record<string, unknown>;
}) {
  const response = await workerFetch("/ai/analyze/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Contents pages are normally in the front matter. Keep the first pass bounded;
    // a later fallback scan can be added without sending the entire PDF to the model.
    body: JSON.stringify({ ...payload, analysisMode: "toc-only", maxPages: 40 }),
  });
  const result = (await response.json()) as Partial<AiTocStartResult> & { error?: string };
  if (!response.ok || !result.analysisId) {
    throw new Error(result.error || "Could not start AI TOC analysis.");
  }
  return result as AiTocStartResult;
}

export async function startAiMetadataAnalysis(payload: {
  sourceFileId: string;
  context: Record<string, unknown>;
}) {
  const response = await workerFetch("/ai/analyze/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, analysisMode: "metadata-only", maxPages: 40 }),
  });
  const result = (await response.json()) as Partial<AiTocStartResult> & { error?: string };
  if (!response.ok || !result.analysisId) {
    throw new Error(result.error || "Could not start AI metadata analysis.");
  }
  return result as AiTocStartResult;
}

export async function getAiTocAnalysisStatus(analysisId: string) {
  const response = await workerFetch(`/ai/analyze/status?id=${encodeURIComponent(analysisId)}`);
  const result = (await response.json()) as AiTocStatusResult & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || "Could not read AI TOC analysis status.");
  }
  return result;
}

/**
 * Statuses that mean the worker already reached a verdict. If we observe one of these
 * when re-reading a job after a lost connection, the work is done (or terminally broken)
 * and the console must stay silent.
 */
const WORKER_TERMINAL_STATUSES = new Set([
  "published",
  "failed",
  "cancelled",
]);

/**
 * Book-keep a dispatch we never got a response for.
 *
 * This is deliberately CONSERVATIVE. A dropped connection tells us nothing about what the
 * worker did: it may never have received the request, or it may have rendered and
 * published successfully and lost the response on the way back. Observed in production —
 * a 160-page book published in 6m12s while the console sat on a 20-minute timeout and
 * then wrote WORKER_DISPATCH_UNCONFIRMED over the finished job, bumping a good job to
 * attempt 5 and queueing a pointless re-render.
 *
 * So before writing anything we re-read the job and:
 *   - stay silent if the worker has since reported a terminal status (it finished),
 *   - stay silent if it moved past `processing`/`queued` (it is visibly working, so the
 *     dispatch clearly landed and any write here would be pure interference),
 *   - only then count the attempt and stop at `failed` once the cap is reached.
 *
 * `updatedAt` is compared against `dispatchStartedAt` so a stale write from a slow
 * dispatch can never rewind a fresher worker update.
 */
export async function recordUnreachableDispatchFailure(
  job: JobRecord,
  cause: unknown,
  options: { dispatchStartedAt?: number } = {},
): Promise<void> {
  const message = cause instanceof Error ? cause.message : "Unknown error";
  const dispatchStartedAt = options.dispatchStartedAt ?? 0;

  let current: { status?: string; attempt?: number; updatedAt?: string } = job;
  try {
    const result = await appwriteDatabases.getDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      job.$id,
    );
    current = result as unknown as typeof current;
  } catch (readError) {
    // If we cannot re-read, we also cannot know whether the worker finished. Writing a
    // speculative `failed` risks destroying a completed publish, so just log and stop.
    console.error(
      `Job ${job.jobId} lost its worker response and its state could not be re-read; leaving it untouched:`,
      readError,
    );
    return;
  }

  if (typeof current.status === "string" && WORKER_TERMINAL_STATUSES.has(current.status)) {
    console.error(
      `Job ${job.jobId} lost its worker response but already reports "${current.status}"; the worker finished, so no state was changed.`,
    );
    return;
  }

  if (
    current.status &&
    current.status !== "queued" &&
    current.status !== "processing" &&
    current.status !== "retrying"
  ) {
    console.error(
      `Job ${job.jobId} lost its worker response but is now "${current.status}"; leaving worker-owned state alone.`,
    );
    return;
  }

  // A worker update newer than our dispatch attempt means the worker has spoken since we
  // called, so its view wins.
  const workerUpdatedAt = current.updatedAt ? Date.parse(current.updatedAt) : 0;
  if (dispatchStartedAt && workerUpdatedAt > dispatchStartedAt) {
    console.error(
      `Job ${job.jobId} was updated by the worker at ${current.updatedAt} after dispatch; skipping dispatch bookkeeping.`,
    );
    return;
  }

  const attempt = Number(current.attempt || job.attempt || 0) + 1;
  const retryable = attempt < WORKER_DISPATCH_MAX_ATTEMPTS;
  const now = new Date().toISOString();

  try {
    await appwriteDatabases.updateDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      job.$id,
      {
        status: retryable ? "retrying" : "failed",
        attempt,
        updatedAt: now,
        errorCode: "WORKER_DISPATCH_UNCONFIRMED",
        errorMessage: message.slice(0, 5000),
      },
    );
  } catch (writeError) {
    // Never let bookkeeping failures mask the original dispatch error.
    console.error(`Failed to record dispatch state for ${job.jobId}:`, writeError);
    return;
  }

  console.error(
    `Job ${job.jobId} could not reach the worker (attempt ${attempt}/${WORKER_DISPATCH_MAX_ATTEMPTS}): ${message}`,
  );
}

export function describeWorkerFailure(result: WorkerIngestResult): string {
  if (result.error) {
    const attemptInfo = result.error.nextAttempt ? ` (worker next attempt ${result.error.nextAttempt})` : "";
    return `worker responded ${result.status} ${result.error.errorCode || ""} ${attemptInfo}: ${
      result.error.errorMessage || result.rawBody
    }`.trim();
  }
  return `worker responded ${result.status}: ${result.rawBody.slice(0, 2000)}`;
}

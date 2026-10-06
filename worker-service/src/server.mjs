import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import {
  appwriteConfig,
  downloadSourcePdf,
  findBookBySlug,
  findJobDocument,
  updateBookDocument,
  updateJobDocument,
} from "./appwrite.mjs";
import {
  buildPublicMetadata,
  buildVolumeManifest,
  renderPdfWorkspace,
} from "./render.mjs";
import {
  buildPublishVersion,
  publishWorkspace,
  republishBookMetadata,
} from "./upload.mjs";
import { validateRenderedWorkspace } from "./validate.mjs";
import { createJobWorkspace, writeWorkspaceSummary } from "./workspace.mjs";
import { analyzeSourcePdf, rerankRecommendationCandidates } from "./ai-analysis.mjs";

function requireEnv(name, fallback) {
  return process.env[name] || fallback;
}

const port = Number(requireEnv("PORT", "4010"));
const workerApiToken = requireEnv("WORKER_API_TOKEN");
const workerId = requireEnv("WORKER_ID", "vps-worker");
const workerVersion = requireEnv("WORKER_VERSION", "v1");
const renderDpi = Number(requireEnv("RENDER_DPI", "144"));
const maxRetryAttempts = Number(requireEnv("MAX_RETRY_ATTEMPTS", "3"));
const mockRenderEnabled = requireEnv("MOCK_RENDER_ENABLED", "false") === "true";
const aiAnalysisJobs = new Map();
// Job ids currently being ingested in this process. The document lock in Appwrite is the
// source of truth, but this also stops a duplicate dispatch from starting a second render
// before the first has written its claim.
const activeIngests = new Set();
// Because the worker acknowledges immediately, the console is no longer throttled by the
// render itself and can dispatch a whole backlog in a tight loop. Without a cap here that
// becomes N concurrent PyMuPDF renders, which exhausts memory/CPU and the Appwrite
// connection pool all at once. Excess dispatches are parked in memory and started as slots
// free up; their 202 already told the console they were accepted, so this is invisible
// apart from /health reporting how many are running vs waiting.
const maxConcurrentIngests = Math.max(1, Number(requireEnv("MAX_CONCURRENT_INGESTS", "1")));
const ingestQueue = [];

if (!workerApiToken) {
  throw new Error("Missing required environment variable: WORKER_API_TOKEN");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });

    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function isAuthorized(request) {
  const authHeader = request.headers.authorization || "";
  return authHeader === `Bearer ${workerApiToken}`;
}

function normalizeLanguageId(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(value) {
  const category = String(value || "").trim();
  return category.toLowerCase() === "seerah" ? "Seerat" : category;
}

async function handleHealth(_, response) {
  sendJson(response, 200, {
    ok: true,
    service: "islamic-library-worker",
    workerId,
    workerVersion,
    aiProvider: process.env.AI_PROVIDER || "",
    aiModel: process.env.AI_MODEL || process.env.OPENAI_MODEL || "",
    aiQuickStrategy: process.env.AI_QUICK_ANALYSIS_STRATEGY || "toc-first",
    // Lets a caller distinguish "the connection dropped but rendering continues" from
    // "the worker never got the job".
    activeIngests: activeIngests.size,
    activeJobIds: [...activeIngests],
    queuedIngests: ingestQueue.length,
    maxConcurrentIngests,
  });
}

function appendAiJobLog(analysisId, phase, message) {
  const current = aiAnalysisJobs.get(analysisId);
  if (!current) {
    return;
  }

  aiAnalysisJobs.set(analysisId, {
    ...current,
    phase,
    updatedAt: new Date().toISOString(),
    logs: [
      ...(Array.isArray(current.logs) ? current.logs : []),
      {
        at: new Date().toISOString(),
        phase,
        message,
      },
    ],
  });
}

async function handleIngest(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  const payload = await readJsonBody(request);
  const {
    jobId,
    bookSlug,
    sourceFileId,
    languageId,
    volumeId,
    title,
    subtitle,
    author,
    description,
    category,
    nextRecommendedBookId,
    printedPageStartPage,
    requestedBy,
    publishMode,
    dispatchToken,
  } = payload || {};

  if (!jobId || !bookSlug || !sourceFileId || !languageId || !volumeId || !title) {
    sendJson(response, 400, { error: "Missing required job payload fields." });
    return;
  }

  const normalizedLanguageId = normalizeLanguageId(languageId);
  const normalizedCategory = normalizeCategory(category);

  const jobDocument = await findJobDocument(jobId);
  const bookDocument = await findBookBySlug(bookSlug);

  if (!jobDocument || !bookDocument) {
    sendJson(response, 404, { error: "Job or book document not found in Appwrite." });
    return;
  }

  const now = new Date().toISOString();

  // Everything up to the claim is fast (a few Appwrite reads/writes) and must stay on the
  // request so the caller gets a real status code. Only the render+publish is slow.
  try {
    // Idempotency lock: only proceed if dispatchToken matches the job document.
    // This prevents double dispatch (queue + manual, retries, multi-instance).
    if (!dispatchToken) {
      sendJson(response, 400, { error: "Missing dispatchToken." });
      return;
    }

    if (jobDocument.workerDispatchToken && jobDocument.workerDispatchToken !== dispatchToken) {
      sendJson(response, 409, {
        error: "Job was already dispatched with a different token.",
        status: jobDocument.status,
      });
      return;
    }

    if (activeIngests.has(jobId) || ingestQueue.some((task) => task.jobId === jobId)) {
      sendJson(response, 409, {
        error: "Job is already queued or being ingested by this worker.",
        status: jobDocument.status,
      });
      return;
    }

    // Ensure the token is stored even if caller didn't persist it. This is what makes a
    // repeat dispatch carrying the SAME token safe rather than a duplicate render.
    await updateJobDocument(jobDocument.$id, {
      workerDispatchToken: dispatchToken,
      updatedAt: now,
    }).catch(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(response, 500, { error: message });
    return;
  }

  // Acknowledge now and render in the background. Holding the request open for the whole
  // render is what made long books fail: proxies and load balancers drop idle-ish
  // connections, and the caller then cannot tell "still working" from "broke", so it
  // either retries a running job or books a phantom failure over a finished one.
  //
  // The claim write happens inside runIngest, i.e. when a concurrency slot actually opens.
  // Claiming here would leave a job parked behind the cap reported as `processing`, which
  // is indistinguishable from a hung render and would hand it to stuck-job recovery.
  sendJson(response, 202, {
    ok: true,
    jobId,
    status: "accepted",
    phase: "accepted",
    activeIngests: activeIngests.size,
    maxConcurrentIngests,
    bookSlug,
    workerId,
    workerVersion,
    startedAt: now,
  });

  ingestQueue.push({
    jobDocument,
    bookDocument,
    payload,
    jobId,
    bookSlug,
    sourceFileId,
    languageId: normalizedLanguageId,
    volumeId,
    now,
  });
  pumpIngestQueue();
}

/**
 * Start as many queued ingests as the concurrency cap allows, one at a time per slot.
 */
function pumpIngestQueue() {
  while (ingestQueue.length > 0 && activeIngests.size < maxConcurrentIngests) {
    const task = ingestQueue.shift();
    if (!task) {
      break;
    }

    activeIngests.add(task.jobId);
    setImmediate(() => {
      runIngest(task)
        .catch((error) => {
          console.error(`Ingest background task crashed for ${task.jobId}:`, error);
        })
        .finally(() => {
          activeIngests.delete(task.jobId);
          pumpIngestQueue();
        });
    });
  }
}

async function runIngest({
  jobDocument,
  bookDocument,
  payload,
  jobId,
  bookSlug,
  sourceFileId,
  languageId: normalizedLanguageId,
  volumeId,
  now,
}) {
  const {
    title,
    subtitle,
    author,
    description,
    category,
    nextRecommendedBookId,
    printedPageStartPage,
    requestedBy,
    publishMode,
  } = payload || {};

  try {
    // Claim now that a concurrency slot is actually ours. The 202 was already sent, so a
    // failure here lands in the catch below and is recorded on the job document.
    await updateJobDocument(jobDocument.$id, {
      status: "processing",
      workerId,
      workerVersion,
      startedAt: now,
      updatedAt: now,
      errorCode: "",
      errorMessage: "",
    });

    await updateBookDocument(bookDocument.$id, {
      status: "processing",
      updatedAt: now,
    });

    const workspace = await createJobWorkspace(jobId);
    const localPdfPath = payload.localPdfPath;
    let pdfBuffer;
    if (localPdfPath) {
      await fs.copyFile(localPdfPath, workspace.sourcePdfPath);
      const stat = await fs.stat(workspace.sourcePdfPath);
      pdfBuffer = { byteLength: stat.size };
    } else {
      pdfBuffer = await downloadSourcePdf(sourceFileId);
      await fs.writeFile(workspace.sourcePdfPath, pdfBuffer);
    }

    const renderResult = await renderPdfWorkspace({
      sourcePdfPath: workspace.sourcePdfPath,
      pagesDir: workspace.pagesDir,
      coverImagePath: workspace.coverImagePath,
      renderSummaryPath: workspace.renderSummaryPath,
      dpi: renderDpi,
    });

    await updateJobDocument(jobDocument.$id, {
      status: "validating",
      updatedAt: new Date().toISOString(),
    });

    const version = buildPublishVersion();
    const metadata = buildPublicMetadata({
      bookSlug,
      title,
      subtitle,
      author,
      description,
      category: normalizedCategory,
      nextRecommendedBookId,
      languageId: normalizedLanguageId,
      volumeId,
      printedPageStartPage,
    });
    const manifest = buildVolumeManifest({
      bookSlug,
      languageId: normalizedLanguageId,
      volumeId,
      totalPages: renderResult.totalPages,
      version,
      coverImage: renderResult.coverFileName,
      pages: renderResult.pages,
    });

    await fs.writeFile(workspace.metadataPath, JSON.stringify(metadata, null, 2), "utf8");
    await fs.writeFile(workspace.manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const validation = await validateRenderedWorkspace({
      metadata,
      manifest,
      renderSummary: renderResult,
      workspace,
      expected: {
        bookSlug,
        languageId: normalizedLanguageId,
        volumeId,
      },
    });

    const summary = {
      jobId,
      workerId,
      workerVersion,
      bookSlug,
      title,
      subtitle: subtitle || null,
      author: author || null,
      description: description || null,
       category: normalizedCategory || null,
      nextRecommendedBookId: nextRecommendedBookId || null,
      languageId: normalizedLanguageId,
      volumeId,
      sourceFileId,
      requestedBy: requestedBy || "admin-console",
      publishMode: publishMode || "public",
      workspaceDir: workspace.workspaceDir,
      sourcePdfPath: workspace.sourcePdfPath,
      sourcePdfSize: pdfBuffer.byteLength,
      pagesDir: workspace.pagesDir,
      coverImagePath: workspace.coverImagePath,
      metadataPath: workspace.metadataPath,
      manifestPath: workspace.manifestPath,
      totalPages: renderResult.totalPages,
      pageFiles: renderResult.pages.map((page) => page.fileName),
      validation,
      dpi: renderDpi,
      mockedRender: Boolean(renderResult.mocked),
      createdAt: now,
      phase: "validated",
    };

    await writeWorkspaceSummary(workspace.summaryPath, summary);

    await updateJobDocument(jobDocument.$id, {
      status: "validating",
      pageCount: renderResult.totalPages,
      outputVersion: version,
      updatedAt: new Date().toISOString(),
    });

    await updateJobDocument(jobDocument.$id, {
      status: "publishing",
      updatedAt: new Date().toISOString(),
    });

    const publishResult = await publishWorkspace({
      workspace,
      bookSlug,
      canonicalBookSlug: bookDocument.canonicalBookSlug || "",
      languageId: normalizedLanguageId,
      volumeId,
      metadata,
      manifest,
      version,
    });



    await updateBookDocument(bookDocument.$id, {
      status: "published",
      publishedVersion: version,
      metadataUrl: publishResult.metadataUrl,
      manifestUrl: publishResult.manifestUrl,
      totalPages: renderResult.totalPages,
      updatedAt: new Date().toISOString(),
    });

    await updateJobDocument(jobDocument.$id, {
      status: "published",
      pageCount: renderResult.totalPages,
      outputVersion: version,
      pushStatus: publishResult.pushStatus,
      pushError: publishResult.pushError || "",
      pushAttempts:
        Number(jobDocument.pushAttempts || 0) +
        (publishResult.pushStatus === "skipped" ? 0 : 1),
      lastPushAttempt:
        publishResult.pushStatus === "skipped" ? "" : new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // No HTTP response here: the 202 was already sent. The job document is the only
    // channel the caller (and the console UI) has, so the terminal `published` write
    // above is the completion signal.
    console.log(
      `Ingest ${jobId} published ${renderResult.totalPages} pages for ${bookSlug} (version ${version}).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const failedAt = new Date().toISOString();
    const nextAttempt = Number(jobDocument.attempt || 0) + 1;
    const retryable = nextAttempt < maxRetryAttempts;

    await updateJobDocument(jobDocument.$id, {
      status: retryable ? "retrying" : "failed",
      attempt: nextAttempt,
      updatedAt: failedAt,
      errorCode: "RENDER_OR_VALIDATION_FAILED",
      errorMessage: message.slice(0, 5000),
      finishedAt: failedAt,
    }).catch(() => {});

    await updateBookDocument(bookDocument.$id, {
      status: "failed",
      updatedAt: failedAt,
    }).catch(() => {});

    console.error(
      `Ingest ${jobId} failed for ${bookSlug} (attempt ${nextAttempt}/${maxRetryAttempts}): ${message}`,
    );
  }
}

async function handleMetadataRepublish(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  const payload = await readJsonBody(request);
  const {
    bookSlug,
    title,
    subtitle,
    author,
    description,
    category,
    nextRecommendedBookId,
    recommendations,
    defaultLanguageId,
    requestedBy,
    languages,
  } = payload || {};

  if (!bookSlug || !title) {
    sendJson(response, 400, { error: "Missing required metadata payload fields." });
    return;
  }

  const bookDocument = await findBookBySlug(bookSlug);
  if (!bookDocument) {
    sendJson(response, 404, { error: "Book document not found in Appwrite." });
    return;
  }

  const version = buildPublishVersion();
  const normalizedDefaultLanguageId = normalizeLanguageId(defaultLanguageId);
  const normalizedBookLanguageId = normalizeLanguageId(bookDocument.languageId);

  try {
    const publishResult = await republishBookMetadata({
      bookSlug,
      canonicalBookSlug: bookDocument.canonicalBookSlug || "",
      title,
      subtitle,
      author,
      description,
      category,
      nextRecommendedBookId,
      recommendations,
      defaultLanguageId: normalizedDefaultLanguageId,
      languageId: normalizedBookLanguageId,
      volumeId: bookDocument.volumeId,
      version,
      languages,
    });

    await updateBookDocument(bookDocument.$id, {
      title,
      subtitle: subtitle || "",
      author: author || "",
      description: description || "",
      category: category || "",
      nextRecommendedBookId: nextRecommendedBookId || "",
      defaultLanguageId: normalizedDefaultLanguageId || "",
      defaultVolumeId:
        (Array.isArray(languages)
          ? languages.find((language) => normalizeLanguageId(language.languageId) === normalizedDefaultLanguageId)?.defaultVolumeId
          : "") || "",
      metadataUrl: publishResult.metadataUrl,
      manifestUrl: publishResult.manifestUrl,
      publishedVersion: version,
      updatedAt: new Date().toISOString(),
    });



    sendJson(response, 200, {
      ok: true,
      status: "metadata-published",
      bookSlug,
      outputVersion: version,
      metadataUrl: publishResult.metadataUrl,
      manifestUrl: publishResult.manifestUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(response, 500, {
      error: message,
      status: "failed",
      bookSlug,
    });
  }
}

async function handleAiAnalyze(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  const payload = await readJsonBody(request);
  const { sourceFileId, context = {}, maxPages, analysisMode } = payload || {};
  if (!sourceFileId) {
    sendJson(response, 400, { error: "Missing sourceFileId." });
    return;
  }

  const result = await analyzeSourcePdf({ sourceFileId, context, maxPages, analysisMode });
  sendJson(response, 200, { ok: true, ...result });
}

async function handleAiRecommendationsRerank(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  const payload = await readJsonBody(request);
  const { currentBook, candidates } = payload || {};
  if (!currentBook || !Array.isArray(candidates) || candidates.length === 0) {
    sendJson(response, 400, { error: "currentBook and candidates are required." });
    return;
  }

  const result = await rerankRecommendationCandidates({ currentBook, candidates });
  sendJson(response, 200, { ok: true, ...result });
}

async function handleAiAnalyzeStart(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  const payload = await readJsonBody(request);
  const { sourceFileId, context = {}, maxPages, analysisMode } = payload || {};
  if (!sourceFileId) {
    sendJson(response, 400, { error: "Missing sourceFileId." });
    return;
  }

  const analysisId = `ai_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const now = new Date().toISOString();
  aiAnalysisJobs.set(analysisId, {
    id: analysisId,
    status: "queued",
    phase: "queued",
    provider: process.env.AI_PROVIDER || "",
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || "",
    analysisMode: analysisMode || "draft",
    maxPages,
    createdAt: now,
    updatedAt: now,
    logs: [
      {
        at: now,
        phase: "queued",
        message: `Queued ${analysisMode || "draft"} analysis for ${maxPages && maxPages > 0 ? `first ${maxPages} pages` : "all pages"}.`,
      },
    ],
  });

  setImmediate(async () => {
    aiAnalysisJobs.set(analysisId, {
      ...aiAnalysisJobs.get(analysisId),
      status: "processing",
      phase: "analyzing",
      updatedAt: new Date().toISOString(),
    });
    appendAiJobLog(
      analysisId,
      "analyzing",
      `Using provider ${process.env.AI_PROVIDER || "unknown"} model ${process.env.AI_MODEL || process.env.OPENAI_MODEL || "unknown"}.`,
    );

    try {
      appendAiJobLog(analysisId, "checking-cache", "Checking cached extracted text.");
      const result = await analyzeSourcePdf({
        sourceFileId,
        context,
        maxPages,
        analysisMode,
        onPhase: (phase, message) => appendAiJobLog(analysisId, phase, message),
      });
      appendAiJobLog(
        analysisId,
        "completed",
        `Completed analysis: ${result.analyzedPages || 0} pages analyzed, ${result.extractableTextPages || 0} text pages, ${result.tocEntries?.length || 0} TOC entries.`,
      );
      aiAnalysisJobs.set(analysisId, {
        ...aiAnalysisJobs.get(analysisId),
        status: "completed",
        phase: "completed",
        result,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      appendAiJobLog(
        analysisId,
        "failed",
        error instanceof Error ? error.message : "AI analysis failed.",
      );
      aiAnalysisJobs.set(analysisId, {
        ...aiAnalysisJobs.get(analysisId),
        status: "failed",
        phase: "failed",
        error: error instanceof Error ? error.message : "AI analysis failed.",
        updatedAt: new Date().toISOString(),
      });
    }
  });

  sendJson(response, 202, { ok: true, analysisId, status: "queued" });
}

async function handleAiAnalyzeStatus(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
  const analysisId = url.searchParams.get("id");
  const job = analysisId ? aiAnalysisJobs.get(analysisId) : undefined;
  if (!job) {
    sendJson(response, 404, { error: "AI analysis job not found." });
    return;
  }

  sendJson(response, 200, { ok: true, ...job });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      await handleHealth(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/jobs/ingest") {
      await handleIngest(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/books/republish-metadata") {
      await handleMetadataRepublish(request, response);
      return;
    }

if (request.method === "POST" && request.url === "/ai/analyze") {
      await handleAiAnalyze(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/ai/recommendations/rerank") {
      await handleAiRecommendationsRerank(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/ai/analyze/start") {
      await handleAiAnalyzeStart(request, response);
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/ai/analyze/status")) {
      await handleAiAnalyzeStatus(request, response);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(response, 500, { error: message });
  }
});

// Requests are now short: /jobs/ingest acknowledges with 202 before rendering, so no
// request stays open for the length of a book. Node's defaults (300s requestTimeout,
// 5s keepAliveTimeout) are still worth stating explicitly — the 5s keep-alive in
// particular races a client that reuses a pooled connection right after a response.
server.requestTimeout = Number(requireEnv("SERVER_REQUEST_TIMEOUT_MS", "60000"));
server.headersTimeout = Number(requireEnv("SERVER_HEADERS_TIMEOUT_MS", "30000"));
server.keepAliveTimeout = Number(requireEnv("SERVER_KEEP_ALIVE_TIMEOUT_MS", "15000"));
server.setTimeout(0);

server.listen(port, () => {
  console.log(
    `Worker listening on http://localhost:${port} using Appwrite project ${appwriteConfig.APPWRITE_PROJECT_ID}`,
  );
});

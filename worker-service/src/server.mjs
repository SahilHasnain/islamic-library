import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import {
  appwriteConfig,
  createPublishEvent,
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
  getPublicAssetUrl,
  publishWorkspace,
  republishBookMetadata,
  retryPushOnly,
} from "./publish.mjs";
import { validateRenderedWorkspace } from "./validate.mjs";
import { createJobWorkspace, writeWorkspaceSummary } from "./workspace.mjs";
import { analyzeSourcePdf } from "./ai-analysis.mjs";

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

async function handleHealth(_, response) {
  sendJson(response, 200, {
    ok: true,
    service: "islamic-library-worker",
    workerId,
    workerVersion,
    aiProvider: process.env.AI_PROVIDER || "",
    aiModel: process.env.AI_MODEL || process.env.OPENAI_MODEL || "",
    aiQuickStrategy: process.env.AI_QUICK_ANALYSIS_STRATEGY || "toc-first",
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

  const jobDocument = await findJobDocument(jobId);
  const bookDocument = await findBookBySlug(bookSlug);

  if (!jobDocument || !bookDocument) {
    sendJson(response, 404, { error: "Job or book document not found in Appwrite." });
    return;
  }

  const now = new Date().toISOString();

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

    // Ensure the token is stored even if caller didn't persist it.
    await updateJobDocument(jobDocument.$id, {
      workerDispatchToken: dispatchToken,
      updatedAt: now,
    }).catch(() => {});

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
    const pdfBuffer = await downloadSourcePdf(sourceFileId);
    await fs.writeFile(workspace.sourcePdfPath, pdfBuffer);

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
      category,
      nextRecommendedBookId,
      languageId,
      volumeId,
      printedPageStartPage,
    });
    const manifest = buildVolumeManifest({
      bookSlug,
      languageId,
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
        languageId,
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
      category: category || null,
      nextRecommendedBookId: nextRecommendedBookId || null,
      languageId,
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
      languageId,
      volumeId,
      metadata,
      manifest,
      version,
    });

    await createPublishEvent({
      publishId: `publish_${jobId}`,
      bookSlug,
      version,
      gitCommitSha: publishResult.gitCommitSha,
      catalogPath: publishResult.catalogPath,
      metadataPath: publishResult.metadataPath,
      manifestPath: publishResult.manifestPath,
      assetBasePath: publishResult.assetBasePath,
      publishedAt: new Date().toISOString(),
      triggeredBy: requestedBy || "admin-console",
    }).catch(() => {});

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

    sendJson(response, 200, {
      jobId,
      status: "published",
      phase: "published",
      bookSlug,
      workerId,
      workerVersion,
      workspaceDir: workspace.workspaceDir,
      sourcePdfPath: path.basename(workspace.sourcePdfPath),
      coverImagePath: path.basename(workspace.coverImagePath),
      metadataPath: path.basename(workspace.metadataPath),
      manifestPath: path.basename(workspace.manifestPath),
      summaryPath: path.basename(workspace.summaryPath),
      sourcePdfSize: pdfBuffer.byteLength,
      totalPages: renderResult.totalPages,
      outputVersion: version,
      gitCommitSha: publishResult.gitCommitSha,
      catalogPath: publishResult.catalogPath,
      metadataPath: publishResult.metadataPath,
      manifestPath: publishResult.manifestPath,
      assetBasePath: publishResult.assetBasePath,
      mockedRender: mockRenderEnabled,
    });
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

    sendJson(response, 500, {
      jobId,
      status: retryable ? "retrying" : "failed",
      errorCode: "RENDER_OR_VALIDATION_FAILED",
      errorMessage: message,
      retryable,
      nextAttempt,
    });
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

  try {
    const publishResult = await republishBookMetadata({
      bookSlug,
      title,
      subtitle,
      author,
      description,
      category,
      nextRecommendedBookId,
      defaultLanguageId,
      languageId: bookDocument.languageId,
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
      defaultLanguageId: defaultLanguageId || "",
      defaultVolumeId:
        (Array.isArray(languages)
          ? languages.find((language) => language.languageId === defaultLanguageId)?.defaultVolumeId
          : "") || "",
      metadataUrl: publishResult.metadataUrl,
      manifestUrl: publishResult.manifestUrl,
      publishedVersion: version,
      updatedAt: new Date().toISOString(),
    });

    await createPublishEvent({
      jobId: `metadata_${bookSlug}`,
      bookSlug,
      status: "metadata-published",
      commitSha: publishResult.gitCommitSha,
      catalogUrl: getPublicAssetUrl("catalog.json"),
      metadataUrl: publishResult.metadataUrl,
      manifestUrl: publishResult.manifestUrl,
      createdAt: new Date().toISOString(),
      triggeredBy: requestedBy || "admin-console",
    }).catch(() => {});

    sendJson(response, 200, {
      ok: true,
      status: "metadata-published",
      bookSlug,
      outputVersion: version,
      gitCommitSha: publishResult.gitCommitSha,
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

async function handleRetryPush(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  const payload = await readJsonBody(request);
  const { jobId } = payload || {};

  if (!jobId) {
    sendJson(response, 400, { error: "Missing required field: jobId" });
    return;
  }

  const jobDocument = await findJobDocument(jobId);
  if (!jobDocument) {
    sendJson(response, 404, { error: "Job document not found in Appwrite." });
    return;
  }

  if (jobDocument.status !== "published") {
    sendJson(response, 409, { error: "Only published jobs can retry push." });
    return;
  }

  if (jobDocument.pushStatus !== "failed") {
    sendJson(response, 409, { error: "Retry push is only allowed when pushStatus is failed." });
    return;
  }

  const now = new Date().toISOString();
  const pushResult = await retryPushOnly();

  await updateJobDocument(jobDocument.$id, {
    pushStatus: pushResult.pushStatus,
    pushError: pushResult.pushError || "",
    pushAttempts:
      Number(jobDocument.pushAttempts || 0) + (pushResult.pushStatus === "skipped" ? 0 : 1),
    lastPushAttempt: pushResult.pushStatus === "skipped" ? "" : now,
    updatedAt: now,
  }).catch(() => {});

  sendJson(response, 200, {
    ok: true,
    jobId,
    pushStatus: pushResult.pushStatus,
    pushError: pushResult.pushError || "",
    pushConfigured: pushResult.pushConfigured,
    remoteName: pushResult.remoteName,
    remoteUrl: pushResult.remoteUrl,
  });
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
      appendAiJobLog(analysisId, "extracting", "Downloading source PDF and extracting text.");
      const result = await analyzeSourcePdf({ sourceFileId, context, maxPages, analysisMode });
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

    if (request.method === "POST" && request.url === "/jobs/retry-push") {
      await handleRetryPush(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/ai/analyze") {
      await handleAiAnalyze(request, response);
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

server.listen(port, () => {
  console.log(
    `Worker listening on http://localhost:${port} using Appwrite project ${appwriteConfig.APPWRITE_PROJECT_ID}`,
  );
});

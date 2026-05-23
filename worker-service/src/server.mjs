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
} from "./publish.mjs";
import { validateRenderedWorkspace } from "./validate.mjs";
import { createJobWorkspace, writeWorkspaceSummary } from "./workspace.mjs";

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
    requestedBy,
    publishMode,
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
      languageId,
      volumeId,
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
  const { bookSlug, title, subtitle, author, description, category, requestedBy, sections } = payload || {};

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
      languageId: bookDocument.languageId,
      volumeId: bookDocument.volumeId,
      version,
      sections,
    });

    await updateBookDocument(bookDocument.$id, {
      title,
      subtitle: subtitle || "",
      author: author || "",
      description: description || "",
      category: category || "",
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

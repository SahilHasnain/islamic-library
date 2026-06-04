import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function requireEnv(name, fallback) {
  return process.env[name] || fallback;
}

const mockRenderEnabled = requireEnv("MOCK_RENDER_ENABLED", "false") === "true";
const mockRenderPageCount = Number(requireEnv("MOCK_RENDER_PAGE_COUNT", "6"));

function normalizeLanguageId(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function languageTitleFromId(value) {
  return normalizeLanguageId(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function runPythonRenderer(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr || stdout || `Python renderer exited with code ${code}`));
    });
  });
}

export async function renderPdfWorkspace({
  sourcePdfPath,
  pagesDir,
  coverImagePath,
  renderSummaryPath,
  dpi = 144,
}) {
  if (mockRenderEnabled) {
    return createMockRenderOutput({
      pagesDir,
      coverImagePath,
      renderSummaryPath,
      pageCount: mockRenderPageCount,
      dpi,
    });
  }

  const scriptPath = path.resolve(process.cwd(), "src", "render_pdf.py");

  await runPythonRenderer([scriptPath, sourcePdfPath, pagesDir, coverImagePath, renderSummaryPath, String(dpi)]);

  const summary = JSON.parse(await fs.readFile(renderSummaryPath, "utf8"));
  return summary;
}

async function createMockRenderOutput({
  pagesDir,
  coverImagePath,
  renderSummaryPath,
  pageCount,
  dpi,
}) {
  const pixel =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9J4AAAAASUVORK5CYII=";
  const fileBuffer = Buffer.from(pixel, "base64");
  const pages = [];

  for (let index = 0; index < pageCount; index += 1) {
    const fileName = `page-${String(index + 1).padStart(3, "0")}.png`;
    const pagePath = path.join(pagesDir, fileName);
    await fs.writeFile(pagePath, fileBuffer);

    pages.push({
      page: index + 1,
      fileName,
      width: 1080,
      height: 1528,
      size: fileBuffer.byteLength,
    });
  }

  await fs.writeFile(coverImagePath, fileBuffer);

  const summary = {
    totalPages: pageCount,
    coverFileName: path.basename(coverImagePath),
    pages,
    dpi,
    mocked: true,
  };

  await fs.writeFile(renderSummaryPath, JSON.stringify(summary, null, 2), "utf8");
  return summary;
}

export function buildPublicMetadata({
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
}) {
  const normalizedPrintedPageStartPage = Number(printedPageStartPage);
  const normalizedLanguageId = normalizeLanguageId(languageId);

  return {
    id: bookSlug,
    title,
    subtitle: subtitle || undefined,
    author: author || undefined,
    description: description || undefined,
    category: category || undefined,
    nextRecommendedBookId: nextRecommendedBookId || undefined,
    coverImage: "cover.png",
    languages: [
      {
        id: normalizedLanguageId,
        title: languageTitleFromId(normalizedLanguageId),
        volumes: [
          {
            id: volumeId,
            title: volumeId,
            printedPageStartPage:
              Number.isFinite(normalizedPrintedPageStartPage) && normalizedPrintedPageStartPage > 1
                ? normalizedPrintedPageStartPage
                : undefined,
            manifestUrl: "manifest.json",
          },
        ],
      },
    ],
  };
}

export function buildVolumeManifest({
  bookSlug,
  languageId,
  volumeId,
  totalPages,
  version,
  coverImage,
  pages,
}) {
  const firstPageFileName = pages[0]?.fileName ?? "page-001.png";
  const extension = firstPageFileName.split(".").pop() ?? "png";
  return {
    bookId: bookSlug,
    languageId,
    volumeId,
    version,
    totalPages,
    baseUrl: ".",
    filePattern: `page-{page}.${extension}`,
    extension,
    coverImage,
    pages,
  };
}

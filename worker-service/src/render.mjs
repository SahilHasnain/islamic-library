import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

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
  const scriptPath = path.resolve(process.cwd(), "src", "render_pdf.py");

  await runPythonRenderer([scriptPath, sourcePdfPath, pagesDir, coverImagePath, renderSummaryPath, String(dpi)]);

  const summary = JSON.parse(await fs.readFile(renderSummaryPath, "utf8"));
  return summary;
}

export function buildPublicMetadata({
  bookSlug,
  title,
  subtitle,
  author,
  description,
  category,
  languageId,
  volumeId,
}) {
  return {
    id: bookSlug,
    title,
    subtitle: subtitle || undefined,
    author: author || undefined,
    description: description || undefined,
    category: category || undefined,
    coverImage: "cover.webp",
    languages: [
      {
        id: languageId,
        title: languageId,
        volumes: [
          {
            id: volumeId,
            title: volumeId,
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
  return {
    bookId: bookSlug,
    languageId,
    volumeId,
    version,
    totalPages,
    baseUrl: ".",
    filePattern: "page-{page}.webp",
    extension: "webp",
    coverImage,
    pages,
  };
}

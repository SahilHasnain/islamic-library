import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { appwriteConfig, downloadSourcePdf } from "../src/appwrite.mjs";

function requireEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseArgs() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("Usage: npm run repair-pdf-page-labels -- --book <slug> --language <id> --volume <id> [--pdf <path>]");
    }
    args.set(key.slice(2), value);
  }

  return {
    bookSlug: args.get("book"),
    languageId: args.get("language"),
    volumeId: args.get("volume"),
    pdfPath: args.get("pdf"),
  };
}

function appwriteQueryEqual(field, value) {
  return JSON.stringify({ method: "equal", attribute: field, values: [value] });
}

async function listJobDocuments({ bookSlug, languageId, volumeId }) {
  const url = new URL(
    `${appwriteConfig.APPWRITE_ENDPOINT}/databases/${appwriteConfig.APPWRITE_DATABASE_ID}/collections/${appwriteConfig.APPWRITE_JOBS_COLLECTION_ID}/documents`,
  );
  url.searchParams.append("queries[]", appwriteQueryEqual("bookSlug", bookSlug));
  url.searchParams.append("queries[]", appwriteQueryEqual("languageId", languageId));
  url.searchParams.append("queries[]", appwriteQueryEqual("volumeId", volumeId));

  const response = await fetch(url, {
    headers: {
      "X-Appwrite-Project": appwriteConfig.APPWRITE_PROJECT_ID,
      "X-Appwrite-Key": appwriteConfig.APPWRITE_API_KEY,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not list ingestion jobs (${response.status}): ${text}`);
  }

  const result = await response.json();
  return result.documents ?? [];
}

function runPython(scriptPath, pdfPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath, pdfPath], {
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
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || `Python exited with code ${code}`));
    });
  });
}

async function getPdfPath({ bookSlug, languageId, volumeId, explicitPdfPath }) {
  if (explicitPdfPath) {
    return { pdfPath: explicitPdfPath, cleanup: async () => {} };
  }

  const jobs = await listJobDocuments({ bookSlug, languageId, volumeId });
  const job = jobs
    .filter((candidate) => candidate.sourceFileId)
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))[0];

  if (!job?.sourceFileId) {
    throw new Error(`No source PDF job found for ${bookSlug}/${languageId}/${volumeId}. Pass --pdf <path> instead.`);
  }

  const pdfBuffer = await downloadSourcePdf(job.sourceFileId);
  const pdfPath = path.join(os.tmpdir(), `${bookSlug}-${languageId}-${volumeId}-${Date.now()}.pdf`);
  await fs.writeFile(pdfPath, pdfBuffer);

  return {
    pdfPath,
    cleanup: async () => {
      await fs.rm(pdfPath, { force: true });
    },
  };
}

async function main() {
  const { bookSlug, languageId, volumeId, pdfPath: explicitPdfPath } = parseArgs();
  if (!bookSlug || !languageId || !volumeId) {
    throw new Error("Missing --book, --language, or --volume.");
  }

  const assetsRepoPath = requireEnv("ASSETS_REPO_PATH", "D:/Projects/islamic-library-assets");
  const manifestPath = path.join(assetsRepoPath, "books", bookSlug, languageId, volumeId, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const { pdfPath, cleanup } = await getPdfPath({ bookSlug, languageId, volumeId, explicitPdfPath });

  try {
    const scriptPath = path.join(process.cwd(), "scripts", "extract-pdf-page-labels.py");
    const output = await runPython(scriptPath, pdfPath);
    const { labels } = JSON.parse(output);
    let changedCount = 0;

    const pages = (manifest.pages ?? []).map((page) => {
      const label = labels[page.page - 1];
      const trimmedLabel = typeof label === "string" ? label.trim() : "";
      const nextLabel = trimmedLabel && trimmedLabel !== String(page.page) ? trimmedLabel : undefined;

      if (page.printedPageLabel !== nextLabel) {
        changedCount += 1;
      }

      const nextPage = { ...page };
      if (nextLabel) {
        nextPage.printedPageLabel = nextLabel;
      } else {
        delete nextPage.printedPageLabel;
      }
      return nextPage;
    });

    await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, pages }, null, 2), "utf8");

    console.log(
      JSON.stringify(
        {
          manifestPath,
          pdfSource: explicitPdfPath ? "local" : "appwrite",
          manifestPages: pages.length,
          pdfLabels: labels.filter(Boolean).length,
          changedCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

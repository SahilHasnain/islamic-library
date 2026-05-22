import fs from "node:fs/promises";
import path from "node:path";

const runsRoot = path.resolve(process.cwd(), "runs");

export async function createJobWorkspace(jobId) {
  const workspaceDir = path.join(runsRoot, jobId);
  const pagesDir = path.join(workspaceDir, "pages");

  await fs.rm(workspaceDir, { recursive: true, force: true });
  await fs.mkdir(pagesDir, { recursive: true });

  return {
    workspaceDir,
    pagesDir,
    sourcePdfPath: path.join(workspaceDir, "source.pdf"),
    coverImagePath: path.join(workspaceDir, "cover.png"),
    renderSummaryPath: path.join(workspaceDir, "render-summary.json"),
    metadataPath: path.join(workspaceDir, "metadata.json"),
    manifestPath: path.join(workspaceDir, "manifest.json"),
    summaryPath: path.join(workspaceDir, "summary.json"),
  };
}

export async function writeWorkspaceSummary(summaryPath, summary) {
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
}

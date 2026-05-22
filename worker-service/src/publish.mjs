import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function requireEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const assetsRepoPath = requireEnv(
  "ASSETS_REPO_PATH",
  "C:/Users/MD SAHIL HASNAIN/desktop/projects/islamic-library-assets",
);
const assetsRepoBranch = requireEnv("ASSETS_REPO_BRANCH", "main");
const assetsRepoOwner = requireEnv("ASSETS_REPO_OWNER", "your-github-user");
const assetsRepoName = requireEnv("ASSETS_REPO_NAME", "islamic-library-assets");

function runGit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", assetsRepoPath, ...args], {
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

      reject(new Error(stderr || stdout || `git ${args.join(" ")} failed with ${code}`));
    });
  });
}

async function copyFile(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

function jsdelivrUrl(relativePath) {
  return `https://cdn.jsdelivr.net/gh/${assetsRepoOwner}/${assetsRepoName}@${assetsRepoBranch}/${relativePath.replace(/\\/g, "/")}`;
}

export async function publishWorkspace({
  workspace,
  bookSlug,
  languageId,
  volumeId,
  metadata,
  manifest,
  version,
}) {
  const bookRoot = path.join(assetsRepoPath, "books", bookSlug);
  const volumeRoot = path.join(bookRoot, languageId, volumeId);
  const relativeBookRoot = path.join("books", bookSlug);
  const relativeVolumeRoot = path.join(relativeBookRoot, languageId, volumeId);
  const metadataRelativePath = path.join(relativeBookRoot, "metadata.json");
  const manifestRelativePath = path.join(relativeVolumeRoot, "manifest.json");
  const coverRelativePath = path.join(relativeBookRoot, "cover.webp");

  await fs.mkdir(volumeRoot, { recursive: true });

  const pageCopies = await Promise.all(
    manifest.pages.map(async (page) => {
      const sourcePath = path.join(workspace.pagesDir, page.fileName);
      const destinationPath = path.join(volumeRoot, page.fileName);
      await copyFile(sourcePath, destinationPath);
      return {
        ...page,
        url: jsdelivrUrl(path.join(relativeVolumeRoot, page.fileName)),
      };
    }),
  );

  await copyFile(workspace.coverImagePath, path.join(bookRoot, "cover.webp"));

  const publishedManifest = {
    ...manifest,
    version,
    baseUrl: jsdelivrUrl(relativeVolumeRoot),
    coverImage: jsdelivrUrl(coverRelativePath),
    pages: pageCopies,
  };

  const publishedMetadata = {
    ...metadata,
    coverImage: jsdelivrUrl(coverRelativePath),
    languages: metadata.languages.map((language) =>
      language.id === languageId
        ? {
            ...language,
            volumes: language.volumes.map((volume) =>
              volume.id === volumeId
                ? {
                    ...volume,
                    manifestUrl: jsdelivrUrl(manifestRelativePath),
                  }
                : volume,
            ),
          }
        : language,
    ),
  };

  await fs.writeFile(
    path.join(volumeRoot, "manifest.json"),
    JSON.stringify(publishedManifest, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(bookRoot, "metadata.json"),
    JSON.stringify(publishedMetadata, null, 2),
    "utf8",
  );

  const catalogPath = path.join(assetsRepoPath, "catalog.json");
  const currentCatalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const metadataUrl = jsdelivrUrl(metadataRelativePath);
  const updatedEntry = {
    id: bookSlug,
    title: publishedMetadata.title,
    subtitle: publishedMetadata.subtitle,
    author: publishedMetadata.author,
    category: publishedMetadata.category,
    coverImage: publishedMetadata.coverImage,
    status: "published",
    metadataUrl,
  };

  const remainingBooks = (currentCatalog.books || []).filter((book) => book.id !== bookSlug);
  const nextCatalog = {
    version,
    generatedAt: new Date().toISOString(),
    books: [...remainingBooks, updatedEntry].sort((a, b) => a.title.localeCompare(b.title)),
  };

  await fs.writeFile(catalogPath, JSON.stringify(nextCatalog, null, 2), "utf8");

  await runGit(["add", "."]);
  const commit = await runGit(["commit", "-m", `Publish ${bookSlug} ${languageId}/${volumeId} ${version}`]).catch(
    async (error) => {
      if (String(error.message).includes("nothing to commit")) {
        return { stdout: "", stderr: "" };
      }
      throw error;
    },
  );
  const sha = (
    await runGit(["rev-parse", "HEAD"])
  ).stdout.trim();

  return {
    gitCommitSha: sha,
    catalogPath: "catalog.json",
    metadataPath: metadataRelativePath.replace(/\\/g, "/"),
    manifestPath: manifestRelativePath.replace(/\\/g, "/"),
    assetBasePath: `${relativeVolumeRoot.replace(/\\/g, "/")}/`,
    metadataUrl,
    manifestUrl: jsdelivrUrl(manifestRelativePath),
    coverImageUrl: jsdelivrUrl(coverRelativePath),
    commitSummary: commit.stdout.trim() || commit.stderr.trim(),
  };
}

export function buildPublishVersion() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timePart = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
  return `${datePart}-${timePart}`;
}

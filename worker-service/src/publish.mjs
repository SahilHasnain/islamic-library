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
const gitPushEnabled = (process.env.GIT_PUSH_ENABLED || "false") === "true";
const githubToken = process.env.GITHUB_TOKEN || "";
const githubRepoHttps = process.env.GITHUB_REPO_HTTPS || "";
const gitRemoteName = process.env.GIT_REMOTE_NAME || "origin";

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

function maskToken(value) {
  if (!githubToken) {
    return value;
  }

  return value.replaceAll(githubToken, "***");
}

async function ensurePushRemote() {
  if (!gitPushEnabled) {
    return { pushConfigured: false, remoteName: gitRemoteName };
  }

  if (!githubToken) {
    throw new Error("GIT_PUSH_ENABLED=true requires GITHUB_TOKEN.");
  }

  const remoteUrl =
    githubRepoHttps ||
    `https://github.com/${assetsRepoOwner}/${assetsRepoName}.git`;
  const authenticatedRemoteUrl = remoteUrl.replace(
    "https://",
    `https://x-access-token:${githubToken}@`,
  );

  await runGit(["remote", "set-url", gitRemoteName, authenticatedRemoteUrl]).catch(async () => {
    await runGit(["remote", "add", gitRemoteName, authenticatedRemoteUrl]);
  });

  return {
    pushConfigured: true,
    remoteName: gitRemoteName,
    remoteUrl: maskToken(authenticatedRemoteUrl),
  };
}

async function copyFile(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

function jsdelivrUrl(relativePath) {
  return `https://cdn.jsdelivr.net/gh/${assetsRepoOwner}/${assetsRepoName}@${assetsRepoBranch}/${relativePath.replace(/\\/g, "/")}`;
}

function rawGithubUrl(relativePath) {
  return `https://raw.githubusercontent.com/${assetsRepoOwner}/${assetsRepoName}/${assetsRepoBranch}/${relativePath.replace(/\\/g, "/")}`;
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
  const coverFileName = manifest.coverImage || path.basename(workspace.coverImagePath);
  const bookRoot = path.join(assetsRepoPath, "books", bookSlug);
  const volumeRoot = path.join(bookRoot, languageId, volumeId);
  const relativeBookRoot = path.join("books", bookSlug);
  const relativeVolumeRoot = path.join(relativeBookRoot, languageId, volumeId);
  const metadataRelativePath = path.join(relativeBookRoot, "metadata.json");
  const manifestRelativePath = path.join(relativeVolumeRoot, "manifest.json");
  const coverRelativePath = path.join(relativeBookRoot, coverFileName);

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

  await copyFile(workspace.coverImagePath, path.join(bookRoot, coverFileName));

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
  const metadataUrl = rawGithubUrl(metadataRelativePath);
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
  const pushRemote = await ensurePushRemote();
  let pushSummary = "Push skipped in local-only mode.";

  if (gitPushEnabled) {
    const push = await runGit(["push", gitRemoteName, assetsRepoBranch]);
    pushSummary = [push.stdout.trim(), push.stderr.trim()].filter(Boolean).join("\n");
  }

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
    pushSummary,
    pushConfigured: pushRemote.pushConfigured,
    remoteName: pushRemote.remoteName,
    remoteUrl: pushRemote.remoteUrl,
  };
}

export function buildPublishVersion() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timePart = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
  return `${datePart}-${timePart}`;
}

export function getPublicAssetUrl(relativePath) {
  return jsdelivrUrl(relativePath);
}

export function getPublicMetadataUrl(relativePath) {
  return rawGithubUrl(relativePath);
}

export async function republishBookMetadata({
  bookSlug,
  title,
  subtitle,
  author,
  description,
  category,
  languageId,
  volumeId,
  version,
  sections,
}) {
  const bookRoot = path.join(assetsRepoPath, "books", bookSlug);
  const metadataPath = path.join(bookRoot, "metadata.json");
  const manifestRelativePath = path.join("books", bookSlug, languageId, volumeId, "manifest.json");
  const coverFileName = "cover.webp";
  const coverRelativePath = path.join("books", bookSlug, coverFileName);

  const existingMetadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const catalogPath = path.join(assetsRepoPath, "catalog.json");
  const currentCatalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

  const publishedMetadata = {
    ...existingMetadata,
    title,
    subtitle,
    author,
    description,
    category,
    coverImage: existingMetadata.coverImage || jsdelivrUrl(coverRelativePath),
    languages: (existingMetadata.languages || []).map((language) =>
      language.id === languageId
        ? {
            ...language,
            volumes: (language.volumes || []).map((volume) =>
              volume.id === volumeId
                ? {
                    ...volume,
                    sections: sections && sections.length > 0 ? sections : volume.sections,
                    manifestUrl: volume.manifestUrl || jsdelivrUrl(manifestRelativePath),
                  }
                : volume,
            ),
          }
        : language,
    ),
  };

  await fs.writeFile(metadataPath, JSON.stringify(publishedMetadata, null, 2), "utf8");

  const metadataRelativePath = path.join("books", bookSlug, "metadata.json");
  const metadataUrl = rawGithubUrl(metadataRelativePath);
  const updatedEntry = {
    id: bookSlug,
    title,
    subtitle,
    author,
    category,
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
  const commit = await runGit(["commit", "-m", `Republish metadata for ${bookSlug} ${version}`]).catch(
    async (error) => {
      if (String(error.message).includes("nothing to commit")) {
        return { stdout: "", stderr: "" };
      }
      throw error;
    },
  );
  const sha = (await runGit(["rev-parse", "HEAD"])).stdout.trim();
  const pushRemote = await ensurePushRemote();
  let pushSummary = "Push skipped in local-only mode.";

  if (gitPushEnabled) {
    const push = await runGit(["push", gitRemoteName, assetsRepoBranch]);
    pushSummary = [push.stdout.trim(), push.stderr.trim()].filter(Boolean).join("\n");
  }

  return {
    gitCommitSha: sha,
    metadataPath: metadataRelativePath.replace(/\\/g, "/"),
    metadataUrl,
    catalogPath: "catalog.json",
    manifestUrl: jsdelivrUrl(manifestRelativePath),
    coverImageUrl: publishedMetadata.coverImage,
    commitSummary: commit.stdout.trim() || commit.stderr.trim(),
    pushSummary,
    pushConfigured: pushRemote.pushConfigured,
    remoteName: pushRemote.remoteName,
    remoteUrl: pushRemote.remoteUrl,
  };
}

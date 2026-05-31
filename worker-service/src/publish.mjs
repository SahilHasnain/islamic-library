import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function requireEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const assetsRepoPath = requireEnv(
  "ASSETS_REPO_PATH",
  "D:/Projects/islamic-library-assets",
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
    return {
      pushConfigured: false,
      remoteName: gitRemoteName,
      error: "GIT_PUSH_ENABLED=true requires GITHUB_TOKEN.",
    };
  }

  const remoteUrl =
    githubRepoHttps ||
    `https://github.com/${assetsRepoOwner}/${assetsRepoName}.git`;
  const authenticatedRemoteUrl = remoteUrl.replace(
    "https://",
    `https://x-access-token:${githubToken}@`,
  );

  try {
    await runGit(["remote", "set-url", gitRemoteName, authenticatedRemoteUrl]).catch(async () => {
      await runGit(["remote", "add", gitRemoteName, authenticatedRemoteUrl]);
    });

    return {
      pushConfigured: true,
      remoteName: gitRemoteName,
      remoteUrl: maskToken(authenticatedRemoteUrl),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      pushConfigured: false,
      remoteName: gitRemoteName,
      remoteUrl: maskToken(authenticatedRemoteUrl),
      error: maskToken(message),
    };
  }
}

function buildPushResult(pushConfigured, remoteName, remoteUrl, pushStatus, pushError, pushSummary) {
  return {
    pushConfigured: Boolean(pushConfigured),
    remoteName,
    remoteUrl,
    pushStatus,
    pushError: pushError ? maskToken(String(pushError)) : "",
    pushSummary: pushSummary || "",
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
  const rootCoverRelativePath = path.join(relativeBookRoot, coverFileName);
  const volumeCoverRelativePath = path.join(relativeVolumeRoot, coverFileName);

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
  await copyFile(workspace.coverImagePath, path.join(volumeRoot, coverFileName));

  const publishedManifest = {
    ...manifest,
    version,
    baseUrl: jsdelivrUrl(relativeVolumeRoot),
    coverImage: jsdelivrUrl(volumeCoverRelativePath),
    pages: pageCopies,
  };

  // Read existing metadata to preserve other languages/volumes
  let existingMetadata = {};
  try {
    const existingMetadataPath = path.join(bookRoot, "metadata.json");
    const existingContent = await fs.readFile(existingMetadataPath, "utf8");
    existingMetadata = JSON.parse(existingContent);
  } catch (error) {
    // File doesn't exist yet, that's okay
  }

  // Merge languages: preserve existing languages and add/update the current one
  const existingLanguages = existingMetadata.languages || [];
  const currentLanguageIndex = existingLanguages.findIndex(lang => lang.id === languageId);
  
  let updatedLanguages;
  if (currentLanguageIndex >= 0) {
    // Language exists, merge volumes
    const existingLanguage = existingLanguages[currentLanguageIndex];
    const existingVolumes = existingLanguage.volumes || [];
    const currentVolumeIndex = existingVolumes.findIndex(vol => vol.id === volumeId);
    
    let updatedVolumes;
    if (currentVolumeIndex >= 0) {
      // Volume exists, update it
      updatedVolumes = [...existingVolumes];
      updatedVolumes[currentVolumeIndex] = {
        ...existingVolumes[currentVolumeIndex],
        ...(metadata.languages?.find(l => l.id === languageId)?.volumes?.find(v => v.id === volumeId) || {}),
        manifestUrl: jsdelivrUrl(manifestRelativePath),
      };
    } else {
      // Volume doesn't exist, add it
      const newVolume = {
        ...(metadata.languages?.find(l => l.id === languageId)?.volumes?.find(v => v.id === volumeId) || {}),
        id: volumeId,
        manifestUrl: jsdelivrUrl(manifestRelativePath),
      };
      updatedVolumes = [...existingVolumes, newVolume];
    }
    
    updatedLanguages = [...existingLanguages];
    updatedLanguages[currentLanguageIndex] = {
      ...existingLanguage,
      ...(metadata.languages?.find(l => l.id === languageId) || {}),
      volumes: updatedVolumes,
    };
  } else {
    // Language doesn't exist, add it
    const newLanguage = {
      ...(metadata.languages?.find(l => l.id === languageId) || {}),
      id: languageId,
      volumes: [{
        ...(metadata.languages?.find(l => l.id === languageId)?.volumes?.find(v => v.id === volumeId) || {}),
        id: volumeId,
        manifestUrl: jsdelivrUrl(manifestRelativePath),
      }],
    };
    updatedLanguages = [...existingLanguages, newLanguage];
  }

  const publishedMetadata = {
    ...existingMetadata,
    ...metadata,
    coverImage: existingMetadata.coverImage || jsdelivrUrl(rootCoverRelativePath),
    languages: updatedLanguages,
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
    nextRecommendedBookId: publishedMetadata.nextRecommendedBookId,
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
  let pushStatus = gitPushEnabled ? "pending" : "skipped";
  let pushError = null;
  let pushSummary = gitPushEnabled ? "" : "Push skipped in local-only mode.";

  if (gitPushEnabled) {
    if (!pushRemote.pushConfigured) {
      pushStatus = "failed";
      pushError = pushRemote.error || "Git push remote is not configured.";
      pushSummary = maskToken(String(pushError || ""));
    } else {
      try {
        const push = await runGit(["push", gitRemoteName, assetsRepoBranch]);
        pushStatus = "succeeded";
        pushSummary = [push.stdout.trim(), push.stderr.trim()].filter(Boolean).join("\n");
      } catch (error) {
        pushStatus = "failed";
        pushError = error instanceof Error ? error.message : String(error);
        pushSummary = maskToken(String(pushError || ""));
        console.error("Git push failed (non-fatal):", pushSummary);
      }
    }
  }

  return {
    gitCommitSha: sha,
    catalogPath: "catalog.json",
    metadataPath: metadataRelativePath.replace(/\\/g, "/"),
    manifestPath: manifestRelativePath.replace(/\\/g, "/"),
    assetBasePath: `${relativeVolumeRoot.replace(/\\/g, "/")}/`,
    metadataUrl,
    manifestUrl: jsdelivrUrl(manifestRelativePath),
    coverImageUrl: jsdelivrUrl(volumeCoverRelativePath),
    commitSummary: commit.stdout.trim() || commit.stderr.trim(),
    ...buildPushResult(
      pushRemote.pushConfigured,
      pushRemote.remoteName,
      pushRemote.remoteUrl,
      pushStatus,
      pushError,
      pushSummary,
    ),
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
  nextRecommendedBookId,
  defaultLanguageId,
  languageId,
  volumeId,
  version,
  languages,
}) {
  const bookRoot = path.join(assetsRepoPath, "books", bookSlug);
  const metadataPath = path.join(bookRoot, "metadata.json");
  const manifestRelativePath = path.join("books", bookSlug, languageId, volumeId, "manifest.json");
  const coverFileName = "cover.webp";
  const coverRelativePath = path.join("books", bookSlug, coverFileName);

  const existingMetadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const catalogPath = path.join(assetsRepoPath, "catalog.json");
  const currentCatalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

  const nextLanguages =
    Array.isArray(languages) && languages.length > 0
      ? languages.map((language) => ({
          id: language.languageId,
          title: language.title,
          nativeTitle: language.nativeTitle,
          summary: language.summary,
          order: language.order,
          defaultVolumeId: language.defaultVolumeId,
          volumes: (language.volumes || []).map((volume) => {
            const existingLanguage = (existingMetadata.languages || []).find(
              (currentLanguage) => currentLanguage.id === language.languageId,
            );
            const existingVolume = existingLanguage?.volumes?.find(
              (currentVolume) => currentVolume.id === volume.id,
            );
            const resolvedManifestUrl =
              volume.manifestUrl ||
              existingVolume?.manifestUrl ||
              (language.languageId === languageId && volume.id === volumeId
                ? jsdelivrUrl(manifestRelativePath)
                : undefined);

            return {
              id: volume.id,
              title: volume.title,
              subtitle: volume.subtitle,
              manifestUrl: resolvedManifestUrl,
              order: volume.order,
              printedPageStartPage: volume.printedPageStartPage,
              introNote: volume.introNote,
              todayTarget: volume.todayTarget,
              sections: volume.sections?.length ? volume.sections : existingVolume?.sections,
              plans: volume.plans?.length ? volume.plans : existingVolume?.plans,
            };
          }),
        }))
      : (existingMetadata.languages || []).map((language) =>
          language.id === languageId
            ? {
                ...language,
                volumes: (language.volumes || []).map((volume) =>
                  volume.id === volumeId
                    ? {
                        ...volume,
                        manifestUrl: volume.manifestUrl || jsdelivrUrl(manifestRelativePath),
                      }
                    : volume,
                ),
              }
            : language,
        );

  const publishedMetadata = {
    ...existingMetadata,
    title,
    subtitle,
    author,
    description,
    category,
    nextRecommendedBookId,
    coverImage: existingMetadata.coverImage || jsdelivrUrl(coverRelativePath),
    defaultLanguageId: defaultLanguageId || existingMetadata.defaultLanguageId,
    languages: nextLanguages,
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
    nextRecommendedBookId,
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
  let pushStatus = gitPushEnabled ? "pending" : "skipped";
  let pushError = null;
  let pushSummary = gitPushEnabled ? "" : "Push skipped in local-only mode.";

  if (gitPushEnabled) {
    if (!pushRemote.pushConfigured) {
      pushStatus = "failed";
      pushError = pushRemote.error || "Git push remote is not configured.";
      pushSummary = maskToken(String(pushError || ""));
    } else {
      try {
        const push = await runGit(["push", gitRemoteName, assetsRepoBranch]);
        pushStatus = "succeeded";
        pushSummary = [push.stdout.trim(), push.stderr.trim()].filter(Boolean).join("\n");
      } catch (error) {
        pushStatus = "failed";
        pushError = error instanceof Error ? error.message : String(error);
        pushSummary = maskToken(String(pushError || ""));
        console.error("Git push failed (non-fatal):", pushSummary);
      }
    }
  }

  return {
    gitCommitSha: sha,
    metadataPath: metadataRelativePath.replace(/\\/g, "/"),
    metadataUrl,
    catalogPath: "catalog.json",
    manifestUrl: jsdelivrUrl(manifestRelativePath),
    coverImageUrl: publishedMetadata.coverImage,
    commitSummary: commit.stdout.trim() || commit.stderr.trim(),
    ...buildPushResult(
      pushRemote.pushConfigured,
      pushRemote.remoteName,
      pushRemote.remoteUrl,
      pushStatus,
      pushError,
      pushSummary,
    ),
  };
}

export async function retryPushOnly() {
  const pushRemote = await ensurePushRemote();
  if (!gitPushEnabled) {
    return buildPushResult(
      pushRemote.pushConfigured,
      pushRemote.remoteName,
      pushRemote.remoteUrl,
      "skipped",
      "",
      "Push skipped in local-only mode.",
    );
  }

  if (!pushRemote.pushConfigured) {
    const message = pushRemote.error || "Git push remote is not configured.";
    return buildPushResult(
      pushRemote.pushConfigured,
      pushRemote.remoteName,
      pushRemote.remoteUrl,
      "failed",
      message,
      message,
    );
  }

  try {
    const push = await runGit(["push", gitRemoteName, assetsRepoBranch]);
    const pushSummary = [push.stdout.trim(), push.stderr.trim()].filter(Boolean).join("\n");
    return buildPushResult(
      pushRemote.pushConfigured,
      pushRemote.remoteName,
      pushRemote.remoteUrl,
      "succeeded",
      "",
      pushSummary,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const masked = maskToken(String(message || ""));
    console.error("Git push failed (non-fatal):", masked);
    return buildPushResult(
      pushRemote.pushConfigured,
      pushRemote.remoteName,
      pushRemote.remoteUrl,
      "failed",
      masked,
      masked,
    );
  }
}

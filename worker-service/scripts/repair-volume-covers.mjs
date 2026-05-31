import fs from "node:fs/promises";
import path from "node:path";

function requireEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function jsdelivrUrl({ owner, repo, branch, relativePath }) {
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${relativePath.replace(/\\/g, "/")}`;
}

async function copyExistingVolumeCover({ volumeRoot, manifest }) {
  const existingCoverPath = path.join(volumeRoot, "cover.png");
  if (await pathExists(existingCoverPath)) {
    return "cover.png";
  }

  const firstPageFileName = manifest.pages?.[0]?.fileName;
  if (!firstPageFileName) {
    return null;
  }

  const sourcePagePath = path.join(volumeRoot, firstPageFileName);
  if (!(await pathExists(sourcePagePath))) {
    return null;
  }

  await fs.copyFile(sourcePagePath, existingCoverPath);
  return "cover.png";
}

async function main() {
  const assetsRepoPath = requireEnv(
    "ASSETS_REPO_PATH",
    "D:/Projects/islamic-library-assets",
  );
  const owner = requireEnv("ASSETS_REPO_OWNER", "sahilhasnain");
  const repo = requireEnv("ASSETS_REPO_NAME", "islamic-library-assets");
  const branch = requireEnv("ASSETS_REPO_BRANCH", "main");
  const booksRoot = path.join(assetsRepoPath, "books");
  const repaired = [];
  const skipped = [];

  const bookEntries = await fs.readdir(booksRoot, { withFileTypes: true });
  for (const bookEntry of bookEntries) {
    if (!bookEntry.isDirectory()) {
      continue;
    }

    const bookSlug = bookEntry.name;
    const bookRoot = path.join(booksRoot, bookSlug);
    const languageEntries = await fs.readdir(bookRoot, { withFileTypes: true });

    for (const languageEntry of languageEntries) {
      if (!languageEntry.isDirectory()) {
        continue;
      }

      const languageId = languageEntry.name;
      const languageRoot = path.join(bookRoot, languageId);
      const volumeEntries = await fs.readdir(languageRoot, { withFileTypes: true });

      for (const volumeEntry of volumeEntries) {
        if (!volumeEntry.isDirectory()) {
          continue;
        }

        const volumeId = volumeEntry.name;
        const volumeRoot = path.join(languageRoot, volumeId);
        const manifestPath = path.join(volumeRoot, "manifest.json");
        if (!(await pathExists(manifestPath))) {
          continue;
        }

        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        const coverFileName = await copyExistingVolumeCover({ volumeRoot, manifest });
        if (!coverFileName) {
          skipped.push(`${bookSlug}/${languageId}/${volumeId}`);
          continue;
        }

        const coverRelativePath = path.join("books", bookSlug, languageId, volumeId, coverFileName);
        const nextCoverImage = jsdelivrUrl({ owner, repo, branch, relativePath: coverRelativePath });
        if (manifest.coverImage !== nextCoverImage) {
          await fs.writeFile(
            manifestPath,
            JSON.stringify({ ...manifest, coverImage: nextCoverImage }, null, 2),
            "utf8",
          );
        }

        repaired.push(`${bookSlug}/${languageId}/${volumeId}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        assetsRepoPath,
        repairedCount: repaired.length,
        skippedCount: skipped.length,
        repaired,
        skipped,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

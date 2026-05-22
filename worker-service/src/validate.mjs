import fs from "node:fs/promises";

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function validateRenderedWorkspace({
  metadata,
  manifest,
  renderSummary,
  workspace,
  expected,
}) {
  assert(renderSummary.totalPages > 0, "Rendered output has zero pages.");
  assert(Array.isArray(renderSummary.pages), "Rendered page list is missing.");
  assert(
    renderSummary.pages.length === renderSummary.totalPages,
    "Rendered page list length does not match totalPages.",
  );

  assert(metadata.id === expected.bookSlug, "Metadata book id does not match slug.");
  assert(
    metadata.languages?.[0]?.id === expected.languageId,
    "Metadata language does not match job payload.",
  );
  assert(
    metadata.languages?.[0]?.volumes?.[0]?.id === expected.volumeId,
    "Metadata volume does not match job payload.",
  );

  assert(manifest.bookId === expected.bookSlug, "Manifest book id does not match slug.");
  assert(manifest.languageId === expected.languageId, "Manifest language is incorrect.");
  assert(manifest.volumeId === expected.volumeId, "Manifest volume is incorrect.");
  assert(
    manifest.totalPages === renderSummary.totalPages,
    "Manifest totalPages does not match rendered output.",
  );
  assert(Array.isArray(manifest.pages), "Manifest pages array is missing.");
  assert(
    manifest.pages.length === renderSummary.totalPages,
    "Manifest pages length does not match rendered output.",
  );

  const requiredFiles = [
    workspace.sourcePdfPath,
    workspace.coverImagePath,
    workspace.metadataPath,
    workspace.manifestPath,
    workspace.renderSummaryPath,
  ];

  for (const filePath of requiredFiles) {
    assert(await fileExists(filePath), `Required file is missing: ${filePath}`);
  }

  for (const page of renderSummary.pages) {
    const pagePath = `${workspace.pagesDir}/${page.fileName}`;
    assert(await fileExists(pagePath), `Rendered page is missing: ${page.fileName}`);
    assert(page.width > 0 && page.height > 0, `Rendered page has invalid dimensions: ${page.fileName}`);
  }

  const uniquePageNames = new Set(manifest.pages.map((page) => page.fileName));
  assert(
    uniquePageNames.size === manifest.pages.length,
    "Manifest contains duplicate page file names.",
  );

  return {
    totalPages: renderSummary.totalPages,
    validatedPages: manifest.pages.length,
    coverFileName: renderSummary.coverFileName,
  };
}

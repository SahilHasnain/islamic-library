import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { downloadSourcePdf } from "./appwrite.mjs";

const allowedCategories = [
  "Aqaid",
  "Baghare Tehreer",
  "Dua",
  "Fazail",
  "Fiqh",
  "Hadees",
  "Islahe Aamaal",
  "Kalaam",
  "Knowledge",
  "Mahnama",
  "Radde Bid'aat",
  "Safarname",
  "Seerat",
  "Tarikh",
  "Tasawwuf",
  "Tehqeeq",
  "Zubaano Bayaan",
];

function getSectionTargets(totalPages) {
  return {
    targetSections: Math.max(3, Math.ceil(totalPages / 10)),
    maxSections: Math.max(5, Math.ceil(totalPages / 7)),
  };
}

function slugifyTitle(title, fallback) {
  const slug = String(title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || fallback;
}

function cleanSections(sections, totalPages) {
  if (!Array.isArray(sections)) {
    return [];
  }

  const { maxSections } = getSectionTargets(totalPages);
  const normalized = sections
    .map((section, index) => {
      const title = String(section?.title || "").trim();
      const startPage = Math.max(1, Math.floor(Number(section?.startPage)));
      const endPage = Math.min(totalPages, Math.floor(Number(section?.endPage)));

      if (!title || !Number.isFinite(startPage) || !Number.isFinite(endPage) || endPage < startPage) {
        return null;
      }

      return {
        id: slugifyTitle(title, `section-${index + 1}`),
        title: title.replace(/\s+\(continued\)$/i, ""),
        kind: String(section?.kind || "chapter").trim() || "chapter",
        startPage,
        endPage,
        estimatedMinutes: Math.max(3, Math.floor(Number(section?.estimatedMinutes) || (endPage - startPage + 1) * 2)),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startPage - right.startPage);

  const deduped = [];
  for (const section of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.title.toLowerCase() === section.title.toLowerCase()) {
      previous.endPage = Math.max(previous.endPage, section.endPage);
      previous.estimatedMinutes += section.estimatedMinutes;
      continue;
    }

    if (previous && section.startPage <= previous.endPage) {
      previous.endPage = Math.max(previous.startPage, section.startPage - 1);
    }

    deduped.push(section);
  }

  let compacted = deduped.filter((section) => section.endPage >= section.startPage);

  while (compacted.length > maxSections) {
    let mergeIndex = 0;
    let smallestSpan = Number.MAX_SAFE_INTEGER;

    for (let index = 0; index < compacted.length - 1; index += 1) {
      const span = compacted[index].endPage - compacted[index].startPage + 1;
      if (span < smallestSpan) {
        smallestSpan = span;
        mergeIndex = index;
      }
    }

    const current = compacted[mergeIndex];
    const next = compacted[mergeIndex + 1];
    compacted[mergeIndex] = {
      ...current,
      title: `${current.title} / ${next.title}`,
      id: slugifyTitle(`${current.title}-${next.title}`, current.id),
      endPage: next.endPage,
      estimatedMinutes: current.estimatedMinutes + next.estimatedMinutes,
    };
    compacted.splice(mergeIndex + 1, 1);
  }

  return compacted;
}

function runPython(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
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

function extractJson(text) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = fencedMatch ? fencedMatch[1].trim() : trimmed;

  if (source.startsWith("{")) {
    try {
      return JSON.parse(source);
    } catch {
      const balanced = extractFirstJsonObject(source);
      if (balanced) {
        return JSON.parse(balanced);
      }
    }
  }

  const objectStart = source.indexOf("{");
  if (objectStart >= 0) {
    const balanced = extractFirstJsonObject(source.slice(objectStart));
    if (balanced) {
      return JSON.parse(balanced);
    }
  }

  throw new Error("AI response did not contain JSON.");
}

function extractFirstJsonObject(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(0, index + 1);
      }
    }
  }

  return null;
}

function getAiConfig() {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const legacyOpenAiKey = process.env.OPENAI_API_KEY;

  if (!provider && legacyOpenAiKey) {
    return {
      provider: "openai-compatible",
      apiKey: legacyOpenAiKey,
      baseUrl: "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }

  return {
    provider,
    apiKey: process.env.AI_API_KEY || legacyOpenAiKey || "",
    baseUrl: process.env.AI_BASE_URL || "",
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || "",
  };
}

function buildPrompt({ extracted, context }) {
  const { targetSections, maxSections } = getSectionTargets(extracted.pageCount || extracted.pages.length || 1);
  const sampledText = extracted.pages
    .map((page) => `--- Rendered page ${page.page} ---\n${page.text || "[no extractable text]"}`)
    .join("\n\n")
    .slice(0, 60000);

  return `Analyze this Islamic library book PDF extract and return ONLY valid JSON.

Context:
${JSON.stringify(context, null, 2)}

PDF extract from the first pages:
${sampledText}

Return shape:
{
  "title": string | null,
  "subtitle": string | null,
  "author": string | null,
  "category": ${allowedCategories.map((category) => JSON.stringify(category)).join(" | ")} | null,
  "description": string | null,
  "languageId": string | null,
  "volumeTitle": string | null,
  "printedPageStartPage": number | null,
  "sections": [{"id": string, "title": string, "kind": string, "startPage": number, "endPage": number, "estimatedMinutes": number}],
  "confidence": "low" | "medium" | "high",
  "notes": string
}

Rules:
- rendered page means image/PDF index, not printed page number.
- printedPageStartPage should be the rendered page where printed page 1 begins.
- category must be exactly one item from this list: ${allowedCategories.join(", ")}.
- Target around ${targetSections} major sections and do not exceed ${maxSections} sections.
- Prefer table-of-contents/main chapter entries over every subheading.
- Merge small adjacent topics; avoid sections shorter than 3 pages unless they are clearly important.
- Do not use generic IDs like sec-01 when a title-based ID is possible.
- Do not mention OCR unless OCR text was explicitly provided.
- If unsure, use null and explain in notes.
- Keep sections conservative; only include sections clearly supported by the extract.`;
}

function buildSectionChunkPrompt({ pages, context }) {
  const { targetSections, maxSections } = getSectionTargets(pages.length);
  const chunkText = pages
    .map((page) => `--- Rendered page ${page.page} ---\n${page.text || "[no extractable text]"}`)
    .join("\n\n")
    .slice(0, 60000);

  return `Extract section/chapter candidates from this PDF chunk. Return ONLY valid JSON.

Context:
${JSON.stringify(context, null, 2)}

PDF chunk:
${chunkText}

Return shape:
{
  "sections": [{"id": string, "title": string, "kind": string, "startPage": number, "endPage": number, "estimatedMinutes": number}],
  "notes": string
}

Rules:
- Page numbers are rendered image/PDF indexes.
- Only include sections clearly supported by this chunk.
- Target around ${targetSections} major sections for this chunk and do not exceed ${maxSections}.
- Prefer main chapter/TOC entries over subheadings.
- Merge small adjacent topics; avoid sections shorter than 3 pages unless clearly important.
- Do not use generic IDs like sec-01 when a title-based ID is possible.
- Do not mention OCR unless OCR text was explicitly provided.
- Use conservative start/end pages.
- Do not invent metadata outside this chunk.`;
}

function buildMergePrompt({ baseDraft, sectionCandidates, context }) {
  const totalPages = Math.max(...sectionCandidates.map((section) => Number(section.endPage) || 1), 1);
  const { targetSections, maxSections } = getSectionTargets(totalPages);
  return `Merge these AI section candidates into one clean metadata draft. Return ONLY valid JSON.

Context:
${JSON.stringify(context, null, 2)}

Base draft:
${JSON.stringify(baseDraft, null, 2)}

Section candidates:
${JSON.stringify(sectionCandidates, null, 2).slice(0, 70000)}

Return shape:
{
  "title": string | null,
  "subtitle": string | null,
  "author": string | null,
  "category": ${allowedCategories.map((category) => JSON.stringify(category)).join(" | ")} | null,
  "description": string | null,
  "languageId": string | null,
  "volumeTitle": string | null,
  "printedPageStartPage": number | null,
  "sections": [{"id": string, "title": string, "kind": string, "startPage": number, "endPage": number, "estimatedMinutes": number}],
  "confidence": "low" | "medium" | "high",
  "notes": string
}

Rules:
- Preserve good fields from base draft.
- category must be exactly one item from: ${allowedCategories.join(", ")}.
- Merge duplicates and overlapping section candidates.
- Target around ${targetSections} major sections and do not exceed ${maxSections} sections.
- Prefer TOC/main chapter sections over every subheading.
- Merge small adjacent topics; avoid sections shorter than 3 pages unless clearly important.
- Do not use generic IDs like sec-01 when a title-based ID is possible.
- Do not mention OCR unless OCR text was explicitly provided.
- Sort sections by startPage.
- Do not invent sections not supported by candidates.`;
}

function chunkPages(pages, chunkSize) {
  const chunks = [];
  for (let index = 0; index < pages.length; index += chunkSize) {
    chunks.push(pages.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildFallbackDraft({ title, category, languageId, volumeId, extracted }) {
  const firstTextPage = extracted.pages.find((page) => page.text)?.page;
  const normalizedCategory = allowedCategories.includes(category) ? category : undefined;

  return {
    title: title || undefined,
    category: normalizedCategory,
    languageId,
    volumeId,
    printedPageStartPage: firstTextPage && firstTextPage > 1 ? firstTextPage : undefined,
    description: undefined,
    sections: [],
    confidence: "low",
    notes: "AI provider is not configured. Draft is based on basic PDF text extraction only.",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options) {
  const attempts = Number(process.env.AI_PROVIDER_RETRY_ATTEMPTS || 2);
  const timeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 90000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(700 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `AI provider fetch failed: ${lastError.message}`
      : "AI provider fetch failed.",
  );
}

async function callOpenAiCompatible({ config, prompt }) {
  const baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = config.model || "gpt-4o-mini";

  const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey || "ollama"}`,
      ...(config.provider === "openrouter"
        ? {
            "HTTP-Referer": process.env.AI_HTTP_REFERER || "http://localhost",
            "X-Title": process.env.AI_APP_TITLE || "Islamic Library Admin",
          }
        : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You produce careful editorial metadata drafts for an Islamic library admin console." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI request failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  return extractJson(result.choices?.[0]?.message?.content ?? "");
}

async function callGemini({ config, prompt }) {
  const model = config.model || "gemini-1.5-flash";
  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  return extractJson(result.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
}

async function callAiProviderPrompt(prompt) {
  const config = getAiConfig();
  if (!config.provider) {
    return null;
  }

  if (config.provider === "gemini") {
    if (!config.apiKey) {
      return null;
    }
    return callGemini({ config, prompt });
  }

  if (config.provider === "openrouter") {
    return callOpenAiCompatible({
      config: {
        ...config,
        baseUrl: config.baseUrl || "https://openrouter.ai/api/v1",
        model: config.model || "openrouter/free",
      },
      prompt,
    });
  }

  if (config.provider === "openai-compatible" || config.provider === "local") {
    return callOpenAiCompatible({
      config: {
        ...config,
        baseUrl: config.baseUrl || "http://localhost:11434/v1",
        model: config.model || "llama3.1",
      },
      prompt,
    });
  }

  throw new Error(`Unsupported AI_PROVIDER: ${config.provider}`);
}

async function callAiProvider({ extracted, context }) {
  return callAiProviderPrompt(buildPrompt({ extracted, context }));
}

async function buildChunkedDraft({ extracted, context }) {
  const basePages = { ...extracted, pages: extracted.pages.slice(0, Math.min(40, extracted.pages.length)) };
  const baseDraft = normalizeDraft(await callAiProvider({ extracted: basePages, context }), extracted.pageCount);
  if (!baseDraft) {
    return null;
  }

  const chunkSize = Number(process.env.AI_ANALYSIS_CHUNK_PAGES || 50);
  const chunks = chunkPages(extracted.pages, chunkSize);
  const sectionCandidates = [];
  const chunkWarnings = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const pages = chunks[index];
    try {
      const chunkDraft = await callAiProviderPrompt(buildSectionChunkPrompt({ pages, context }));
      if (Array.isArray(chunkDraft?.sections)) {
        sectionCandidates.push(...chunkDraft.sections);
      }
    } catch (error) {
      chunkWarnings.push(
        `Chunk ${index + 1} (${pages[0]?.page}-${pages[pages.length - 1]?.page}) failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  if (sectionCandidates.length === 0) {
    return baseDraft;
  }

  try {
    const mergedDraft = normalizeDraft(
      await callAiProviderPrompt(buildMergePrompt({ baseDraft, sectionCandidates, context })),
      extracted.pageCount,
    );

    return {
      ...mergedDraft,
      notes: [mergedDraft?.notes, chunkWarnings.length ? `Skipped chunks: ${chunkWarnings.join(" | ")}` : ""]
        .filter(Boolean)
        .join("\n"),
    };
  } catch (error) {
    return {
      ...baseDraft,
      sections: cleanSections(sectionCandidates, extracted.pageCount),
      notes: [
        baseDraft.notes,
        `Final merge failed, returned cleaned chunk sections instead: ${error instanceof Error ? error.message : "unknown error"}`,
        chunkWarnings.length ? `Skipped chunks: ${chunkWarnings.join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
}

function normalizeDraft(draft, totalPages = 100000) {
  if (!draft) {
    return draft;
  }

  return {
    ...draft,
    category: allowedCategories.includes(draft.category) ? draft.category : null,
    sections: cleanSections(draft.sections, totalPages),
  };
}

export async function analyzeSourcePdf({ sourceFileId, context, maxPages }) {
  const pdfBuffer = await downloadSourcePdf(sourceFileId);
  const tempPdfPath = path.join(os.tmpdir(), `ai-analysis-${sourceFileId}-${Date.now()}.pdf`);
  await fs.writeFile(tempPdfPath, pdfBuffer);

  try {
    const scriptPath = path.join(process.cwd(), "scripts", "extract-pdf-text.py");
    const resolvedMaxPages = Number.isFinite(Number(maxPages))
      ? Number(maxPages)
      : Number(process.env.AI_ANALYSIS_MAX_PAGES || 40);
    const output = await runPython(scriptPath, [tempPdfPath, String(resolvedMaxPages)]);
    const extracted = JSON.parse(output);
    const isFullAnalysis = resolvedMaxPages <= 0;
    const aiDraft = isFullAnalysis
      ? await buildChunkedDraft({ extracted, context })
      : normalizeDraft(await callAiProvider({ extracted, context }), extracted.pageCount);

    return {
      pageCount: extracted.pageCount,
      analyzedPages: extracted.pages.length,
      extractableTextPages: extracted.pages.filter((page) => page.text).length,
      draft: aiDraft ?? buildFallbackDraft({ ...context, extracted }),
      aiEnabled: Boolean(aiDraft),
    };
  } finally {
    await fs.rm(tempPdfPath, { force: true });
  }
}

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
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    return JSON.parse(match[1]);
  }

  throw new Error("AI response did not contain JSON.");
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
- If unsure, use null and explain in notes.
- Keep sections conservative; only include sections clearly supported by the extract.`;
}

function buildSectionChunkPrompt({ pages, context }) {
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
- Use conservative start/end pages.
- Do not invent metadata outside this chunk.`;
}

function buildMergePrompt({ baseDraft, sectionCandidates, context }) {
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

async function callOpenAiCompatible({ config, prompt }) {
  const baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = config.model || "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
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
  const response = await fetch(
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
  const baseDraft = normalizeDraft(await callAiProvider({ extracted: basePages, context }));
  if (!baseDraft) {
    return null;
  }

  const chunkSize = Number(process.env.AI_ANALYSIS_CHUNK_PAGES || 50);
  const chunks = chunkPages(extracted.pages, chunkSize);
  const sectionCandidates = [];

  for (const pages of chunks) {
    const chunkDraft = await callAiProviderPrompt(buildSectionChunkPrompt({ pages, context }));
    if (Array.isArray(chunkDraft?.sections)) {
      sectionCandidates.push(...chunkDraft.sections);
    }
  }

  if (sectionCandidates.length === 0) {
    return baseDraft;
  }

  return normalizeDraft(
    await callAiProviderPrompt(buildMergePrompt({ baseDraft, sectionCandidates, context })),
  );
}

function normalizeDraft(draft) {
  if (!draft) {
    return draft;
  }

  return {
    ...draft,
    category: allowedCategories.includes(draft.category) ? draft.category : null,
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
      : normalizeDraft(await callAiProvider({ extracted, context }));

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

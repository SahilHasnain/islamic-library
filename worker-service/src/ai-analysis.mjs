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
    targetSections: Math.max(3, Math.ceil(totalPages / 20)),
    maxSections: Math.max(5, Math.ceil(totalPages / 12)),
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
      const normalizedTitle = title.toLowerCase();
      const startPage = Math.max(1, Math.floor(Number(section?.startPage)));
      const endPage = Math.min(totalPages, Math.floor(Number(section?.endPage)));

      if (!title || !Number.isFinite(startPage) || !Number.isFinite(endPage) || endPage < startPage) {
        return null;
      }

      if (["contents", "content", "index", "fehrist", "fahrist"].includes(normalizedTitle)) {
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
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("AI response did not contain JSON.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = (fencedMatch ? fencedMatch[1].trim() : trimmed)
    .replace(/^Here is the JSON:\s*/i, "")
    .replace(/^JSON:\s*/i, "")
    .trim();

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

function getAiTextResponse(result) {
  const message = result.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || part?.content || ""))
      .join("\n");
  }

  if (message?.reasoning) {
    return message.reasoning;
  }

  return result.choices?.[0]?.text || "";
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

function buildLanguageRules(context) {
  const languageId = String(context?.languageId || "").trim() || "the PDF's primary language";
  return `Language rules:
- First determine the book's primary language/script from the PDF text and context languageId (${languageId}).
- Write user-facing fields in that same language/script: title, subtitle, author, description, volumeTitle, section titles, and notes.
- Do not translate Urdu, Arabic, Persian, or Hindi content into English unless the source book itself is English.
- Keep category exactly from the controlled English category list.
- Keep languageId as a lowercase identifier such as urdu, roman-urdu, arabic, hindi, or english.
- Keep section id values URL-safe ASCII slugs, even when section titles use Urdu/Arabic/Hindi script.`;
}

function getPromptTextCharLimit() {
  return Number(process.env.AI_PROMPT_TEXT_CHAR_LIMIT || 60000);
}

function getMergePromptCharLimit() {
  return Number(process.env.AI_MERGE_PROMPT_CHAR_LIMIT || 70000);
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
    .slice(0, getPromptTextCharLimit());

  return `Analyze this Islamic library book PDF extract and return ONLY valid JSON.

Context:
${JSON.stringify(context, null, 2)}

PDF extract from the first pages:
${sampledText}

PDF stats:
- total rendered pages in book: ${extracted.pageCount || extracted.pages.length || "unknown"}
- rendered pages included in this extract: ${extracted.pages.length}
- The full PDF exists and has the total rendered page count above. This text extract is only an early-page sample for analysis.

Return shape:
{
  "title": string | null,
  "subtitle": string | null,
  "author": string | null,
  "category": ${allowedCategories.map((category) => JSON.stringify(category)).join(" | ")} | null,
  "description": string | null,
  "summary": string | null,
  "languageId": string | null,
  "volumeTitle": string | null,
  "introNote": string | null,
  "todayTarget": string | null,
  "printedPageStartPage": number | null,
  "sections": [{"id": string, "title": string, "kind": string, "startPage": number, "endPage": number, "estimatedMinutes": number}],
  "plans": [{"id": string, "title": string, "description": string, "totalDays": number, "items": [{"day": number, "label": string, "startPage": number, "endPage": number, "estimatedMinutes": number}]}],
  "confidence": "low" | "medium" | "high",
  "notes": string
}

Rules:
${buildLanguageRules(context)}
- rendered page means image/PDF index, not printed page number.
- printedPageStartPage should be the rendered page where printed page 1 begins.
- category must be exactly one item from this list: ${allowedCategories.join(", ")}.
- Target around ${targetSections} major sections and do not exceed ${maxSections} sections.
- Prefer table-of-contents/main chapter entries over every subheading.
- If the early extract contains a table of contents/index, use it to draft app navigation sections for the full book, even when the chapter body pages are outside this extract.
- Never output the table of contents/index page itself as a section. Do not create sections titled Contents, Index, Fehrist, Fahrist, فہرست, or فهرس.
- If a TOC is present, extract the actual TOC entries and use those entries as the primary sections.
- A 315 page book should not have only 2-3 app sections when a clear TOC is present; create a practical set of major TOC sections across the whole book.
- Treat common TOC labels in the book language, such as Urdu or Arabic words for index/table of contents, as table-of-contents evidence.
- Do not stop app sections at the last extracted page when a TOC clearly lists later content.
- Do not say the full book is not present. Say only that the text sample is limited if needed.
- When using TOC entries, convert printed page references to rendered page indexes using printedPageStartPage if you can infer it; otherwise make the best conservative rendered-page estimate and explain uncertainty in notes.
- If printedPageStartPage is uncertain, still produce TOC-based sections using the best rendered-page estimate rather than dropping later TOC entries.
- App sections should represent major TOC chapters/topics, not every minor heading in the TOC.
- For TOC-derived sections, choose each endPage as the page before the next section starts; use total rendered pages (${extracted.pageCount || "pageCount"}) for the final section when known.
- Merge small adjacent topics; avoid sections shorter than 3 pages unless they are clearly important.
- Do not use generic IDs like sec-01 when a title-based ID is possible.
- Do not mention OCR unless OCR text was explicitly provided.
- If unsure, use null and explain in notes.
- Generate summary, introNote, todayTarget, and reading plans in the book language/script.
- Reading plans should cover the full book using rendered page ranges and avoid overlaps/gaps.
- Prefer one practical complete-book plan unless the book is short enough for multiple useful plans.
- Keep sections conservative; include sections supported by body pages or clearly listed in the TOC.`;
}


function buildMetadataOnlyPrompt({ extracted, context }) {
  const sampledText = extracted.pages
    .map((page) => `--- Rendered page ${page.page} ---\n${page.text || "[no extractable text]"}`)
    .join("\n\n")
    .slice(0, getPromptTextCharLimit());

  return `Draft metadata only for this Islamic library PDF sample. Return ONLY valid JSON.

Context:
${JSON.stringify(context, null, 2)}

PDF stats:
- total rendered pages in book: ${extracted.pageCount || extracted.pages.length || "unknown"}
- rendered pages included in this sample: ${extracted.pages.length}

PDF sample:
${sampledText}

Return shape:
{
  "title": string | null,
  "subtitle": string | null,
  "author": string | null,
  "category": ${allowedCategories.map((category) => JSON.stringify(category)).join(" | ")} | null,
  "description": string | null,
  "summary": string | null,
  "languageId": string | null,
  "volumeTitle": string | null,
  "introNote": string | null,
  "todayTarget": string | null,
  "printedPageStartPage": number | null,
  "sections": [],
  "plans": [],
  "confidence": "low" | "medium" | "high",
  "notes": string
}

Rules:
${buildLanguageRules(context)}
- Do not generate sections or reading plans in this step.
- category must be exactly one item from this list: ${allowedCategories.join(", ")}.
- description and summary are required unless no meaningful text is extractable; do not put the only description in notes.
- Write description, summary, introNote, todayTarget, and notes in the book language/script.
- printedPageStartPage should be the rendered page where printed page 1 begins, if inferable.
- If unsure, use null and explain in notes.`;
}
function buildTocExtractionPrompt({ extracted, context }) {
  const sampledText = extracted.pages
    .map((page) => `--- Rendered page ${page.page} ---\n${page.text || "[no extractable text]"}`)
    .join("\n\n")
    .slice(0, getPromptTextCharLimit());

  return `Extract the table of contents from this Islamic library PDF sample. Return ONLY valid JSON.

Context:
${JSON.stringify(context, null, 2)}

PDF stats:
- total rendered pages in book: ${extracted.pageCount || extracted.pages.length || "unknown"}
- rendered pages included in this sample: ${extracted.pages.length}

PDF sample:
${sampledText}

Return shape:
{
  "hasToc": boolean,
  "printedPageStartPage": number | null,
  "tocEntries": [{"title": string, "printedPage": number | null, "renderedPage": number | null, "level": number}],
  "notes": string
}

Rules:
${buildLanguageRules(context)}
- Detect TOC/index pages, including labels such as Contents, Index, Fehrist, Fahrist, فہرست, or فهرس.
- Do not include the TOC heading itself as a toc entry.
- Extract actual chapter/topic entries from the TOC in reading order.
- Keep entry titles in the book language/script.
- If the TOC lists printed page numbers, put the rightmost page number for that entry in printedPage.
- Never use 0 for printedPage; use null when no printed page number is visible for that entry.
- renderedPage means the actual rendered content page for that entry, not the rendered page where the TOC text was found.
- Do not set renderedPage to the TOC page number. If actual content rendered page cannot be inferred, use null.
- If printed page 1 appears to start on a rendered page, set printedPageStartPage.
- Use level 1 for major entries and level 2 for sub-entries.
- Prefer complete TOC coverage over body headings from later pages.
- If no TOC is visible, return hasToc false and an empty tocEntries array.`;
}

function buildDraftFromTocPrompt({ extracted, context, tocResult }) {
  const { targetSections, maxSections } = getSectionTargets(extracted.pageCount || extracted.pages.length || 1);
  return `Create an app metadata draft from extracted TOC entries. Return ONLY valid JSON.

Context:
${JSON.stringify(context, null, 2)}

PDF stats:
- total rendered pages in book: ${extracted.pageCount || extracted.pages.length || "unknown"}
- text sample pages analyzed: ${extracted.pages.length}

Extracted TOC result:
${JSON.stringify(tocResult, null, 2).slice(0, getMergePromptCharLimit())}

Return shape:
{
  "title": string | null,
  "subtitle": string | null,
  "author": string | null,
  "category": ${allowedCategories.map((category) => JSON.stringify(category)).join(" | ")} | null,
  "description": string | null,
  "summary": string | null,
  "languageId": string | null,
  "volumeTitle": string | null,
  "introNote": string | null,
  "todayTarget": string | null,
  "printedPageStartPage": number | null,
  "sections": [{"id": string, "title": string, "kind": string, "startPage": number, "endPage": number, "estimatedMinutes": number}],
  "plans": [{"id": string, "title": string, "description": string, "totalDays": number, "items": [{"day": number, "label": string, "startPage": number, "endPage": number, "estimatedMinutes": number}]}],
  "confidence": "low" | "medium" | "high",
  "notes": string
}

Rules:
${buildLanguageRules(context)}
- Use TOC entries as the primary source for app sections.
- Never output the TOC/index page itself as a section.
- Use all TOC entries that have usable printedPage or renderedPage values, including level 2 entries.
- Target around ${targetSections} app sections and do not exceed ${maxSections}.
- Convert printedPage to rendered startPage using printedPageStartPage when available. Formula: renderedPage = printedPage + printedPageStartPage - 1.
- If printedPageStartPage is uncertain, use renderedPage when supplied; otherwise make a conservative estimate from printedPage and explain uncertainty in notes.
- Section endPage should be one page before the next section startPage. Final section should end at total rendered pages (${extracted.pageCount || "pageCount"}) when known.
- Do not stop at the last text sample page. The full PDF exists.
- Keep category exactly one item from: ${allowedCategories.join(", ")}.
- Keep title/description/summary/section titles/plan text in the book language/script.
- description and summary are required unless no meaningful text is extractable; do not put the only description in notes.
- Generate introNote and todayTarget for the volume in the same language/script.
- Generate one complete-book reading plan from page 1 to ${extracted.pageCount || "pageCount"}; use 7, 14, or 30 days depending on book length.
- Reading plan item ranges must be rendered pages, sorted, and should cover the full book without overlaps.`;
}

function buildSectionChunkPrompt({ pages, context }) {
  const { targetSections, maxSections } = getSectionTargets(pages.length);
  const chunkText = pages
    .map((page) => `--- Rendered page ${page.page} ---\n${page.text || "[no extractable text]"}`)
    .join("\n\n")
    .slice(0, getPromptTextCharLimit());

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
${buildLanguageRules(context)}
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
${JSON.stringify(sectionCandidates, null, 2).slice(0, getMergePromptCharLimit())}

Return shape:
{
  "title": string | null,
  "subtitle": string | null,
  "author": string | null,
  "category": ${allowedCategories.map((category) => JSON.stringify(category)).join(" | ")} | null,
  "description": string | null,
  "summary": string | null,
  "languageId": string | null,
  "volumeTitle": string | null,
  "introNote": string | null,
  "todayTarget": string | null,
  "printedPageStartPage": number | null,
  "sections": [{"id": string, "title": string, "kind": string, "startPage": number, "endPage": number, "estimatedMinutes": number}],
  "plans": [{"id": string, "title": string, "description": string, "totalDays": number, "items": [{"day": number, "label": string, "startPage": number, "endPage": number, "estimatedMinutes": number}]}],
  "confidence": "low" | "medium" | "high",
  "notes": string
}

Rules:
${buildLanguageRules(context)}
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
  const totalPages = extracted.pageCount || extracted.pages.length || 1;

  return {
    title: title || undefined,
    category: normalizedCategory,
    languageId,
    volumeId,
    printedPageStartPage: firstTextPage && firstTextPage > 1 ? firstTextPage : undefined,
    description: undefined,
    sections: [],
    plans: buildDefaultReadingPlans(totalPages),
    confidence: "low",
    notes: "AI provider is not configured. Draft is based on basic PDF text extraction only.",
  };
}

function buildDefaultReadingPlans(totalPages) {
  const pageCount = Math.max(1, Math.floor(Number(totalPages) || 1));
  const totalDays = pageCount > 200 ? 30 : pageCount > 80 ? 14 : 7;
  const pageSpan = Math.max(1, Math.ceil(pageCount / totalDays));
  const items = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const startPage = Math.floor(((day - 1) * pageCount) / totalDays) + 1;
    const endPage = Math.floor((day * pageCount) / totalDays);
    items.push({
      day,
      label: `Day ${day}`,
      startPage,
      endPage,
      estimatedMinutes: Math.max(3, (endPage - startPage + 1) * 2),
    });
  }

  return [
    {
      id: `${totalDays}-day-reading-plan`,
      title: `${totalDays}-day reading plan`,
      description: `Read the complete book in ${totalDays} steady sessions.`,
      totalDays,
      items,
    },
  ];
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

function getRetryDelayMs(response, bodyText) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.ceil(retryAfter * 1000) + 500;
  }

  const messageDelay = bodyText.match(/try again in\s+([0-9.]+)s/i)?.[1];
  const parsedDelay = Number(messageDelay);
  if (Number.isFinite(parsedDelay) && parsedDelay > 0) {
    return Math.ceil(parsedDelay * 1000) + 500;
  }

  return 5000;
}

async function callOpenAiCompatible({ config, prompt }) {
  const baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = config.model || "gpt-4o-mini";
  const attempts = Number(process.env.AI_PROVIDER_RETRY_ATTEMPTS || 3);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
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
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You produce careful editorial metadata drafts for an Islamic library admin console." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 429 && attempt < attempts) {
        await sleep(getRetryDelayMs(response, text));
        continue;
      }
      throw new Error(`AI request failed (${response.status}): ${text}`);
    }

    const result = await response.json();
    return extractJson(getAiTextResponse(result));
  }

  throw new Error("AI request failed after retries.");
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

export async function rerankRecommendationCandidates({ currentBook, candidates }) {
  const safeCandidates = Array.isArray(candidates) ? candidates.slice(0, 12) : [];
  const prompt = `Rerank related book candidates for an Islamic library app. Return ONLY valid JSON.

Current book:
${JSON.stringify(currentBook || {}, null, 2)}

Candidates:
${JSON.stringify(safeCandidates, null, 2)}

Return shape:
{
  "recommendations": [{"bookId": string, "reason": string, "type": "same-author" | "same-topic" | "same-category" | "next-reading" | "foundational" | "advanced", "score": number}]
}

Rules:
- Choose only bookId values from the provided candidates.
- Do not invent book IDs.
- Return 3 to 5 recommendations when possible.
- Prefer a diverse useful shelf over duplicates of the same reason.
- Keep reasons concise and in the same language as the current book title/summary when possible.
- score should be 1-100.`;

  const result = await callAiProviderPrompt(prompt);
  const allowedIds = new Set(safeCandidates.map((candidate) => String(candidate.slug || candidate.bookId || "")));
  const recommendations = Array.isArray(result?.recommendations)
    ? result.recommendations
        .map((recommendation) => {
          const bookId = String(recommendation?.bookId || "").trim();
          if (!allowedIds.has(bookId)) {
            return null;
          }

          return {
            bookId,
            reason: String(recommendation?.reason || "").trim(),
            type: String(recommendation?.type || "same-topic").trim(),
            score: Math.max(1, Math.min(100, Math.floor(Number(recommendation?.score) || 1))),
          };
        })
        .filter(Boolean)
    : [];

  return { recommendations };
}

function normalizeTocEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      const title = String(entry?.title || "").trim();
      if (!title) {
        return null;
      }

        const printedPage = Number(entry?.printedPage);
        const renderedPage = Number(entry?.renderedPage);
        return {
          title,
          printedPage: Number.isFinite(printedPage) && printedPage > 0 ? Math.floor(printedPage) : null,
          renderedPage: Number.isFinite(renderedPage) && renderedPage > 0 ? Math.floor(renderedPage) : null,
          level: Number.isFinite(Number(entry?.level)) ? Math.max(1, Math.floor(Number(entry.level))) : 1,
        };
    })
    .filter(Boolean);
}

function cleanTocTitle(value) {
  return String(value || "")
    .replace(/[.·•…]+/g, " ")
    .replace(/\s*[-–—]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTocHeaderLine(line) {
  const normalized = line.toLowerCase().trim();
  return (
    !normalized ||
    normalized === "contents" ||
    normalized === "content" ||
    normalized === "index" ||
    normalized === "fehrist" ||
    normalized === "fahrist" ||
    normalized === "mukashafatul quloob" ||
    /^\(?part\s+\d+\)?$/i.test(line) ||
    /^\d{1,3}$/.test(line)
  );
}

function inferTocEntryLevel(title) {
  const normalized = String(title || "").toLowerCase().trim();
  if (
    /^baab\b/.test(normalized) ||
    /^baabe\b/.test(normalized) ||
    /\bbaab$/.test(normalized) ||
    /\bbaab\b/.test(normalized) ||
    /^chapter\b/.test(normalized) ||
    /^nashir\b/.test(normalized) ||
    /^istefta\b/.test(normalized) ||
    /^al\s+jawab\b/.test(normalized) ||
    /^muqaddima\b/.test(normalized) ||
    /^nazre\b/.test(normalized) ||
    /^jawabe?\b/.test(normalized) ||
    /^harfe\s+aakhir\b/.test(normalized)
  ) {
    return 1;
  }

  if (
    /^hadees\b/.test(normalized) ||
    /^aayat\b/.test(normalized) ||
    /^riwayat\b/.test(normalized) ||
    /^hikaayat\b/.test(normalized)
  ) {
    return 3;
  }

  return 2;
}

function parseDeterministicTocEntries(extracted) {
  const entries = [];
  let printedPageStartPage = null;
  let inToc = false;
  let pagesWithoutEntries = 0;

  for (const page of extracted.pages || []) {
    const rawLines = String(page.text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const hasTocHeading = rawLines.some((line) => /^(contents?|index|fehrist|fahrist)$/i.test(line));
    if (hasTocHeading) {
      inToc = true;
    }

    if (!inToc) {
      continue;
    }

    const printedMarker = rawLines.find((line) => /^\d{1,3}$/.test(line));
    if (!printedPageStartPage && printedMarker) {
      const printedPage = Number(printedMarker);
      if (printedPage > 0 && printedPage < 20) {
        printedPageStartPage = page.page - printedPage + 1;
      }
    }

    let pageEntryCount = 0;
    let buffer = "";
    for (const rawLine of rawLines) {
      if (isTocHeaderLine(rawLine)) {
        continue;
      }

      const match = rawLine.match(/^(.*?)(?:[.·•…\s]+|:-\s*|:\s*|-)\s*(\d{1,4})$/);
      if (match) {
        const title = cleanTocTitle([buffer, match[1]].filter(Boolean).join(" "));
        const printedPage = Number(match[2]);
        buffer = "";
        if (title && printedPage > 0) {
          entries.push({
            title,
            printedPage,
            renderedPage: null,
            level: inferTocEntryLevel(title),
          });
          pageEntryCount += 1;
        }
        continue;
      }

      buffer = cleanTocTitle([buffer, rawLine].filter(Boolean).join(" "));
    }

    pagesWithoutEntries = pageEntryCount > 0 ? 0 : pagesWithoutEntries + 1;
    if (entries.length > 0 && pagesWithoutEntries >= 2) {
      break;
    }
  }

  const seen = new Set();
  const uniqueEntries = entries.filter((entry) => {
    const key = `${entry.title.toLowerCase()}::${entry.printedPage}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return {
    hasToc: uniqueEntries.length > 0,
    printedPageStartPage,
    tocEntries: uniqueEntries,
    notes: uniqueEntries.length > 0 ? "TOC parsed deterministically from extracted text." : "",
  };
}

function mergeTocResults(primary, secondary) {
  const primaryEntries = normalizeTocEntries(primary?.tocEntries);
  const secondaryEntries = normalizeTocEntries(secondary?.tocEntries);
  const merged = [];
  const seen = new Set();

  for (const entry of [...primaryEntries, ...secondaryEntries]) {
    const key = `${entry.title.toLowerCase()}::${entry.printedPage || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(entry);
  }

  return {
    ...(secondary || {}),
    ...(primary || {}),
    hasToc: merged.length > 0,
    printedPageStartPage: primary?.printedPageStartPage || secondary?.printedPageStartPage || null,
    tocEntries: merged,
    notes: [primary?.notes, secondary?.notes].filter(Boolean).join("\n"),
  };
}

function buildSectionsFromTocEntries(tocEntries, pageCount, printedPageStartPage) {
  const startPageOffset = Number(printedPageStartPage || 0);
  const { targetSections, maxSections } = getSectionTargets(pageCount || 1);
  const starts = normalizeTocEntries(tocEntries)
    .map((entry, index) => {
      const mappedPrintedPage = entry.printedPage && startPageOffset
        ? entry.printedPage + startPageOffset - 1
        : null;
      const startPage = mappedPrintedPage || entry.renderedPage;
      if (!startPage || startPage < 1) {
        return null;
      }

      return {
        title: entry.title,
        level: entry.level,
        startPage,
        sourceIndex: index,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startPage - right.startPage)
    .filter((entry, index, entries) => !entries[index - 1] || entries[index - 1].startPage !== entry.startPage);

  const majorStarts = starts.filter((entry) => entry.level <= 1);
  let selectedStarts = majorStarts.length >= 3 ? majorStarts : starts;

  if (selectedStarts.length < targetSections) {
    const selectedIndexes = new Set(selectedStarts.map((entry) => entry.sourceIndex));
    const supplementalStarts = starts
      .filter((entry) => !selectedIndexes.has(entry.sourceIndex))
      .filter((entry) => {
        const previous = selectedStarts
          .filter((selected) => selected.startPage < entry.startPage)
          .at(-1);
        const next = selectedStarts.find((selected) => selected.startPage > entry.startPage);
        const previousGap = previous ? entry.startPage - previous.startPage : Number.MAX_SAFE_INTEGER;
        const nextGap = next ? next.startPage - entry.startPage : Number.MAX_SAFE_INTEGER;
        return Math.max(previousGap, nextGap) >= 25;
      });

    selectedStarts = [...selectedStarts, ...supplementalStarts]
      .sort((left, right) => left.startPage - right.startPage);
  }

  if (selectedStarts.length > maxSections) {
    let minGap = Math.max(4, Math.floor((pageCount || selectedStarts.at(-1)?.startPage || 1) / maxSections));
    let compacted = selectedStarts;
    while (compacted.length > maxSections) {
      compacted = [selectedStarts[0]];
      for (const entry of selectedStarts.slice(1)) {
        const previous = compacted[compacted.length - 1];
        if (entry.startPage - previous.startPage >= minGap) {
          compacted.push(entry);
        }
      }
      minGap += 1;
    }

    const lastStart = selectedStarts[selectedStarts.length - 1];
    const compactedLast = compacted[compacted.length - 1];
    if (lastStart && compactedLast && lastStart.startPage !== compactedLast.startPage) {
      compacted[compacted.length - 1] = lastStart;
      compacted = compacted.sort((left, right) => left.startPage - right.startPage);
    }
    selectedStarts = compacted;
  }

  return selectedStarts.map((entry, index) => {
    const next = selectedStarts[index + 1];
    const endPage = Math.max(entry.startPage, next ? next.startPage - 1 : pageCount || entry.startPage);
    return {
      id: slugifyTitle(entry.title, `toc-section-${entry.sourceIndex + 1}`),
      title: entry.title,
      kind: "chapter",
      startPage: Math.floor(entry.startPage),
      endPage: Math.floor(endPage),
      estimatedMinutes: Math.max(3, (endPage - entry.startPage + 1) * 2),
    };
  });
}

async function buildTocFirstDraft({ extracted, context }) {
  const deterministicTocResult = parseDeterministicTocEntries(extracted);
  const aiTocResult = await callAiProviderPrompt(buildTocExtractionPrompt({ extracted, context }));
  const tocResult = mergeTocResults(deterministicTocResult, aiTocResult);
  const tocEntries = normalizeTocEntries(tocResult?.tocEntries);
  if (!tocResult?.hasToc || tocEntries.length === 0) {
    const fallbackDraft = normalizeDraft(await callAiProvider({ extracted, context }), extracted.pageCount);
    return { draft: fallbackDraft, tocEntries };
  }

  const normalizedTocResult = {
    ...tocResult,
    tocEntries,
  };
  const aiDraft = normalizeDraft(
    await callAiProviderPrompt(buildDraftFromTocPrompt({ extracted, context, tocResult: normalizedTocResult })),
    extracted.pageCount,
  );
  const fallbackDraft = buildFallbackDraft({ ...context, extracted });
  const draft = aiDraft || fallbackDraft;
  const tocSections = buildSectionsFromTocEntries(
    deterministicTocResult.tocEntries?.length ? deterministicTocResult.tocEntries : tocEntries,
    extracted.pageCount,
    deterministicTocResult.printedPageStartPage ?? tocResult.printedPageStartPage ?? draft?.printedPageStartPage,
  );
  const draftSections = Array.isArray(draft?.sections) ? draft.sections : [];

  return {
    draft: {
      ...draft,
      printedPageStartPage: tocResult.printedPageStartPage ?? draft?.printedPageStartPage ?? null,
      sections: tocSections.length > 0 ? tocSections : draftSections,
      plans: draft?.plans?.length ? draft.plans : buildDefaultReadingPlans(extracted.pageCount),
      notes: [draft?.notes, tocResult?.notes ? `TOC extraction: ${tocResult.notes}` : ""]
        .filter(Boolean)
        .join("\n"),
    },
    tocEntries,
    aiEnabled: Boolean(aiDraft),
  };
}

async function buildChunkedDraft({ extracted, context }) {
  const basePages = { ...extracted, pages: extracted.pages.slice(0, Math.min(40, extracted.pages.length)) };
  const baseDraft = normalizeDraft(await callAiProvider({ extracted: basePages, context }), extracted.pageCount);
  if (!baseDraft) {
    const fallbackDraft = buildFallbackDraft({ ...context, extracted });
    const deterministicTocResult = parseDeterministicTocEntries(extracted);
    const tocSections = buildSectionsFromTocEntries(
      deterministicTocResult.tocEntries,
      extracted.pageCount,
      deterministicTocResult.printedPageStartPage ?? fallbackDraft.printedPageStartPage,
    );
    return {
      ...fallbackDraft,
      printedPageStartPage: deterministicTocResult.printedPageStartPage ?? fallbackDraft.printedPageStartPage,
      sections: tocSections.length > 0 ? tocSections : fallbackDraft.sections,
      notes: [fallbackDraft.notes, deterministicTocResult.notes].filter(Boolean).join("\n"),
    };
  }

  const deterministicTocResult = parseDeterministicTocEntries(extracted);
  const tocSections = buildSectionsFromTocEntries(
    deterministicTocResult.tocEntries,
    extracted.pageCount,
    deterministicTocResult.printedPageStartPage ?? baseDraft.printedPageStartPage,
  );
  if (tocSections.length > 0) {
    return {
      ...baseDraft,
      printedPageStartPage: deterministicTocResult.printedPageStartPage ?? baseDraft.printedPageStartPage,
      sections: tocSections,
      plans: baseDraft.plans?.length ? baseDraft.plans : buildDefaultReadingPlans(extracted.pageCount),
      notes: [baseDraft.notes, deterministicTocResult.notes].filter(Boolean).join("\n"),
    };
  }

  const chunkSize = Number(process.env.AI_ANALYSIS_CHUNK_PAGES || 50);
  const chunks = chunkPages(extracted.pages, chunkSize);
  const sectionCandidates = [];
  const chunkWarnings = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const pages = chunks[index];
    try {
      const chunkDelayMs = Number(process.env.AI_ANALYSIS_CHUNK_DELAY_MS || 5000);
      if (index > 0 && chunkDelayMs > 0) {
        await sleep(chunkDelayMs);
      }
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

  const notes = String(draft.notes || "").trim();
  const fallbackDescription = notes.length > 30 ? notes.slice(0, 1200) : undefined;

  return {
    ...draft,
    description: draft.description || fallbackDescription,
    summary: draft.summary || draft.description || fallbackDescription,
    introNote: draft.introNote || fallbackDescription,
    todayTarget: draft.todayTarget || (totalPages ? `Read pages 1-${Math.min(totalPages, 5)} with focus and consistency.` : undefined),
    category: allowedCategories.includes(draft.category) ? draft.category : null,
    sections: cleanSections(draft.sections, totalPages),
    plans: normalizePlans(draft.plans, totalPages),
  };
}

function normalizePlans(plans, totalPages) {
  if (!Array.isArray(plans)) {
    return [];
  }

  return plans
    .map((plan, planIndex) => {
      const title = String(plan?.title || "").trim();
      const rawItems = Array.isArray(plan?.items) ? plan.items : [];
      const normalizedItems = rawItems
        .map((item, itemIndex) => {
          const startPage = Math.max(1, Math.floor(Number(item?.startPage)));
          const endPage = Math.min(totalPages, Math.floor(Number(item?.endPage)));
          if (!Number.isFinite(startPage) || !Number.isFinite(endPage) || endPage < startPage) {
            return null;
          }

          return {
            day: Math.max(1, Math.floor(Number(item?.day) || itemIndex + 1)),
            label: String(item?.label || `Day ${itemIndex + 1}`).trim(),
            startPage,
            endPage,
            estimatedMinutes: Math.max(3, Math.floor(Number(item?.estimatedMinutes) || (endPage - startPage + 1) * 2)),
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.startPage - right.startPage);

      const items = normalizedItems.map((item, itemIndex) => {
        const previousFixedEndPage = itemIndex === 0
          ? 0
          : Math.floor((itemIndex * totalPages) / normalizedItems.length);
        const startPage = itemIndex === 0 ? 1 : previousFixedEndPage + 1;
        const endPage = itemIndex === normalizedItems.length - 1
          ? totalPages
          : Math.max(startPage, Math.floor(((itemIndex + 1) * totalPages) / normalizedItems.length));
        return {
          ...item,
          day: itemIndex + 1,
          startPage,
          endPage,
          estimatedMinutes: Math.max(3, (endPage - startPage + 1) * 2),
        };
      });

      if (!title || items.length === 0) {
        return null;
      }

      return {
        id: slugifyTitle(String(plan?.id || title), `plan-${planIndex + 1}`),
        title,
        description: String(plan?.description || "").trim(),
        totalDays: items.length,
        items,
      };
    })
    .filter(Boolean);
}

function buildExtractedTextPreview(extracted) {
  const maxPages = Number(process.env.AI_EXTRACT_PREVIEW_PAGES || 20);
  const maxCharsPerPage = Number(process.env.AI_EXTRACT_PREVIEW_CHARS_PER_PAGE || 2500);

  return extracted.pages.slice(0, maxPages).map((page) => ({
    page: page.page,
    text: String(page.text || "").slice(0, maxCharsPerPage),
    textLength: String(page.text || "").length,
  }));
}

export async function analyzeSourcePdf({ sourceFileId, context, maxPages, analysisMode = "draft" }) {
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
    if (analysisMode === "toc-only") {
      const deterministicTocResult = parseDeterministicTocEntries(extracted);
      const aiTocResult = await callAiProviderPrompt(buildTocExtractionPrompt({ extracted, context }));
      const tocResult = mergeTocResults(deterministicTocResult, aiTocResult);
      const tocEntries = normalizeTocEntries(tocResult?.tocEntries);
      const draft = buildFallbackDraft({ ...context, extracted });
      return {
        pageCount: extracted.pageCount,
        analyzedPages: extracted.pages.length,
        extractableTextPages: extracted.pages.filter((page) => page.text).length,
        extractedTextPreview: buildExtractedTextPreview(extracted),
        tocEntries,
        draft: {
          ...draft,
          printedPageStartPage: tocResult?.printedPageStartPage ?? draft.printedPageStartPage,
          sections: [],
          notes: tocResult?.notes || "TOC-only analysis completed.",
        },
        aiEnabled: Boolean(aiTocResult),
      };
    }

    if (analysisMode === "metadata-only") {
      const aiDraft = normalizeDraft(
        await callAiProviderPrompt(buildMetadataOnlyPrompt({ extracted, context })),
        extracted.pageCount,
      );
      return {
        pageCount: extracted.pageCount,
        analyzedPages: extracted.pages.length,
        extractableTextPages: extracted.pages.filter((page) => page.text).length,
        extractedTextPreview: buildExtractedTextPreview(extracted),
        tocEntries: [],
        draft: aiDraft ?? buildFallbackDraft({ ...context, extracted }),
        aiEnabled: Boolean(aiDraft),
      };
    }

    const quickAnalysisStrategy = process.env.AI_QUICK_ANALYSIS_STRATEGY || "toc-first";
    const quickResult = isFullAnalysis
      ? { draft: null, tocEntries: [] }
      : quickAnalysisStrategy === "toc-first"
        ? await buildTocFirstDraft({ extracted, context })
        : {
            draft: normalizeDraft(await callAiProvider({ extracted, context }), extracted.pageCount),
            tocEntries: [],
          };
    const aiDraft = isFullAnalysis
      ? await buildChunkedDraft({ extracted, context })
      : quickResult.draft;

    return {
      pageCount: extracted.pageCount,
      analyzedPages: extracted.pages.length,
      extractableTextPages: extracted.pages.filter((page) => page.text).length,
      extractedTextPreview: buildExtractedTextPreview(extracted),
      tocEntries: quickResult.tocEntries,
      draft: aiDraft ?? buildFallbackDraft({ ...context, extracted }),
      aiEnabled: Boolean(isFullAnalysis ? aiDraft : quickResult.aiEnabled),
    };
  } finally {
    await fs.rm(tempPdfPath, { force: true });
  }
}

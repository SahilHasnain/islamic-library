import { analyzeSourcePdf } from "../src/ai-analysis.mjs";

const books = [
  {
    slug: "addawatul-makkiyyah",
    title: "Addawatul Makkiyyah",
    languageId: "roman-urdu",
    sourceFileId: "ac693f8d-0375-4f71-bd88-6f37a474a273",
  },
  {
    slug: "al-amna-wal-ula",
    title: "Al Amna Wal Ula",
    languageId: "Roman Urdu",
    sourceFileId: "2a059966-9201-4ce5-8344-8f273b8aee5b",
  },
  {
    slug: "mukashafatul-quloob",
    title: "Mukashafatul Quloob",
    languageId: "roman-urdu",
    sourceFileId: "0cc1fd9f-6baa-42ab-99a3-1d1f739d863c",
  },
];

const selectedMode = process.argv[2] || "draft";
const selectedSlug = process.argv[3] || "all";
const maxPages = Number(process.argv[4] ?? (selectedMode === "full" ? 0 : 40));

function validateSections(sections) {
  const overlaps = [];
  const gaps = [];
  const invalid = [];

  sections.forEach((section, index) => {
    if (!section.title || !Number.isFinite(section.startPage) || !Number.isFinite(section.endPage) || section.endPage < section.startPage) {
      invalid.push({ index, section });
    }

    const previous = sections[index - 1];
    if (!previous) {
      return;
    }

    if (section.startPage <= previous.endPage) {
      overlaps.push({ previous: previous.title, current: section.title });
    } else if (section.startPage > previous.endPage + 1) {
      gaps.push({ previous: previous.title, current: section.title, gap: [previous.endPage + 1, section.startPage - 1] });
    }
  });

  return { overlaps, gaps, invalid };
}

function validatePlans(plans, pageCount) {
  return (plans || []).map((plan) => {
    const items = Array.isArray(plan.items) ? plan.items : [];
    const sectionValidation = validateSections(items.map((item) => ({
      title: item.label || `Day ${item.day}`,
      startPage: Number(item.startPage),
      endPage: Number(item.endPage),
    })));
    const startsAtBeginning = items[0]?.startPage === 1;
    const endsAtBookEnd = items.at(-1)?.endPage === pageCount;
    return {
      id: plan.id,
      title: plan.title,
      totalDays: plan.totalDays,
      itemCount: items.length,
      startsAtBeginning,
      endsAtBookEnd,
      overlaps: sectionValidation.overlaps.length,
      gaps: sectionValidation.gaps.length,
      invalid: sectionValidation.invalid.length,
    };
  });
}

const results = [];
for (const book of books.filter((item) => selectedSlug === "all" || item.slug === selectedSlug)) {
  const analysisMode = selectedMode === "full" ? "draft" : selectedMode;
  const result = await analyzeSourcePdf({
    sourceFileId: book.sourceFileId,
    context: {
      bookSlug: book.slug,
      title: book.title,
      languageId: book.languageId,
    },
    maxPages,
    analysisMode,
  });
  const draft = result.draft || {};
  const sections = Array.isArray(draft.sections) ? draft.sections : [];
  const sectionValidation = validateSections(sections);
  results.push({
    slug: book.slug,
    mode: selectedMode,
    pageCount: result.pageCount,
    analyzedPages: result.analyzedPages,
    extractableTextPages: result.extractableTextPages,
    aiEnabled: result.aiEnabled,
    title: draft.title || null,
    author: draft.author || null,
    category: draft.category || null,
    languageId: draft.languageId || null,
    printedPageStartPage: draft.printedPageStartPage ?? null,
    tocCount: (result.tocEntries || []).length,
    sections: {
      count: sections.length,
      overlaps: sectionValidation.overlaps.length,
      gaps: sectionValidation.gaps.length,
      invalid: sectionValidation.invalid.length,
      first: sections.slice(0, 3),
      last: sections.slice(-3),
    },
    plans: validatePlans(draft.plans, result.pageCount),
    hasDescription: Boolean(draft.description),
    hasSummary: Boolean(draft.summary),
    hasIntroNote: Boolean(draft.introNote),
    hasTodayTarget: Boolean(draft.todayTarget),
    confidence: draft.confidence || null,
    notes: draft.notes || null,
  });
}

console.log(JSON.stringify(results, null, 2));

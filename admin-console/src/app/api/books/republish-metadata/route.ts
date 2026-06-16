import { NextResponse } from "next/server";

import { republishBookMetadata } from "@/lib/ingestion";

function parseTocEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const title = String(item.title || "").trim();
      if (!title) {
        return null;
      }

      const printedPage = Number(item.printedPage);
      const renderedPage = Number(item.renderedPage);
      const level = Number(item.level);
      return {
        title,
        printedPage: Number.isFinite(printedPage) && printedPage > 0 ? printedPage : null,
        renderedPage: Number.isFinite(renderedPage) && renderedPage > 0 ? renderedPage : null,
        level: Number.isFinite(level) && level > 0 ? Math.floor(level) : 1,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function parsePlans(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((plan, planIndex) => {
    const item = plan as Record<string, unknown>;
    const id = String(item.id || "").trim();
    const title = String(item.title || "").trim();
    const totalDays = Number(item.totalDays);
    const rawItems = Array.isArray(item.items) ? item.items : [];

    if (!id || !title || !Number.isFinite(totalDays) || rawItems.length === 0) {
      throw new Error(`Plan ${planIndex + 1} is invalid.`);
    }

    return {
      id,
      title,
      description: String(item.description || "").trim(),
      totalDays,
      items: rawItems.map((dayItem, itemIndex) => {
        const day = dayItem as Record<string, unknown>;
        const dayNumber = Number(day.day);
        const label = String(day.label || "").trim();
        const startPage = Number(day.startPage);
        const endPage = Number(day.endPage);
        const estimatedMinutes = Number(day.estimatedMinutes);

        if (
          !Number.isFinite(dayNumber) ||
          !label ||
          !Number.isFinite(startPage) ||
          !Number.isFinite(endPage) ||
          !Number.isFinite(estimatedMinutes)
        ) {
          throw new Error(`Plan day ${itemIndex + 1} in ${title} is invalid.`);
        }

        return {
          day: dayNumber,
          label,
          startPage,
          endPage,
          estimatedMinutes,
        };
      }),
    };
  });
}

function parseRecommendations(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const allowedTypes = new Set([
    "same-author",
    "same-topic",
    "same-category",
    "next-reading",
    "foundational",
    "advanced",
  ]);

  const recommendations: {
    bookId: string;
    reason?: string;
    type?: "same-author" | "same-topic" | "same-category" | "next-reading" | "foundational" | "advanced";
    score?: number;
  }[] = [];

  value.forEach((recommendation) => {
    const item = recommendation as Record<string, unknown>;
    const bookId = String(item.bookId || "").trim();
    if (!bookId) {
      return;
    }

    const type = String(item.type || "").trim();
    recommendations.push({
      bookId,
      reason: String(item.reason || "").trim() || undefined,
      type: allowedTypes.has(type)
        ? type as "same-author" | "same-topic" | "same-category" | "next-reading" | "foundational" | "advanced"
        : undefined,
      score: item.score === undefined || item.score === null || item.score === "" ? undefined : Number(item.score),
    });
  });

  return recommendations;
}

function normalizeLanguageId(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function languageTitleFromId(input: string) {
  return normalizeLanguageId(input)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseLanguages(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((language, languageIndex) => {
    const languageItem = language as Record<string, unknown>;
    const languageId = normalizeLanguageId(String(languageItem.languageId || languageItem.id || ""));
    const title = languageTitleFromId(languageId);

    if (!languageId || !title) {
      throw new Error(`Language ${languageIndex + 1} is invalid.`);
    }

    const rawVolumes = Array.isArray(languageItem.volumes) ? languageItem.volumes : [];
    if (rawVolumes.length === 0) {
      throw new Error(`Language ${title} must include at least one volume.`);
    }

    return {
      languageId,
      title,
      nativeTitle: undefined,
      summary: String(languageItem.summary || "").trim() || undefined,
      order:
        languageItem.order === undefined || languageItem.order === null || languageItem.order === ""
          ? undefined
          : Number(languageItem.order),
      defaultVolumeId: String(languageItem.defaultVolumeId || "").trim() || undefined,
      volumes: rawVolumes.map((volume, volumeIndex) => {
        const volumeItem = volume as Record<string, unknown>;
        const volumeId = String(volumeItem.id || "").trim();
        const volumeTitle = String(volumeItem.title || "").trim();

        if (!volumeId || !volumeTitle) {
          throw new Error(`Volume ${volumeIndex + 1} in ${title} is invalid.`);
        }

        return {
          id: volumeId,
          title: volumeTitle,
          subtitle: String(volumeItem.subtitle || "").trim() || undefined,
          order:
            volumeItem.order === undefined || volumeItem.order === null || volumeItem.order === ""
              ? undefined
              : Number(volumeItem.order),
          printedPageStartPage:
            volumeItem.printedPageStartPage === undefined ||
            volumeItem.printedPageStartPage === null ||
            volumeItem.printedPageStartPage === ""
              ? undefined
              : Number(volumeItem.printedPageStartPage),
          manifestUrl: String(volumeItem.manifestUrl || "").trim() || undefined,
          introNote: String(volumeItem.introNote || "").trim() || undefined,
          todayTarget: String(volumeItem.todayTarget || "").trim() || undefined,
          tocEntries: parseTocEntries(volumeItem.tocEntries),
          plans: parsePlans(volumeItem.plans),
        };
      }),
    };
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      bookSlug?: string;
      title?: string;
      subtitle?: string;
      author?: string;
      description?: string;
      category?: string;
      nextRecommendedBookId?: string;
      recommendations?: unknown;
      defaultLanguageId?: string;
      requestedBy?: string;
      languages?: unknown;
    };

    const bookSlug = String(payload.bookSlug || "").trim();
    const title = String(payload.title || "").trim();

    if (!bookSlug || !title) {
      return NextResponse.json(
        { error: "Book slug and title are required." },
        { status: 400 },
      );
    }

    const result = await republishBookMetadata({
      bookSlug,
      title,
      subtitle: String(payload.subtitle || "").trim() || undefined,
      author: String(payload.author || "").trim() || undefined,
      description: String(payload.description || "").trim() || undefined,
      category: String(payload.category || "").trim() || undefined,
      nextRecommendedBookId: String(payload.nextRecommendedBookId || "").trim() || undefined,
      recommendations: parseRecommendations(payload.recommendations),
      defaultLanguageId: normalizeLanguageId(String(payload.defaultLanguageId || "")) || undefined,
      requestedBy: String(payload.requestedBy || "admin-console").trim(),
      languages: parseLanguages(payload.languages),
    });

    return NextResponse.json({
      success: true,
      message: "Published metadata updated.",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { republishBookMetadata } from "@/lib/ingestion";

function parseSections(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((section, index) => {
    const item = section as Record<string, unknown>;
    const id = String(item.id || "").trim();
    const title = String(item.title || "").trim();
    const startPage = Number(item.startPage);
    const endPage = Number(item.endPage);
    const estimatedMinutes = Number(item.estimatedMinutes);

    if (!id || !title || !Number.isFinite(startPage) || !Number.isFinite(endPage) || !Number.isFinite(estimatedMinutes)) {
      throw new Error(`Section ${index + 1} is invalid.`);
    }

    return {
      id,
      title,
      subtitle: String(item.subtitle || "").trim() || undefined,
      kind: String(item.kind || "").trim() || undefined,
      startPage,
      endPage,
      estimatedMinutes,
      description: String(item.description || "").trim() || undefined,
      entryPage: item.entryPage === undefined || item.entryPage === null || item.entryPage === ""
        ? undefined
        : Number(item.entryPage),
      order: item.order === undefined || item.order === null || item.order === ""
        ? undefined
        : Number(item.order),
    };
  });
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

function parseLanguages(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((language, languageIndex) => {
    const languageItem = language as Record<string, unknown>;
    const languageId = String(languageItem.languageId || languageItem.id || "").trim();
    const title = String(languageItem.title || "").trim();

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
      nativeTitle: String(languageItem.nativeTitle || "").trim() || undefined,
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
          manifestUrl: String(volumeItem.manifestUrl || "").trim() || undefined,
          introNote: String(volumeItem.introNote || "").trim() || undefined,
          todayTarget: String(volumeItem.todayTarget || "").trim() || undefined,
          sections: parseSections(volumeItem.sections),
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
      defaultLanguageId: String(payload.defaultLanguageId || "").trim() || undefined,
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

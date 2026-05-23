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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      bookSlug?: string;
      title?: string;
      subtitle?: string;
      author?: string;
      description?: string;
      category?: string;
      requestedBy?: string;
      sections?: unknown;
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
      requestedBy: String(payload.requestedBy || "admin-console").trim(),
      sections: parseSections(payload.sections),
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

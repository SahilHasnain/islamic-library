import { NextResponse } from "next/server";

import { updateBookMetadata, type MetadataEditInput } from "@/lib/ingestion";

type Params = {
  params: Promise<{ bookId: string }>;
};

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request, context: Params) {
  try {
    const { bookId } = await context.params;
    if (!bookId) {
      return NextResponse.json({ error: "Book ID is required." }, { status: 400 });
    }

    const payload = (await request.json()) as Partial<MetadataEditInput>;
    const input: MetadataEditInput = {
      title: readText(payload.title),
      author: readText(payload.author),
      category: readText(payload.category),
    nextRecommendedBookId: readText(payload.nextRecommendedBookId),
    defaultLanguageId: readText(payload.defaultLanguageId),
    recommendations: Array.isArray(payload.recommendations)
      ? payload.recommendations.slice(0, 5).map((recommendation) => ({
          bookId: readText(recommendation?.bookId),
          reason: readText(recommendation?.reason),
          type: readText(recommendation?.type),
          score: typeof recommendation?.score === "number" ? recommendation.score : 0,
        })).filter((recommendation) => recommendation.bookId)
      : [],
    tocLanguageId: readText(payload.tocLanguageId),
    tocVolumeId: readText(payload.tocVolumeId),
    tocEntries: Array.isArray(payload.tocEntries)
      ? payload.tocEntries.map((entry) => ({
          title: readText(entry?.title),
          printedPage: typeof entry?.printedPage === "number" ? entry.printedPage : undefined,
          renderedPage: typeof entry?.renderedPage === "number" ? entry.renderedPage : undefined,
          level: typeof entry?.level === "number" ? entry.level : undefined,
        }))
      : [],
  };

    const book = await updateBookMetadata(bookId, input);
    return NextResponse.json({ ok: true, book });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update metadata.";
    const status = /required|must be|only books/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

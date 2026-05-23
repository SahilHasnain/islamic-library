import { NextResponse } from "next/server";

import { republishBookMetadata } from "@/lib/ingestion";

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

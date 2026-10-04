import { NextResponse } from "next/server";

import { startBookTocAnalysis } from "@/lib/ingestion";

type Params = { params: Promise<{ bookId: string }> };

export async function POST(request: Request, context: Params) {
  try {
    const { bookId } = await context.params;
    const payload = (await request.json()) as { languageId?: string; volumeId?: string };
    if (!payload.languageId || !payload.volumeId) {
      return NextResponse.json({ error: "Language and volume are required." }, { status: 400 });
    }

    return NextResponse.json(
      await startBookTocAnalysis(bookId, payload.languageId, payload.volumeId),
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start AI TOC analysis." },
      { status: 500 },
    );
  }
}

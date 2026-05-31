import { NextResponse } from "next/server";

import { analyzeBookWithAi } from "@/lib/ingestion";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      sourceFileId?: string;
      context?: Record<string, unknown>;
      maxPages?: number;
    };

    const sourceFileId = String(payload.sourceFileId || "").trim();
    if (!sourceFileId) {
      return NextResponse.json({ error: "sourceFileId is required." }, { status: 400 });
    }

    const result = await analyzeBookWithAi({
      sourceFileId,
      context: payload.context || {},
      maxPages: payload.maxPages,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { startBookAiAnalysis } from "@/lib/ingestion";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      sourceFileId?: string;
      context?: Record<string, unknown>;
      maxPages?: number;
      analysisMode?: "draft" | "toc-only" | "metadata-only";
    };

    const sourceFileId = String(payload.sourceFileId || "").trim();
    if (!sourceFileId) {
      return NextResponse.json({ error: "sourceFileId is required." }, { status: 400 });
    }

    const result = await startBookAiAnalysis({
      sourceFileId,
      context: payload.context || {},
      maxPages: payload.maxPages,
      analysisMode: payload.analysisMode,
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analysis start failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

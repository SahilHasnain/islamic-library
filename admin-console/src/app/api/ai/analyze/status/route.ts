import { NextResponse } from "next/server";

import { getBookAiAnalysisStatus } from "@/lib/ingestion";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const analysisId = String(searchParams.get("id") || "").trim();
    if (!analysisId) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const result = await getBookAiAnalysisStatus(analysisId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analysis status failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

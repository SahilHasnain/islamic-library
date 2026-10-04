import { NextResponse } from "next/server";

import { getAiTocAnalysisStatus } from "@/lib/worker-client";

type Params = { params: Promise<{ bookId: string }> };

export async function GET(request: Request, context: Params) {
  try {
    await context.params;
    const analysisId = new URL(request.url).searchParams.get("analysisId");
    if (!analysisId) {
      return NextResponse.json({ error: "Analysis ID is required." }, { status: 400 });
    }

    return NextResponse.json(await getAiTocAnalysisStatus(analysisId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read AI TOC analysis status." },
      { status: 500 },
    );
  }
}

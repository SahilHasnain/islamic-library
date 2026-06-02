import { NextResponse } from "next/server";

import { rerankBookRecommendationsWithAi } from "@/lib/ingestion";
import type { AiRecommendationCandidate } from "@/lib/ingestion";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      currentBook?: Record<string, unknown>;
      candidates?: unknown[];
    };

    if (!payload.currentBook || !Array.isArray(payload.candidates) || payload.candidates.length === 0) {
      return NextResponse.json({ error: "currentBook and candidates are required." }, { status: 400 });
    }

    const result = await rerankBookRecommendationsWithAi({
      currentBook: payload.currentBook,
      candidates: payload.candidates.map((candidate) => candidate as AiRecommendationCandidate),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI recommendation rerank failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

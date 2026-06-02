import { NextResponse } from "next/server";

import {
  clearAiAnalysisDraft,
  loadAiAnalysisDraft,
  saveAiAnalysisDraft,
} from "@/lib/ingestion";
import type { AiAnalysisDraftPayload } from "@/lib/ingestion";

function getRequiredSearchParam(request: Request, key: string) {
  const url = new URL(request.url);
  return String(url.searchParams.get(key) || "").trim();
}

export async function GET(request: Request) {
  try {
    const bookSlug = getRequiredSearchParam(request, "bookSlug");
    const sourceKey = getRequiredSearchParam(request, "sourceKey");
    if (!bookSlug || !sourceKey) {
      return NextResponse.json({ error: "bookSlug and sourceKey are required." }, { status: 400 });
    }

    const draft = await loadAiAnalysisDraft({ bookSlug, sourceKey });
    if (!draft) {
      return NextResponse.json({ ok: true, draft: null });
    }

    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI draft load failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      bookSlug?: string;
      sourceKey?: string;
      sourceFileId?: string;
      savedBy?: string;
      draft?: AiAnalysisDraftPayload;
    };
    const bookSlug = String(payload.bookSlug || "").trim();
    const sourceKey = String(payload.sourceKey || "").trim();
    if (!bookSlug || !sourceKey || !payload.draft) {
      return NextResponse.json({ error: "bookSlug, sourceKey, and draft are required." }, { status: 400 });
    }

    const result = await saveAiAnalysisDraft({
      bookSlug,
      sourceKey,
      sourceFileId: payload.sourceFileId,
      savedBy: payload.savedBy,
      payload: payload.draft,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI draft save failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const bookSlug = getRequiredSearchParam(request, "bookSlug");
    const sourceKey = getRequiredSearchParam(request, "sourceKey");
    if (!bookSlug || !sourceKey) {
      return NextResponse.json({ error: "bookSlug and sourceKey are required." }, { status: 400 });
    }

    const result = await clearAiAnalysisDraft({ bookSlug, sourceKey });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI draft clear failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

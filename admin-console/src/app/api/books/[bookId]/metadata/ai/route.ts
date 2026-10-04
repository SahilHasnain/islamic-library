import { NextResponse } from "next/server";

import { startBookMetadataAnalysis } from "@/lib/ingestion";

type Params = { params: Promise<{ bookId: string }> };

export async function POST(_: Request, context: Params) {
  try {
    const { bookId } = await context.params;
    return NextResponse.json(await startBookMetadataAnalysis(bookId), { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start AI metadata analysis." },
      { status: 500 },
    );
  }
}

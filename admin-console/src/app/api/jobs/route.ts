import { NextResponse } from "next/server";

import { getMonitoringSnapshot } from "@/lib/ingestion";

export async function GET() {
  try {
    const snapshot = await getMonitoringSnapshot(100);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

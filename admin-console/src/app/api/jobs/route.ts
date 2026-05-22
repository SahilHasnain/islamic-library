import { NextResponse } from "next/server";

import { listRecentJobs } from "@/lib/ingestion";

export async function GET() {
  try {
    const jobs = await listRecentJobs(12);
    return NextResponse.json({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

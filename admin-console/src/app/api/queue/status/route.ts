import { getQueueStats } from "@/lib/job-queue";
import { NextResponse } from "next/server";

/**
 * GET /api/queue/status
 * Get the current queue status and statistics
 */
export async function GET() {
  try {
    const stats = await getQueueStats();

    return NextResponse.json({
      success: true,
      ...stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

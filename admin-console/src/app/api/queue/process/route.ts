import { triggerQueueProcessing } from "@/lib/job-queue";
import { NextResponse } from "next/server";

/**
 * POST /api/queue/process
 * Trigger the job queue processor
 */
export async function POST() {
  try {
    const result = await triggerQueueProcessing();

    return NextResponse.json({
      success: true,
      ...result,
      message: result.triggered
        ? "Queue processing started"
        : "Queue processor already running",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

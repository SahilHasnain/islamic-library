import { NextResponse } from "next/server";

import { recoverJob, type RecoveryAction } from "@/lib/ingestion";
import { triggerQueueProcessing } from "@/lib/job-queue";

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: Params) {
  try {
    const { jobId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { action?: RecoveryAction };
    const action = body.action;

    if (action !== "requeue" && action !== "reset-stuck") {
      return NextResponse.json({ error: "Invalid recovery action." }, { status: 400 });
    }

    const result = await recoverJob(jobId, action);

    // Trigger queue processing after requeuing
    triggerQueueProcessing().catch((error) => {
      console.error("Failed to trigger queue processing:", error);
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

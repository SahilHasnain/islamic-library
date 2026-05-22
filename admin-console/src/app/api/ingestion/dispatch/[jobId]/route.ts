import { NextResponse } from "next/server";

import { dispatchJobToWorker, getDispatchPayload } from "@/lib/ingestion";

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, context: Params) {
  try {
    const { jobId } = await context.params;
    const result = await getDispatchPayload(jobId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(_: Request, context: Params) {
  try {
    const { jobId } = await context.params;
    const result = await dispatchJobToWorker(jobId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

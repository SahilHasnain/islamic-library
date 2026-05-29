import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { APPWRITE_IDS, appwriteDatabases } from "@/lib/appwrite";

function requireWorkerEnv(name: "WORKER_API_URL" | "WORKER_API_TOKEN") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required worker environment variable: ${name}`);
  }
  return value;
}

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_: Request, context: Params) {
  try {
    const { jobId } = await context.params;

    const jobsResponse = await appwriteDatabases.listDocuments(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      [Query.equal("jobId", jobId), Query.limit(1)],
    );

    const jobDocument = jobsResponse.documents[0] as
      | ({ $id: string; status?: string; pushStatus?: string; pushAttempts?: number } & Record<
          string,
          unknown
        >)
      | undefined;

    if (!jobDocument) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (jobDocument.status !== "published") {
      return NextResponse.json(
        { error: "Only published jobs can retry push." },
        { status: 409 },
      );
    }

    if (jobDocument.pushStatus !== "failed") {
      return NextResponse.json(
        { error: "Retry push is only available when pushStatus is failed." },
        { status: 409 },
      );
    }

    const workerApiUrl = requireWorkerEnv("WORKER_API_URL");
    const workerApiToken = requireWorkerEnv("WORKER_API_TOKEN");

    const response = await fetch(`${workerApiUrl.replace(/\/$/, "")}/jobs/retry-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerApiToken}`,
      },
      body: JSON.stringify({ jobId }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      pushStatus?: string;
      pushError?: string;
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error || "Worker retry push failed." },
        { status: 500 },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import {
  APPWRITE_IDS,
  appwriteDatabases,
  ID,
} from "@/lib/appwrite";

const ALLOWED_CATEGORIES = [
  "Seerah",
  "Durood",
  "Dua",
  "Akhlaq",
  "Motivation",
  "Other",
] as const;

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function isoNow() {
  return new Date().toISOString();
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      title?: string;
      subtitle?: string;
      author?: string;
      description?: string;
      category?: string;
      languageId?: string;
      volumeId?: string;
      createdBy?: string;
      slug?: string;
      sourceFileId?: string;
    };

    const title = String(payload.title || "").trim();
    const subtitle = String(payload.subtitle || "").trim();
    const author = String(payload.author || "").trim();
    const description = String(payload.description || "").trim();
    const category = String(payload.category || "").trim();
    const languageId = String(payload.languageId || "").trim();
    const volumeId = String(payload.volumeId || "").trim();
    const createdBy = String(payload.createdBy || "admin-console").trim();
    const explicitSlug = String(payload.slug || "").trim();
    const sourceFileId = String(payload.sourceFileId || "").trim();

    if (!title || !languageId || !volumeId) {
      return NextResponse.json(
        { error: "Title, language, and volume are required." },
        { status: 400 },
      );
    }

    if (!sourceFileId) {
      return NextResponse.json({ error: "A source PDF upload is required." }, { status: 400 });
    }

    if (category && !ALLOWED_CATEGORIES.includes(category as (typeof ALLOWED_CATEGORIES)[number])) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }

    const slug = slugify(explicitSlug || title);
    if (!slug) {
      return NextResponse.json({ error: "Could not generate a valid slug." }, { status: 400 });
    }

    const timestamp = isoNow();
    const jobId = `job_${Date.now()}`;

    await appwriteDatabases.createDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.booksCollectionId,
      ID.unique(),
      {
        slug,
        title,
        subtitle: subtitle || undefined,
        author: author || undefined,
        description: description || undefined,
        category: category || undefined,
        languageId,
        volumeId,
        sourceFileId,
        status: "queued",
        createdBy,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    );

    await appwriteDatabases.createDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      ID.unique(),
      {
        jobId,
        bookSlug: slug,
        sourceFileId,
        languageId,
        volumeId,
        status: "queued",
        attempt: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    );

    return NextResponse.json({
      success: true,
      jobId,
      slug,
      sourceFileId,
      message: "PDF uploaded and ingestion job queued.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Could not create ingestion job: ${message}` },
      { status: 500 },
    );
  }
}

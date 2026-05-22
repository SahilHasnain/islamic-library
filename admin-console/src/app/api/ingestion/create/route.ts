import { NextResponse } from "next/server";

import {
  APPWRITE_IDS,
  appwriteDatabases,
  appwriteStorage,
  ID,
  InputFile,
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
    const formData = await request.formData();

    const title = String(formData.get("title") || "").trim();
    const subtitle = String(formData.get("subtitle") || "").trim();
    const author = String(formData.get("author") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const category = String(formData.get("category") || "").trim();
    const languageId = String(formData.get("languageId") || "").trim();
    const volumeId = String(formData.get("volumeId") || "").trim();
    const createdBy = String(formData.get("createdBy") || "admin-console").trim();
    const explicitSlug = String(formData.get("slug") || "").trim();
    const file = formData.get("pdf");

    if (!title || !languageId || !volumeId) {
      return NextResponse.json(
        { error: "Title, language, and volume are required." },
        { status: 400 },
      );
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "A source PDF is required." }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF uploads are supported." }, { status: 400 });
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
    const sourceFileId = ID.unique();
    const buffer = Buffer.from(await file.arrayBuffer());

    await appwriteStorage.createFile(
      APPWRITE_IDS.sourcePdfsBucketId,
      sourceFileId,
      InputFile.fromBuffer(buffer, file.name),
    );

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

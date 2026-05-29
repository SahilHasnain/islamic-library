import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import {
    APPWRITE_IDS,
    appwriteDatabases,
    ID,
} from "@/lib/appwrite";
import { triggerQueueProcessing } from "@/lib/job-queue";

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

    // Required fields
    if (!languageId || !volumeId) {
      return NextResponse.json(
        { error: "Language and volume are required." },
        { status: 400 },
      );
    }

    if (!sourceFileId) {
      return NextResponse.json({ error: "A source PDF upload is required." }, { status: 400 });
    }

    // Determine slug - either explicit or from title
    const slug = explicitSlug ? slugify(explicitSlug) : (title ? slugify(title) : "");
    if (!slug) {
      return NextResponse.json({ error: "Either a book slug or title is required." }, { status: 400 });
    }

    if (category && !ALLOWED_CATEGORIES.includes(category as (typeof ALLOWED_CATEGORIES)[number])) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }

    const timestamp = isoNow();
    const jobId = `job_${Date.now()}`;
    const existingBooks = await appwriteDatabases.listDocuments(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.booksCollectionId,
      [Query.equal("slug", slug), Query.limit(1)],
    );
    const existingBook = existingBooks.documents[0] as unknown as
      | {
          $id: string;
          slug: string;
          defaultLanguageId?: string;
          defaultVolumeId?: string;
        }
      | undefined;

    const existingJobs = await appwriteDatabases.listDocuments(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      [
        Query.equal("bookSlug", slug),
        Query.equal("languageId", languageId),
        Query.equal("volumeId", volumeId),
        Query.limit(1),
      ],
    );

    if (existingJobs.documents.length > 0) {
      return NextResponse.json(
        {
          error:
            "This book already has an ingestion job or published edition for the same language and volume.",
        },
        { status: 409 },
      );
    }

    if (existingBook) {
      // For existing books, only update fields that are provided
      const updateData: Record<string, any> = {
        languageId,
        volumeId,
        sourceFileId,
        defaultLanguageId: existingBook.defaultLanguageId || languageId,
        defaultVolumeId: existingBook.defaultVolumeId || volumeId,
        status: "queued",
        updatedAt: timestamp,
      };

      // Only update metadata fields if they're provided
      if (title) updateData.title = title;
      if (subtitle) updateData.subtitle = subtitle;
      if (author) updateData.author = author;
      if (description) updateData.description = description;
      if (category) updateData.category = category;

      await appwriteDatabases.updateDocument(
        APPWRITE_IDS.databaseId,
        APPWRITE_IDS.booksCollectionId,
        existingBook.$id,
        updateData,
      );
    } else {
      // For new books, title is required
      if (!title) {
        return NextResponse.json(
          { error: "Title is required when creating a new book." },
          { status: 400 },
        );
      }

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
          defaultLanguageId: languageId,
          defaultVolumeId: volumeId,
          sourceFileId,
          status: "queued",
          createdBy,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      );
    }

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

    // Trigger queue processing in the background
    triggerQueueProcessing().catch((error) => {
      console.error("Failed to trigger queue processing:", error);
    });

    return NextResponse.json({
      success: true,
      jobId,
      slug,
      sourceFileId,
      mode: existingBook ? "attached" : "created",
      message: existingBook
        ? "Edition upload attached to the existing book and queued for ingestion."
        : "PDF uploaded and ingestion job queued.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Could not create ingestion job: ${message}` },
      { status: 500 },
    );
  }
}

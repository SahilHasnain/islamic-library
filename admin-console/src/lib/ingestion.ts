import "server-only";

import { Query } from "node-appwrite";

import { APPWRITE_IDS, appwriteDatabases } from "@/lib/appwrite";
import {
  describeWorkerFailure,
  startAiTocAnalysis,
  startAiMetadataAnalysis,
  postMetadataRepublish,
  postIngestJob,
  recordUnreachableDispatchFailure,
  resolveDispatchToken,
  WorkerUnreachableError,
  type WorkerIngestResult,
} from "@/lib/worker-client";

export type JobStatus =
  | "draft"
  | "queued"
  | "processing"
  | "validating"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled"
  | "retrying";

export type BookStatus =
  | "draft"
  | "queued"
  | "processing"
  | "published"
  | "failed"
  | "archived";

export type BookRecord = {
  $id: string;
  slug: string;
  canonicalBookSlug?: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  publishedVersion?: string;
  metadataUrl?: string;
  manifestUrl?: string;
  nextRecommendedBookId?: string;
  recommendations?: Array<{
    bookId: string;
    reason?: string;
    type?: string;
    score?: number;
  }>;
  languageId: string;
  volumeId: string;
  defaultLanguageId?: string;
  defaultVolumeId?: string;
  sourceFileId: string;
  status: BookStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type JobRecord = {
  $id: string;
  jobId: string;
  bookSlug: string;
  sourceFileId: string;
  languageId: string;
  volumeId: string;
  printedPageStartPage?: number;
  status: JobStatus;
  attempt: number;
  workerDispatchToken?: string;
  workerId?: string;
  workerVersion?: string;
  errorCode?: string;
  errorMessage?: string;
  outputVersion?: string;
  pageCount?: number;
  pushStatus?: "pending" | "succeeded" | "failed" | "skipped";
  pushError?: string;
  pushAttempts?: number;
  lastPushAttempt?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkerJobPayload = {
  jobId: string;
  bookSlug: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  nextRecommendedBookId?: string;
  languageId: string;
  volumeId: string;
  printedPageStartPage?: number;
  sourceFileId: string;
  requestedBy: string;
  publishMode: "public";
  dispatchToken?: string;
};

export type PublishEventRecord = {
  $id: string;
  jobId: string;
  bookSlug: string;
  status: string;
  commitSha?: string;
  catalogUrl?: string;
  metadataUrl?: string;
  manifestUrl?: string;
  createdAt: string;
};

export type JobListItem = {
  job: JobRecord;
  book?: BookRecord;
};

export type MonitoringSummary = {
  totalJobs: number;
  queuedJobs: number;
  activeJobs: number;
  failedJobs: number;
  publishedJobs: number;
  totalBooks: number;
  publishedBooks: number;
  latestPublishedAt?: string;
};

export type MonitoringSnapshot = {
  jobs: JobListItem[];
  events: PublishEventRecord[];
  books: BookRecord[];
  summary: MonitoringSummary;
};

export type MetadataEditInput = {
  title: string;
  description: string;
  author: string;
  category: string;
  nextRecommendedBookId: string;
  defaultLanguageId: string;
  recommendations: Array<{
    bookId: string;
    reason: string;
    type: string;
    score: number;
  }>;
  tocLanguageId: string;
  tocVolumeId: string;
  tocEntries: Array<{
    title: string;
    printedPage?: number;
    renderedPage?: number;
    level?: number;
  }>;
};

export type RecoveryAction = "requeue" | "reset-stuck";

export async function listRecentJobs(limit = 10) {
  const jobsResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    [Query.orderDesc("$createdAt"), Query.limit(limit)],
  );

  const booksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.limit(100)],
  );

  const booksBySlug = new Map(
    booksResponse.documents.map((book) => [book.slug, book as unknown as BookRecord]),
  );

  return jobsResponse.documents.map((job) => {
    const typedJob = job as unknown as JobRecord;
    return {
      job: typedJob,
      book: booksBySlug.get(typedJob.bookSlug),
    };
  });
}

export async function listRecentPublishEvents(limit = 8) {
  const response = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.publishEventsCollectionId,
    [Query.orderDesc("$createdAt"), Query.limit(limit)],
  );

  return response.documents as unknown as PublishEventRecord[];
}

export async function getMonitoringSnapshot(limit = 12): Promise<MonitoringSnapshot> {
  const [jobs, events, booksResponse, jobsResponse] = await Promise.all([
    listRecentJobs(limit),
    listRecentPublishEvents(8),
    appwriteDatabases.listDocuments(APPWRITE_IDS.databaseId, APPWRITE_IDS.booksCollectionId, [
      Query.limit(100),
    ]),
    appwriteDatabases.listDocuments(APPWRITE_IDS.databaseId, APPWRITE_IDS.jobsCollectionId, [
      Query.limit(100),
    ]),
  ]);

  const allJobs = jobsResponse.documents as unknown as JobRecord[];
  const allBooks = booksResponse.documents as unknown as BookRecord[];
  const latestPublishedAt = events.find((event) => event.status === "published")?.createdAt;

  return {
    jobs,
    events,
    books: allBooks,
    summary: {
      totalJobs: allJobs.length,
      queuedJobs: allJobs.filter((job) => job.status === "queued" || job.status === "retrying")
        .length,
      activeJobs: allJobs.filter((job) =>
        job.status === "processing" ||
        job.status === "validating" ||
        job.status === "publishing"
      ).length,
      failedJobs: allJobs.filter((job) => job.status === "failed").length,
      publishedJobs: allJobs.filter((job) => job.status === "published").length,
      totalBooks: allBooks.length,
      publishedBooks: allBooks.filter((book) => book.status === "published").length,
      latestPublishedAt,
    },
  };
}

export async function updateBookMetadata(bookId: string, input: MetadataEditInput) {
  const book = (await appwriteDatabases.getDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    bookId,
  )) as unknown as BookRecord;

  // A book can have several edition records (language/volume combinations), but the
  // public catalog has one shared top-level metadata record per slug. Resolve all sibling
  // records now so the Appwrite book documents cannot drift after a bulk metadata edit.
  const siblingBooksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.limit(5000)],
  );
  const logicalBookKey = book.canonicalBookSlug || book.slug;
  const siblingBooks = (siblingBooksResponse.documents as unknown as BookRecord[]).filter(
    (siblingBook) => (siblingBook.canonicalBookSlug || siblingBook.slug) === logicalBookKey,
  );
  const canonicalBook = siblingBooks.find((siblingBook) => siblingBook.slug === logicalBookKey) || book;
  if (!canonicalBook.slug || !canonicalBook.metadataUrl) {
    throw new Error("Only books that have been published can be edited.");
  }

  const title = input.title.trim();
  if (!title) {
    throw new Error("Title is required.");
  }

  if (title.length > 255 || input.author.length > 255) {
    throw new Error("Title and author must be 255 characters or fewer.");
  }

  if (input.description.length > 5000) {
    throw new Error("About text must be 5000 characters or fewer.");
  }

  if (input.category.length > 120) {
    throw new Error("Category must be 120 characters or fewer.");
  }

  if (input.nextRecommendedBookId.length > 128) {
    throw new Error("Recommended book ID must be 128 characters or fewer.");
  }

  if (!input.tocLanguageId || !input.tocVolumeId) {
    throw new Error("A TOC language and volume are required.");
  }

  if (input.tocEntries.length > 1000) {
    throw new Error("A table of contents cannot contain more than 1000 entries.");
  }

  for (const entry of input.tocEntries) {
    if (!entry.title.trim() || entry.title.length > 255) {
      throw new Error("Each TOC entry needs a title of 255 characters or fewer.");
    }
  }

  const metadataResponse = await fetch(canonicalBook.metadataUrl, { cache: "no-store" });
  if (!metadataResponse.ok) {
    throw new Error(`Could not load current public metadata (${metadataResponse.status}).`);
  }

  const currentMetadata = (await metadataResponse.json()) as {
    languages?: Array<{
      id: string;
      summary?: string;
      order?: number;
      defaultVolumeId?: string;
      volumes?: Array<{
        id: string;
        title?: string;
        subtitle?: string;
        manifestUrl?: string;
        order?: number;
        printedPageStartPage?: number;
        introNote?: string;
        todayTarget?: string;
        tocEntries?: MetadataEditInput["tocEntries"];
      }>;
    }>;
  };

  const targetLanguageId = input.tocLanguageId.trim().toLowerCase();
  const targetVolumeId = input.tocVolumeId.trim();
  const languages = (currentMetadata.languages || []).map((language) => ({
    languageId: language.id,
    summary: language.summary,
    order: language.order,
    defaultVolumeId: language.defaultVolumeId,
    volumes: (language.volumes || []).map((volume) => ({
      id: volume.id,
      title: volume.title,
      subtitle: volume.subtitle,
      manifestUrl: volume.manifestUrl,
      order: volume.order,
      printedPageStartPage: volume.printedPageStartPage,
      introNote: volume.introNote,
      todayTarget: volume.todayTarget,
      tocEntries:
        language.id.toLowerCase() === targetLanguageId && volume.id === targetVolumeId
          ? input.tocEntries
          : volume.tocEntries,
    })),
  }));

  const targetLanguage = languages.find((language) => language.languageId.toLowerCase() === targetLanguageId);
  if (!targetLanguage || !targetLanguage.volumes.some((volume) => volume.id === targetVolumeId)) {
    throw new Error("The selected TOC language and volume were not found in public metadata.");
  }

  const result = await postMetadataRepublish({
    bookSlug: canonicalBook.slug,
    title,
    subtitle: canonicalBook.subtitle || "",
    author: input.author.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    nextRecommendedBookId: input.nextRecommendedBookId.trim(),
    recommendations: input.recommendations,
    defaultLanguageId: input.defaultLanguageId.trim(),
    languageId: canonicalBook.languageId,
    volumeId: canonicalBook.volumeId,
    requestedBy: "admin-console",
    languages,
  });

  const updatedAt = new Date().toISOString();
  await Promise.all(
    siblingBooks.map((siblingBook) =>
      appwriteDatabases.updateDocument(
        APPWRITE_IDS.databaseId,
        APPWRITE_IDS.booksCollectionId,
        siblingBook.$id,
        {
          title,
          subtitle: siblingBook.subtitle || "",
          author: input.author.trim(),
          description: input.description.trim(),
          category: input.category.trim(),
          nextRecommendedBookId: input.nextRecommendedBookId.trim(),
          recommendations: input.recommendations,
          defaultLanguageId: input.defaultLanguageId.trim() || siblingBook.defaultLanguageId || "",
          metadataUrl: result.metadataUrl || siblingBook.metadataUrl,
          manifestUrl: result.manifestUrl || siblingBook.manifestUrl,
          publishedVersion: result.outputVersion || siblingBook.publishedVersion,
          updatedAt,
        },
      ),
    ),
  );

  return {
    ...book,
    title,
    description: input.description.trim(),
    author: input.author.trim(),
    category: input.category.trim(),
    nextRecommendedBookId: input.nextRecommendedBookId.trim(),
    recommendations: input.recommendations,
    defaultLanguageId: input.defaultLanguageId.trim(),
    metadataUrl: result.metadataUrl || book.metadataUrl,
    manifestUrl: result.manifestUrl || book.manifestUrl,
    publishedVersion: result.outputVersion || book.publishedVersion,
    updatedAt,
  } satisfies BookRecord;
}

export async function startBookTocAnalysis(
  bookId: string,
  languageId: string,
  volumeId: string,
) {
  const book = (await appwriteDatabases.getDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    bookId,
  )) as unknown as BookRecord;

  const siblingBooksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.limit(5000)],
  );
  const logicalBookKey = book.canonicalBookSlug || book.slug;
  const edition = (siblingBooksResponse.documents as unknown as BookRecord[]).find(
    (candidate) =>
      (candidate.canonicalBookSlug || candidate.slug) === logicalBookKey &&
      candidate.languageId.toLowerCase() === languageId.toLowerCase() &&
      candidate.volumeId === volumeId,
  );

  // Edition source files are normally owned by ingestion_jobs rather than duplicated
  // onto every books document. Prefer the latest matching ingestion job, then fall back
  // to the legacy book-level sourceFileId field.
  const jobsResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    [Query.limit(5000)],
  );
  const job = (jobsResponse.documents as unknown as JobRecord[])
    .filter(
      (candidate) =>
        (candidate.bookSlug === book.slug || candidate.bookSlug === logicalBookKey) &&
        candidate.languageId.toLowerCase() === languageId.toLowerCase() &&
        candidate.volumeId === volumeId &&
        candidate.sourceFileId,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const sourceFileId = job?.sourceFileId || edition?.sourceFileId || book.sourceFileId;

  if (!sourceFileId) {
    throw new Error("No source PDF was found for the selected language and volume.");
  }

  return startAiTocAnalysis({
    sourceFileId,
    context: {
      title: book.title,
      languageId,
      volumeId,
      bookSlug: book.slug,
    },
  });
}

export async function startBookMetadataAnalysis(bookId: string) {
  const book = (await appwriteDatabases.getDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    bookId,
  )) as unknown as BookRecord;
  const booksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.limit(5000)],
  );
  const jobsResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    [Query.limit(5000)],
  );
  const logicalBookKey = book.canonicalBookSlug || book.slug;
  const sourceJob = (jobsResponse.documents as unknown as JobRecord[])
    .filter((candidate) => candidate.bookSlug === book.slug && candidate.sourceFileId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const sourceFileId = sourceJob?.sourceFileId || book.sourceFileId;
  if (!sourceFileId) {
    throw new Error("No source PDF was found for this book.");
  }

  const candidateBooks = (booksResponse.documents as unknown as BookRecord[])
    .filter((candidate) => (candidate.canonicalBookSlug || candidate.slug) !== logicalBookKey)
    .slice(0, 50)
    .map((candidate) => ({
      bookId: candidate.slug,
      title: candidate.title,
      author: candidate.author || "",
      category: candidate.category || "",
      description: candidate.description || "",
    }));

  return startAiMetadataAnalysis({
    sourceFileId,
    context: {
      title: book.title,
      languageId: book.languageId,
      volumeId: book.volumeId,
      bookSlug: book.slug,
      candidateBooks,
    },
  });
}

export async function getDispatchPayload(jobId: string) {
  const jobsResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    [Query.equal("jobId", jobId), Query.limit(1)],
  );

  const job = jobsResponse.documents[0] as unknown as JobRecord | undefined;
  if (!job) {
    throw new Error("Job not found.");
  }

  const booksResponse = await appwriteDatabases.listDocuments(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    [Query.equal("slug", job.bookSlug), Query.limit(1)],
  );

  const book = booksResponse.documents[0] as unknown as BookRecord | undefined;
  if (!book) {
    throw new Error("Book not found for job.");
  }

  const payload: WorkerJobPayload = {
    jobId: job.jobId,
    bookSlug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    description: book.description,
    category: book.category,
    nextRecommendedBookId: book.nextRecommendedBookId,
    languageId: job.languageId,
    volumeId: job.volumeId,
    sourceFileId: job.sourceFileId,
    requestedBy: book.createdBy,
    publishMode: "public",
  };

  return { job, book, payload };
}

async function getJobAndBook(jobId: string) {
  const { job, book } = await getDispatchPayload(jobId);
  return { job, book };
}

export async function recoverJob(jobId: string, action: RecoveryAction) {
  const { job, book } = await getJobAndBook(jobId);
  const now = new Date().toISOString();

  if (action === "requeue") {
    if (!["failed", "retrying", "queued"].includes(job.status)) {
      throw new Error("Only failed, retrying, or queued jobs can be requeued.");
    }

    await appwriteDatabases.updateDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.jobsCollectionId,
      job.$id,
      {
        status: "queued",
        updatedAt: now,
        startedAt: "",
        finishedAt: "",
        errorCode: "",
        errorMessage: "",
        workerId: "",
        workerVersion: "",
        // An explicit operator requeue is a deliberate new attempt. Without this reset a
        // job that exhausted its attempts can never be recovered after a transient outage.
        attempt: 0,
      },
    );

    await appwriteDatabases.updateDocument(
      APPWRITE_IDS.databaseId,
      APPWRITE_IDS.booksCollectionId,
      book.$id,
      {
        status: "queued",
        updatedAt: now,
      },
    );

    return { ok: true, action, nextStatus: "queued" as const };
  }

  if (!["processing", "validating", "publishing"].includes(job.status)) {
    throw new Error("Only in-flight jobs can be reset as stuck.");
  }

  await appwriteDatabases.updateDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    job.$id,
    {
      status: "queued",
      updatedAt: now,
      startedAt: "",
      finishedAt: "",
      errorCode: "OPERATOR_RESET",
      errorMessage: "Job was reset to queued by an operator after getting stuck.",
      workerId: "",
      workerVersion: "",
      attempt: 0,
    },
  );

  await appwriteDatabases.updateDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.booksCollectionId,
    book.$id,
    {
      status: "queued",
      updatedAt: now,
    },
  );

  return { ok: true, action, nextStatus: "queued" as const };
}

export async function dispatchJobToWorker(jobId: string) {
  const { job, payload } = await getDispatchPayload(jobId);
  const now = new Date().toISOString();

  // Reuse the job's existing token so retries are accepted by the worker's idempotency
  // lock. Minting a new one per attempt keeps the 409 guard unreachable.
  const dispatchToken = resolveDispatchToken(job);

  await appwriteDatabases.updateDocument(
    APPWRITE_IDS.databaseId,
    APPWRITE_IDS.jobsCollectionId,
    job.$id,
    {
      status: "processing",
      workerId: "vps-worker",
      workerVersion: "v1",
      workerDispatchToken: dispatchToken,
      startedAt: now,
      updatedAt: now,
      errorCode: "",
      errorMessage: "",
    },
  );

  const dispatchStartedAt = Date.now();
  let result: WorkerIngestResult;
  try {
    result = await postIngestJob(payload, dispatchToken);
  } catch (error) {
    if (error instanceof WorkerUnreachableError) {
      await recordUnreachableDispatchFailure(job, error, { dispatchStartedAt });
    }
    throw error;
  }

  if (!result.ok) {
    // The worker already wrote the authoritative status/attempt before responding.
    // Overwriting it here (e.g. forcing "queued") is what caused unbounded retry loops.
    throw new Error(`Worker dispatch failed: ${describeWorkerFailure(result)}`);
  }

  return {
    dispatched: true,
    payload,
    workerResponse: result.error ?? safeParseJson(result.rawBody) ?? {},
  };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

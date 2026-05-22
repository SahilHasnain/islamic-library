export const APPWRITE_IDS = {
  databaseId: "library_ingestion",
  booksCollectionId: "books",
  jobsCollectionId: "ingestion_jobs",
  publishEventsCollectionId: "publish_events",
  sourcePdfsBucketId: "source_pdfs",
  generatedPreviewsBucketId: "generated_previews",
  workerLogsBucketId: "worker_logs",
};

export const JOB_STATUS_VALUES = [
  "draft",
  "queued",
  "processing",
  "validating",
  "publishing",
  "published",
  "failed",
  "cancelled",
  "retrying",
];

export const BOOK_STATUS_VALUES = [
  "draft",
  "queued",
  "processing",
  "published",
  "failed",
  "archived",
];

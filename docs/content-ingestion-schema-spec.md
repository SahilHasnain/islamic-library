# Content Ingestion Schema Spec

## Purpose

This document defines the exact schema layer for the ingestion pipeline.

It covers:

- Appwrite collections
- Appwrite bucket names
- GitHub repository layout
- public delivery URL rules
- worker request/response payloads
- catalog, metadata, and manifest schemas

This document should be read together with:

- [content-ingestion-spec.md](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/docs/content-ingestion-spec.md)

## Appwrite Schema Definitions

### Database

Recommended Appwrite database:

- `library_ingestion`

### Collections

Recommended collections:

1. `books`
2. `ingestion_jobs`
3. `publish_events`

### Collection: `books`

Purpose:

- canonical internal metadata for each book
- admin-side state
- reference to current published version

Recommended fields:

```ts
type BookRecord = {
  slug: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  languageId: string;
  volumeId: string;
  sourceFileId: string;
  coverFileId?: string;
  status: "draft" | "queued" | "processing" | "published" | "failed" | "archived";
  publishedVersion?: string;
  manifestUrl?: string;
  metadataUrl?: string;
  totalPages?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

Notes:

- `slug` must be globally unique
- `status` is the admin/control-plane state
- public frontend should not read directly from this collection

### Collection: `ingestion_jobs`

Purpose:

- track every processing attempt
- preserve job history
- support retry/debugging

Recommended fields:

```ts
type IngestionJobRecord = {
  jobId: string;
  bookSlug: string;
  sourceFileId: string;
  languageId: string;
  volumeId: string;
  status:
    | "draft"
    | "queued"
    | "processing"
    | "validating"
    | "publishing"
    | "published"
    | "failed"
    | "cancelled"
    | "retrying";
  attempt: number;
  workerId?: string;
  workerVersion?: string;
  errorCode?: string;
  errorMessage?: string;
  outputVersion?: string;
  pageCount?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

Notes:

- keep this append-oriented
- do not overwrite history destructively

### Collection: `publish_events`

Purpose:

- audit public publishing operations
- record what changed in the public catalog

Recommended fields:

```ts
type PublishEventRecord = {
  publishId: string;
  bookSlug: string;
  version: string;
  gitCommitSha?: string;
  catalogPath: string;
  metadataPath: string;
  manifestPath: string;
  assetBasePath: string;
  publishedAt: string;
  triggeredBy: string;
}
```

This collection is optional for V1, but useful.

## Appwrite Bucket Definitions

Recommended buckets:

1. `source-pdfs`
2. `generated-previews`
3. `worker-logs`

### Bucket: `source-pdfs`

Purpose:

- admin-uploaded source PDF files

Recommended path convention:

```text
<bookSlug>/<languageId>/<volumeId>/source.pdf
```

Example:

```text
light-of-the-prophet/english/volume1/source.pdf
```

### Bucket: `generated-previews`

Purpose:

- optional temporary preview artifacts
- admin-only QA outputs before public publish

Recommended path convention:

```text
<jobId>/preview/
```

This is optional for V1.

### Bucket: `worker-logs`

Purpose:

- store structured worker outputs/log bundles if needed

Recommended path convention:

```text
<jobId>/logs.json
<jobId>/summary.txt
```

This is optional but useful for debugging failed conversions.

## GitHub Repository Layout

Recommended repo purpose:

- public published assets only

Suggested repo name:

- `islamic-library-assets`

### Root Layout

```text
catalog.json
books/
  <bookSlug>/
    metadata.json
    cover.webp
    <languageId>/
      <volumeId>/
        manifest.json
        page-001.webp
        page-002.webp
```

### Required Files

`catalog.json`

- top-level public catalog used by app

`books/<bookSlug>/metadata.json`

- public metadata for a single book

`books/<bookSlug>/<languageId>/<volumeId>/manifest.json`

- page asset manifest for one language/volume

`books/<bookSlug>/<languageId>/<volumeId>/page-001.webp`

- page image files

### Example Layout

```text
catalog.json
books/
  light-of-the-prophet/
    metadata.json
    cover.webp
    english/
      volume1/
        manifest.json
        page-001.webp
        page-002.webp
    urdu/
      volume1/
        manifest.json
        page-001.webp
        page-002.webp
```

## Public Delivery URL Rules

Recommended jsDelivr pattern:

```text
https://cdn.jsdelivr.net/gh/<github-user>/<repo>@main/catalog.json
https://cdn.jsdelivr.net/gh/<github-user>/<repo>@main/books/<bookSlug>/metadata.json
https://cdn.jsdelivr.net/gh/<github-user>/<repo>@main/books/<bookSlug>/<languageId>/<volumeId>/manifest.json
```

## Worker Contract

The worker should expose a narrow API contract.

Recommended:

- Appwrite triggers worker via HTTP
- or worker polls Appwrite for `queued` jobs

Either way, the job payload must be explicit.

### Worker Input Payload

```json
{
  "jobId": "job_2026_05_22_001",
  "bookSlug": "light-of-the-prophet",
  "title": "Light of the Prophet",
  "subtitle": "A gentle seerah reading journey",
  "author": "Editorial Edition",
  "description": "A reflective seerah-style reading experience...",
  "category": "Seerah",
  "languageId": "english",
  "volumeId": "volume1",
  "sourceFileId": "682f4d_source_pdf",
  "sourceFileName": "light-of-the-prophet.pdf",
  "requestedBy": "admin_user_id",
  "publishMode": "public"
}
```

### Worker Success Response

```json
{
  "jobId": "job_2026_05_22_001",
  "status": "published",
  "bookSlug": "light-of-the-prophet",
  "version": "2026-05-22-1",
  "pageCount": 96,
  "catalogPath": "catalog.json",
  "metadataPath": "books/light-of-the-prophet/metadata.json",
  "manifestPath": "books/light-of-the-prophet/english/volume1/manifest.json",
  "assetBasePath": "books/light-of-the-prophet/english/volume1/",
  "gitCommitSha": "abc123def456"
}
```

### Worker Failure Response

```json
{
  "jobId": "job_2026_05_22_001",
  "status": "failed",
  "errorCode": "PDF_CONVERSION_FAILED",
  "errorMessage": "Could not rasterize page 17",
  "retryable": true
}
```

## Internal Worker Output Structure

Recommended temp workspace:

```text
/tmp/<jobId>/
  source.pdf
  metadata.json
  manifest.json
  cover.webp
  pages/
    page-001.webp
    page-002.webp
```

Worker should publish only after this workspace passes validation.

## Catalog JSON Schema

Recommended public schema:

```ts
type PublicCatalog = {
  version: string;
  generatedAt: string;
  books: {
    id: string;
    title: string;
    subtitle?: string;
    author?: string;
    category?: string;
    coverImage?: string;
    status: "published";
    metadataUrl: string;
  }[];
}
```

Rules:

- only `published` books appear here
- frontend discovers books from this file

## Metadata JSON Schema

Recommended public schema:

```ts
type PublicBookMetadata = {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  coverImage?: string;
  languages: {
    id: string;
    title: string;
    nativeTitle?: string;
    volumes: {
      id: string;
      title: string;
      manifestUrl: string;
    }[];
  }[];
}
```

## Manifest JSON Schema

Recommended public schema:

```ts
type PublicVolumeManifest = {
  bookId: string;
  languageId: string;
  volumeId: string;
  version: string;
  totalPages: number;
  baseUrl: string;
  filePattern: string;
  extension: "webp";
  coverImage?: string;
}
```

## Publish Rules

Worker must update files in this order:

1. page assets
2. manifest
3. metadata
4. catalog

The last step is the public visibility switch.

## Admin UX Expectations

From the admin side, these states should be visible:

- uploaded
- queued
- processing
- validating
- publishing
- published
- failed

Admin should also see:

- page count
- last error if failed
- current published version
- retry action

## V1 Concrete Decision

For V1, implement exactly this:

- Appwrite database: `library_ingestion`
- collections: `books`, `ingestion_jobs`
- bucket: `source-pdfs`
- optional bucket later: `worker-logs`
- public repo layout under `catalog.json` and `books/`
- worker payloads as defined above

That is enough to build the full pipeline without unnecessary complexity.

# Content Ingestion And Publishing Spec

## Purpose

This document defines how new books enter the system and become visible in the app.

The goal is:

- upload only the source PDF
- convert and publish assets under the hood
- expose books to users only when fully ready
- keep the app stable even when processing fails

This is the contract between:

- Appwrite
- VPS worker
- GitHub asset repository
- jsDelivr delivery
- frontend app

## High-Level Architecture

Recommended pipeline:

1. Admin uploads source PDF to Appwrite
2. Appwrite creates ingestion job record
3. VPS worker picks up the job
4. Worker converts PDF to page images
5. Worker generates manifest and metadata output
6. Worker pushes assets and metadata to GitHub
7. Catalog is served from raw GitHub
8. Metadata, manifests, covers, and page assets are served through jsDelivr
9. App reads only published catalog entries

## Core Principle

The app must never read partially processed content.

Books should become visible only after:

- PDF conversion succeeds
- manifest is valid
- metadata is valid
- assets are published
- job is marked published

## Components

### 1. Appwrite

Use Appwrite for:

- admin upload entrypoint
- source PDF storage
- ingestion job records
- publishing status
- optional scheduled retries
- optional webhook trigger to VPS

Appwrite should be the control plane, not the heavy processing engine.

### 2. VPS Worker

Use the VPS worker for:

- PDF conversion
- image optimization
- manifest generation
- metadata generation support
- validation
- GitHub publishing
- status updates back to Appwrite

The worker is the execution plane.

### 3. GitHub Asset Repository

Use the GitHub repo for:

- generated page images
- per-book manifests
- public book metadata snapshots
- public library catalog

This repo becomes the static published output.

### 4. Delivery URLs

Use `raw.githubusercontent.com` for:

- `catalog.json`

Use jsDelivr as the delivery layer for:

- page images
- manifests
- book metadata JSON
- covers if needed

## Source Of Truth

At different stages, different systems are authoritative.

Before publish:

- Appwrite is source of truth for source file and job state

After publish:

- GitHub repo contents are source of truth for public assets
- frontend consumes `catalog.json` from raw GitHub
- frontend consumes metadata/manifests/page assets via jsDelivr

## Workflow

### Step 1: Upload Source PDF

Admin uploads:

- PDF file
- book title
- slug
- language
- optional author
- optional subtitle
- optional category

PDF is stored in Appwrite Storage.

### Step 2: Create Job

Appwrite creates a job record with status:

- `draft`
- then `queued`

The job record should reference:

- source file id
- book slug
- language id
- requested metadata
- created by
- created at

### Step 3: Worker Starts Processing

The worker receives the job and marks it:

- `processing`

The worker downloads the PDF from Appwrite and works in a temp directory.

### Step 4: Convert PDF

Worker generates:

- page images like `page-001.webp`
- optional cover image
- optional thumbnail

Worker should also:

- enforce zero-padded naming
- standardize format and quality
- validate total page count

### Step 5: Generate Manifest And Metadata

Worker generates:

- book manifest
- volume manifest
- catalog entry

### Step 6: Validate Output

Worker validates:

- page count matches manifest
- all expected page files exist
- metadata schema is valid
- manifest URLs/path patterns are valid

If validation fails:

- job becomes `failed`
- published catalog remains unchanged

### Step 7: Publish

Worker publishes generated output to GitHub repo.

Recommended publish order:

1. upload page assets
2. upload manifest
3. update catalog entry
4. update master catalog

Only after all succeed:

- mark Appwrite job as `published`

### Step 8: Frontend Consumption

Frontend fetches:

- master catalog
- selected book metadata
- selected manifest

Only books in public catalog are shown.

## Job States

Use explicit job statuses:

- `draft`
- `queued`
- `processing`
- `validating`
- `publishing`
- `published`
- `failed`
- `cancelled`

Optional:

- `retrying`

## Reliability Rule

The app must display only `published` books.

Never expose:

- `queued`
- `processing`
- `validating`
- `publishing`

This avoids partially visible books.

## Catalog Design

The app should fetch a single public catalog JSON.

Example:

```json
{
  "version": "2026-05-22-1",
  "books": [
    {
      "id": "light-of-the-prophet",
      "title": "Light of the Prophet",
      "subtitle": "A gentle seerah reading journey",
      "author": "Editorial Edition",
      "category": "Seerah",
      "status": "published",
      "coverImage": "https://cdn.jsdelivr.net/gh/.../covers/light-of-the-prophet.webp",
      "metadataUrl": "https://cdn.jsdelivr.net/gh/.../books/light-of-the-prophet/metadata.json"
    }
  ]
}
```

The frontend should rely on this catalog, not hardcoded book lists.

Recommended catalog origin:

- `https://raw.githubusercontent.com/<github-user>/<repo>/main/catalog.json`

## Book Metadata Design

Example:

```json
{
  "id": "light-of-the-prophet",
  "title": "Light of the Prophet",
  "subtitle": "A gentle seerah reading journey",
  "author": "Editorial Edition",
  "description": "A reflective seerah-style reading experience...",
  "category": "Seerah",
  "languages": [
    {
      "id": "english",
      "title": "English",
      "volumes": [
        {
          "id": "volume1",
          "title": "Volume 1",
          "manifestUrl": "https://cdn.jsdelivr.net/gh/.../books/light-of-the-prophet/english/volume1/manifest.json"
        }
      ]
    }
  ]
}
```

## Manifest Design

Example:

```json
{
  "bookId": "light-of-the-prophet",
  "languageId": "english",
  "volumeId": "volume1",
  "version": "2026-05-22-1",
  "totalPages": 96,
  "baseUrl": "https://cdn.jsdelivr.net/gh/<user>/<repo>@main/books/light-of-the-prophet/english/volume1",
  "filePattern": "page-{page}.webp",
  "extension": "webp"
}
```

## GitHub Repo Structure

Recommended structure:

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
```

## Appwrite Storage Structure

Recommended source storage:

```text
source-pdfs/
  light-of-the-prophet/
    english/
      source.pdf
```

This is private/internal storage, not the public asset source.

## Worker Contract

Worker input:

- job id
- source file id
- book slug
- language id
- metadata fields

Worker output:

- generated page assets
- manifest file
- metadata file
- publish result
- logs

Worker must be idempotent:

- rerunning the same job should not corrupt published output

## Validation Rules

Minimum validations:

- file exists for every expected page
- page count matches manifest
- slugs are normalized
- manifest JSON is valid
- metadata JSON is valid
- catalog update preserves schema

## Failure Rules

If conversion fails:

- mark job `failed`
- do not publish anything new

If publishing fails after conversion:

- mark job `failed`
- do not update public catalog
- keep generated temp output only for debugging if desired

If catalog update fails:

- do not expose book publicly

## Retry Rules

Allowed retries:

- transient Appwrite download failure
- transient GitHub push failure
- transient network failure

Do not auto-retry forever.

Recommended:

- max 3 retries
- exponential backoff

## Publish Safety

Use this safety rule:

`catalog update is the final visibility switch`

That means assets can exist in GitHub before users see them, but until `catalog.json` includes the book, the app should not render it.

This is the most important reliability rule in the whole system.

## Frontend Rules

The app should:

- fetch catalog first
- render only published books from catalog
- fetch metadata only for selected books
- fetch manifests only for selected language/volume
- show fallback UI when metadata or manifest fails

The app should not assume:

- hardcoded books
- bundled-only metadata
- static local catalog

## Versioning

Every manifest and catalog should have a version string.

Recommended:

- timestamp-based version
- example: `2026-05-22-1`

The app can later use this for cache invalidation.

## Cron / Scheduling

Appwrite scheduled functions can be used for:

- retrying stuck jobs
- cleanup
- polling queued jobs if webhook triggering is not used

Do not use Appwrite cron as the main processing engine.

## V1 Recommendation

For V1:

- Appwrite upload + jobs
- VPS polling worker
- GitHub asset repo
- jsDelivr delivery
- public remote catalog

This is a good balance of:

- simplicity
- reliability
- low operational overhead

## Non-Goals For V1

Do not add yet:

- OCR pipeline
- translation extraction
- audio sync generation
- distributed job queue
- multi-worker autoscaling

Those can come later.

## Final Decision

The recommended architecture is:

- `Appwrite` for upload, auth, and job state
- `VPS worker` for conversion and publishing
- `GitHub repo` as the public source of truth
- `raw GitHub` for catalog delivery
- `jsDelivr` for metadata/manifests/page assets
- `Remote catalog + remote manifests` for frontend discovery

This is the correct V1 content workflow.



# Implementation Plan
Yes. The right next step is to turn this into an execution plan with `phases -> goes`.

Recommended split:

**Phase 1: Admin And Ingestion Foundation**
`Go 1`
Set up Appwrite collections, buckets, and base job states.

`Go 2`
Build the admin upload flow for source PDFs and metadata.

`Go 3`
Create the worker contract and queued job handoff from Appwrite to VPS.

**Phase 2: Conversion And Publishing Pipeline**
`Go 1`
Implement PDF download and local worker processing pipeline.

`Go 2`
Generate page images, cover, manifest, and metadata output.

`Go 3`
Add validation, failure handling, retries, and publish-state transitions.

`Go 4`
Publish assets to GitHub and expose them through jsDelivr.

**Phase 3: Frontend Remote Catalog Integration**
`Go 1`
Replace hardcoded book seed data with remote catalog fetching.

`Go 2`
Load per-book metadata and manifests dynamically.

`Go 3`
Handle unpublished/missing/broken remote content safely in the app.

**Phase 4: Reader Asset Delivery**
`Go 1`
Replace generated placeholder reader content with real remote page assets.

`Go 2`
Add page loading states, caching strategy, and fallback behavior.

`Go 3`
Support per-book/per-language/per-volume manifest resolution end to end.

**Phase 5: Operations And Reliability**
`Go 1`
Add job monitoring, logs, and admin status visibility.

`Go 2`
Add retry tools, stuck-job recovery, and rollback-safe publish rules.

`Go 3`
Polish settings/admin controls for local data and ingestion management.

That is the cleanest split because it follows dependency order:
`control plane -> processing -> publishing -> frontend integration -> reliability`

If you want, I can create this as a new doc like `docs/implementation-phases.md`.

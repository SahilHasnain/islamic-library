# Pipeline Overview

## Purpose

This document explains the ingestion pipeline in simple terms.

Use this doc when you want to understand:

- what happens after a PDF is uploaded
- which part of the system does what
- how a book becomes visible in the app
- how to debug the pipeline at a high level

Read this alongside:

- [content-ingestion-spec.md](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/docs/content-ingestion-spec.md)
- [content-ingestion-schema-spec.md](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/docs/content-ingestion-schema-spec.md)

## The Big Picture

The pipeline has 4 main parts:

1. `Admin Console`
2. `Appwrite`
3. `Worker Service`
4. `Assets Repo + Delivery URLs`

The flow is:

1. Admin uploads a source PDF from the Next.js admin console
2. Appwrite stores the PDF and creates internal records
3. The worker downloads that PDF and processes it
4. The worker publishes output into the assets repo
5. The app reads the published catalog and shows the new book

## System Roles

### 1. Admin Console

Location:

- [admin-console](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/admin-console)

Purpose:

- upload source PDFs
- create book metadata
- create ingestion jobs
- dispatch queued jobs to the worker
- monitor job status
- recover failed or stuck jobs

Important routes:

- [src/app/api/ingestion/create/route.ts](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/admin-console/src/app/api/ingestion/create/route.ts)
- [src/app/api/ingestion/dispatch/[jobId]/route.ts](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/admin-console/src/app/api/ingestion/dispatch/[jobId]/route.ts)
- [src/app/api/ingestion/recover/[jobId]/route.ts](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/admin-console/src/app/api/ingestion/recover/[jobId]/route.ts)
- [src/app/api/jobs/route.ts](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/admin-console/src/app/api/jobs/route.ts)

Main UI:

- [src/components/admin-console.tsx](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/admin-console/src/components/admin-console.tsx)

### 2. Appwrite

Purpose:

- store the original uploaded PDF
- store internal job state
- store internal book state
- record publish events

Think of Appwrite as the `control plane`.

It does not do heavy PDF work itself.

Current internal resources:

- database: `library_ingestion`
- collections:
  - `books`
  - `ingestion_jobs`
  - `publish_events`
- buckets:
  - `source_pdfs`
  - `generated_previews`
  - `worker_logs`

### 3. Worker Service

Location:

- [worker-service](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/worker-service)

Purpose:

- download the PDF from Appwrite
- render pages
- generate metadata and manifest files
- validate output
- publish files into the public assets repo
- update Appwrite job and book status

Think of the worker as the `execution plane`.

Important files:

- [src/server.mjs](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/worker-service/src/server.mjs)
- [src/render.mjs](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/worker-service/src/render.mjs)
- [src/validate.mjs](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/worker-service/src/validate.mjs)
- [src/publish.mjs](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/worker-service/src/publish.mjs)
- [src/appwrite.mjs](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/worker-service/src/appwrite.mjs)

### 4. Assets Repo + Delivery URLs

Assets repo location:

- [islamic-library-assets](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library-assets)

Purpose:

- store only public published content
- store the public catalog file
- serve page images, metadata, and manifests through jsDelivr

Think of this as the `delivery plane`.

The app should never read raw Appwrite job data for published content.

Important delivery split:

- `catalog.json` should be fetched from `raw.githubusercontent.com`
- `metadata.json`, `manifest.json`, covers, and page images should be fetched from `jsDelivr`

Why:

- `catalog.json` changes immediately when a new book is published
- jsDelivr can keep `@main` aliases cached for up to 7 days
- reading assets are stable static files, so CDN caching helps there

Important:

- the worker needs GitHub authentication on the VPS if it should push to the remote assets repo
- this is configured in the worker env, not in the Expo app and not in the admin console

## End-To-End Flow

### Step 1. Upload

An admin uploads:

- source PDF
- title
- slug
- language ID
- volume ID
- optional metadata like author, subtitle, category, description

The admin console sends that to Appwrite.

Result:

- PDF goes into `source_pdfs`
- a `books` record is created
- an `ingestion_jobs` record is created with `queued`

### Step 2. Dispatch

From the admin console, the operator dispatches a queued job.

The dispatch route sends a structured payload to the worker.

Result:

- worker receives `jobId`, `bookSlug`, `sourceFileId`, and metadata
- Appwrite job status becomes `processing`

### Step 3. Download And Workspace Creation

The worker:

- looks up the Appwrite job
- looks up the Appwrite book
- downloads the source PDF
- creates a local workspace under `worker-service/runs/<jobId>/`

The workspace holds temporary processing output.

### Step 4. Render

The worker converts the PDF into reading assets.

Current supported modes:

- `mock render mode` for pipeline testing
- `real render mode` once the PDF rendering dependency is fully available

Expected output:

- `cover.webp`
- page images like `page-001.webp`
- `metadata.json`
- `manifest.json`
- `summary.json`

### Step 5. Validate

Before publishing anything, the worker validates the workspace.

Checks include:

- required files exist
- page count matches the manifest
- metadata is shaped correctly
- manifest is shaped correctly

If validation fails:

- job goes to `retrying` or `failed`
- book is not published
- catalog is untouched

### Step 6. Publish

If validation succeeds, the worker publishes to the assets repo.

Publish order matters:

1. page images
2. manifest
3. metadata
4. `catalog.json`

For production remote publishing, the worker uses:

- a local clone of the assets repo
- a GitHub token from worker env
- `git push` after commit

This last step is the critical rule:

`catalog.json is the visibility switch`

That means assets can exist in the repo before users see the book, but the app will not show the book until the catalog includes it.

### Step 7. App Consumption

The Expo app reads:

- remote `catalog.json` from raw GitHub
- per-book `metadata.json`
- per-volume `manifest.json`
- page image URLs

This is already wired into the app through the remote catalog hooks and reader fallback logic.

## State Model

### Internal State

Internal state lives in Appwrite.

This includes:

- upload status
- processing status
- worker details
- retry and failure info

The main job statuses are:

- `queued`
- `processing`
- `validating`
- `publishing`
- `published`
- `retrying`
- `failed`

### Public State

Public state lives in the assets repo.

This includes:

- `catalog.json`
- `metadata.json`
- `manifest.json`
- page assets

The app only cares about the public state for reading.

## Reliability Model

The system is designed around `safe failure`, not “never fail”.

That means:

- a bad render should not break the app
- a partial publish should not expose a broken book
- a worker crash should not make a half-visible catalog entry

The most important rules are:

1. The app reads only published catalog data
2. The worker validates before publish
3. Catalog update happens last
4. Operators can requeue or reset stuck jobs from the admin console

## What Is Already Built

### Built In The App

- remote catalog support
- remote book metadata loading
- remote manifest loading
- remote page image reader
- fallback to local seeded content when remote assets are missing

### Built In The Admin Console

- PDF upload
- job creation
- dispatch to worker
- monitoring dashboard
- publish-event visibility
- requeue failed jobs
- reset stuck jobs
- filtering and search

### Built In The Worker

- Appwrite download integration
- workspace creation
- rendering pipeline structure
- validation
- publish-to-assets-repo flow
- publish event recording
- mock end-to-end test mode

## What Is Not Fully Proven Yet

The full pipeline is proven in `mock mode`.

That means these parts are already verified:

- admin upload
- Appwrite job creation
- dispatch to worker
- validation flow
- publish to assets repo
- catalog update
- app-side remote consumption path

What still needs full runtime verification:

- real PDF rasterization with the final renderer dependency setup

So the pipeline structure is real and working, but the final rendering engine still needs its production-grade confirmation path.

## How To Debug The Pipeline

### If Upload Fails

Check:

- admin console env
- Appwrite endpoint/project/key
- bucket permissions

### If Dispatch Fails

Check:

- `WORKER_API_URL`
- `WORKER_API_TOKEN`
- worker service health endpoint

### If Worker Fails Midway

Check:

- Appwrite `ingestion_jobs` error fields
- worker logs
- `worker-service/runs/<jobId>/summary.json`

### If Book Does Not Appear In The App

Check in this order:

1. job status is `published`
2. book status is `published`
3. assets repo contains the book files
4. `catalog.json` includes the book
5. app catalog URL is pointed at the correct repo/CDN path

### If Publish To GitHub Fails

Check:

- `GIT_PUSH_ENABLED`
- `GITHUB_TOKEN`
- `GITHUB_REPO_HTTPS`
- the repo clone path in `ASSETS_REPO_PATH`
- whether the VPS clone has the correct remote/branch

If `catalog.json` is missing the book, the app is expected not to show it.

## Mental Model

If you want the shortest way to think about this system:

- `Admin Console` starts and operates the pipeline
- `Appwrite` remembers internal truth
- `Worker` turns PDFs into publishable reading assets
- `Assets Repo + jsDelivr` become the public reading source
- `Expo App` reads only the public published output

That is the pipeline.

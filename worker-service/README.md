# Islamic Library Worker

This service is the first execution-plane worker for the ingestion pipeline.

Current scope:

- authenticated `POST /jobs/ingest`
- download source PDF from Appwrite
- create a local workspace in `runs/<jobId>/`
- write `source.pdf`
- render page images into `pages/`
- write `cover.webp`
- write `metadata.json`
- write `manifest.json`
- write `summary.json`
- validate rendered output before success
- update Appwrite job and book records through `processing` -> `validating`
- mark failures as `retrying` or `failed` based on retry budget

## Run

1. Copy `.env.example` to `.env.local` or export the variables in your shell.
2. Start the service:

```bash
npm run dev
```

Default port: `4010`

## Endpoints

- `GET /health`
- `POST /jobs/ingest`

`POST /jobs/ingest` requires:

- `Authorization: Bearer <WORKER_API_TOKEN>`
- JSON body matching the admin-console dispatch payload

## Dependency

This worker expects `PyMuPDF` to be installed for PDF rendering:

```bash
python -m pip install PyMuPDF
```

## Mock Test Mode

To test the full pipeline without real PDF rendering:

```bash
MOCK_RENDER_ENABLED=true
MOCK_RENDER_PAGE_COUNT=6
```

In this mode the worker will:

- create fake page assets
- create a fake cover
- generate manifest and metadata
- run validation
- publish to the `public_assets` Appwrite bucket

This lets you verify:

- Appwrite job flow
- worker handoff
- validation
- bucket publishing (pages, covers, manifest, metadata, catalog)
- catalog updates

without waiting on `PyMuPDF`.

## Public Bucket Publishing

The worker publishes all rendered content to the **`public_assets`** bucket (anonymous read).

- File IDs are deterministic (`md5` of `book:lang:volume:page`-style seeds); overwriting is delete-then-create.
- Public view URLs use `${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`.
- `catalog.json` is written with the fixed file ID `catalog`.

Required env:

- `APPWRITE_PUBLIC_BUCKET_ID` (e.g. `public_assets`)

## GitHub Assets Repo (legacy)

The previous delivery path wrote into a local clone of `sahilhasnain/islamic-library-assets`
and optionally pushed it to GitHub. That path has been replaced by Appwrite bucket publishing;
the repo remains only as a reference. The legacy env vars (`ASSETS_REPO_*`, `GIT_*`, `GITHUB_*`)
are no longer read by the worker.

## Pending

- `PyMuPDF` install is still pending in the current environment
- full end-to-end render verification should be rerun after that install completes

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

## Assets Repo

Default local publish target:

- `C:/Users/MD SAHIL HASNAIN/desktop/projects/islamic-library-assets`

Expected env values:

- `ASSETS_REPO_PATH`
- `ASSETS_REPO_BRANCH`
- `ASSETS_REPO_OWNER`
- `ASSETS_REPO_NAME`

## Pending

- `PyMuPDF` install is still pending in the current environment
- full end-to-end render verification should be rerun after that install completes

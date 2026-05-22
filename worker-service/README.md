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
- publish to the assets repo

This lets you verify:

- Appwrite job flow
- worker handoff
- validation
- assets repo publishing
- catalog updates

without waiting on `PyMuPDF`.

## Assets Repo

Default local publish target:

- `C:/Users/MD SAHIL HASNAIN/desktop/projects/islamic-library-assets`

Expected env values:

- `ASSETS_REPO_PATH`
- `ASSETS_REPO_BRANCH`
- `ASSETS_REPO_OWNER`
- `ASSETS_REPO_NAME`

## GitHub Push Setup

By default, the worker only writes and commits into the local assets repo clone.

That means:

- local `git add`
- local `git commit`
- no remote GitHub push unless you enable it

To enable real VPS publishing, set these env values:

```env
GIT_PUSH_ENABLED=true
GIT_REMOTE_NAME=origin
GITHUB_REPO_HTTPS=https://github.com/<your-user>/islamic-library-assets.git
GITHUB_TOKEN=<your-fine-grained-token>
```

Recommended VPS setup:

1. Clone the assets repo on the VPS
2. Set `ASSETS_REPO_PATH` to that clone path
3. Add a fine-grained GitHub token in `.env.local`
4. Enable `GIT_PUSH_ENABLED=true`
5. Keep the token only on the VPS, never in the app

The worker will then:

1. write files into the clone
2. `git add`
3. `git commit`
4. configure the authenticated remote URL
5. `git push origin <branch>`

If `GIT_PUSH_ENABLED=false`, the worker stays in local-only mode.

## Pending

- `PyMuPDF` install is still pending in the current environment
- full end-to-end render verification should be rerun after that install completes

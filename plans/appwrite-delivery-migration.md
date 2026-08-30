# Appwrite Delivery Migration — Plan

**Status:** Approved (backfill existing content; keep `islamic-library-assets` repo but stop writing to it)
**Date:** 2026-08-09
**Scope:** Move all published-content delivery (pages, covers, manifests, metadata, catalog) from the GitHub assets repo / jsDelivr to a self-hosted Appwrite instance. GitHub leaves the publish path entirely.

---

## 1. Decisions

- **All-in on Appwrite.** Rendered page PNGs, covers, `manifest.json`, per-book `metadata.json`, and `catalog.json` become **files in a new public bucket** (`public_assets`). This preserves the exact artifact shapes in `data/types.ts`, so mobile app parsing is unchanged.
- **Backfill** the currently published book(s) from the GitHub clone into the bucket in this migration.
- **Keep `sahilhasnain/islamic-library-assets`** — it stays untouched as a reference; nothing writes to it after the switch.
- **Self-hosted Appwrite endpoint** replaces Appwrite Cloud.

### 1.1 Appwrite endpoint change

- Old (Appwrite Cloud), used in `*.env.local` / `*.env.example`:
  `https://sgp.cloud.appwrite.io/v1`
- New (self-hosted), to be used everywhere:
  `https://api.bloomoralabs.org/v1` (normalize: append `/v1` if the configured base omits it)
- `projectId` and `apiKey` (for the new server) to be supplied by the owner before running the provision script.
- Only the **endpoint** changes in this pass; project/API-key keep the same meaning. Update these files:
  - `admin-console/.env.example` (lines: `APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_ENDPOINT`)
  - `worker-service/.env.example` (`APPWRITE_ENDPOINT`)
  - runtime `.env.local` files (owner performs this — end values not to be committed/echoed)
  - `APPWRITE_ENDPOINT` references in `admin-console/src/lib/appwrite.ts`, `appwrite-client.ts`, `worker-service/src/appwrite.mjs`, and scripts read this from env.

---

## 2. New Appwrite schema + provisioning

### 2.1 `scripts/appwrite-schema.json`

Single declarative source of truth for the self-hosted instance:

- **database**: `library_ingestion`
- **collections**: `books`, `ingestion_jobs`, `publish_events`, `ai_analysis_drafts` with full attribute definitions (string / integer / datetime / enum + size, required, min/max, enum elements, defaults).
- **buckets**: `source_pdfs`, `generated_previews`, `worker_logs`, and the new **`public_assets`** bucket:

  ```jsonc
  {
    "id": "public_assets",
    "name": "Public Assets",
    "permissions": ["read(\"any\")"], // anonymous READ so the mobile app can fetch without auth
    "fileSecurity": false, // bucket-level permissions govern all files
    "maximumFileSize": 60000000,
    "allowedFileExtensions": [], // allow all
    "compression": "none",
    "encryption": false,
    "antivirus": false,
  }
  ```

  > Note: the owner of `public_assets` write access is the **worker's server API key**, not the anonymous reader.

### 2.2 `scripts/provision-appwrite.mjs`

Idempotent, zero-dependency (`fetch` + a tiny `.env.local` parser, mirroring `worker-service/src/appwrite.mjs`):

- Loads `appwrite-schema.json` from the same dir.
- Resolves env from (first found): `admin-console/.env.local` → root `.env.local` → `worker-service/.env.local`.
- Explores `APPWRITE_ENDPOINT` → normalizes to `/v1` suffix.
- Ensures database, collections + attribute lists (skip-if-exists via 409 / attribute GET), and buckets. On bucket-conflict, `PUT /storage/buckets/:id` to converge public-read permissions/settings.
- Dry-run flag (`--dry-run`) + summary table at the end.

Run: `npm run appwrite:provision` (added to root `package.json`).

Purpose: lets anyone with the two server credentials re-create / repair the schema exactly as committed.

---

## 3. Implementation steps

### Step 1 — Appwrite infra (per §1.1 + §2)

1. `scripts/appwrite-config.mjs`: add `publicBucketId: "public_assets"`.
2. `admin-console/src/lib/appwrite.ts`: add `publicAssetsBucketId` to `APPWRITE_IDS`.
3. Commit `scripts/appwrite-schema.json` + `scripts/provision-appwrite.mjs`; run provision against the new endpoint once credentials are provided.
4. **Spike (verify once before wider work):** confirm the anonymous view URL
   `http://35.200.174.46/v1/storage/buckets/public_assets/files/<id>/view?project=<projectId>`
   resolves with no auth (this is the URL shape the app + downloadable images depend on; same as SDK `Storage.getFileViewURL`).

### Phase 2 — Worker publish: GitHub → bucket upload

- New `worker-service/src/upload.mjs` supersedes `publish.mjs`'s git half.
  - Zero-dep multipart `POST /storage/buckets/{bucket}/files` + `DELETE` for overwrite (delete+create), hand-held `X-Appwrite-Key` auth.
  - Deterministic ≤32‑char file IDs (`md5(slug|lang|volume|page)`), human-readable `name`, overwrite = delete+create.
  - Public URL = `${endpoint}/storage/buckets/${bucket}/files/${id}/view?project=${projectId}`.
  - `publishWorkspace()` keeps its existing signature + metadata merge; writes pages, covers, `manifest.json`, merged `metadata.json`, then `catalog.json` (ID `catalog`).
  - `republishBookMetadata()` rewrites `metadata.json` + `catalog.json` files.
  - Delete `runGit`, `ensurePushRemote`, `buildPushResult`, `retryPushOnly`, `jsdelivrUrl`, `rawGithubUrl`, `getPublicAssetUrl`.
- `worker-service/src/appwrite.mjs`: add `uploadBucketFile`, `deleteBucketFile`, `publicFileViewUrl`.
- Env: remove `ASSETS_REPO_*`, `GIT_*`, `GITHUB_*`; add `APPWRITE_PUBLIC_BUCKET_ID` (+ `APPWRITE_ENDPOINT` already used). Update `worker-service/.env.example`.
- `server.mjs`: consume new return fields; keep `pushStatus="succeeded"` semantics so the existing jobs board doesn't break; drop `handleRetryPush` + the `retry-push` route.

### Phase 3 — Admin console (leaf cleanup)

- Remove `retry-push` route, button, and push-failure banners.
- Simplify monitoring counters to published/unpublished.
- `assets/json` proxy passes Appwrite URLs through unchanged (already identity for non-jsDelivr URLs).

### Phase 4 — Mobile app

- Root `.env` (+ `.env.example`): `EXPO_PUBLIC_APPWRITE_ENDPOINT`, `EXPO_PUBLIC_APPWRITE_PROJECT_ID`, `EXPO_PUBLIC_APPWRITE_PUBLIC_BUCKET_ID`, `EXPO_PUBLIC_APPWRITE_CATALOG_FILE_ID` (`catalog`).
- `hooks/useRemoteCatalog.ts`: build the catalog view URL from envs (env-with-fallback).
- `hooks/useRemoteBookData.ts`: remove the jsDelivr→rawGitHub normalizer (URLs pass through).
- Reader, prefetch, offline download, covers (`expo-image`) unchanged — manifests keep `pages[].url` / `baseUrl`.

### Phase 5 — Backfill existing content

- `scripts/backfill-appwrite-public.mjs`: mirrors the local `D:/Projects/islamic-library-assets` clone into `public_assets` using the same ID/name scheme + upload helpers. Idempotent; logs per-file counts and totals.
- Run (after provisioning): `npm run appwrite:backfill` (dry-run: `npm run appwrite:backfill:dry`). Uses the same env resolution as `appwrite:provision` (admin-console → root → worker-service `.env.local`) and also requires `APPWRITE_PUBLIC_BUCKET_ID`. Rewrites legacy jsDelivr/rawGitHub URLs in covers, `manifest.json`, `metadata.json`, and `catalog.json` to Appwrite view URLs; volume `manifestUrl`s are rewritten to point at the backfilled manifest files.

### Phase 6 — Verification

- `npm run worker` mock ingest → assert files present in `public_assets`, anonymous view URLs resolve, JSON parses, covers/pages load.
- `npm --prefix admin-console run lint` + `build`; root `npm run typecheck` + `lint`.
- Confirm no surviving references to `cdn.jsdelivr.net` / `raw.githubusercontent.com` in runtime code.

---

## 4. Risks / accepted trade-offs

- No CDN (single self-hosted endpoint) — acceptable at current scale; can front with Cloudflare/nginx caching later.
- `public_assets` is flat (Appwrite has no folders) → deterministic IDs + readable `name`; re-publish = delete+create (brief gap on republish only).
- Self-hosted endpoint is HTTP (no TLS) → images/fetches will be plain HTTP; note this for production hardening (TLS). `?project=` must be present for anonymous reads.
- The bucket has **anonymous READ**: do not store anything sensitive there; the existing `source_pdfs` bucket stays private.

## 5. Non-goals

- No change to source-PDF ingestion (`source_pdfs`), AI analysis, job bookkeeping.
- No change to mobile reading/progress state (AsyncStorage).
- No deletion of the GitHub assets repo.

# Repo Map

- `./` is the Expo Router app (React Native / Expo SDK 54). Entry: `app/_layout.tsx` + `app/(tabs)/_layout.tsx`.
- `admin-console/` is a Next.js app (Next `16.2.6`). Run it via the root script `npm run console`.
- `worker-service/` is a Node service that renders/publishes ingestion artifacts. Run it via the root script `npm run worker`.
- `admin-console/AGENTS.md` contains Next-specific agent rules; read it before touching `admin-console/`.

# Day-To-Day Commands

- Install (root): `npm install`.
- Mobile dev: `npm start` (or `npm run start:clear` to clear Expo cache).
- Lint (Expo): `npm run lint`.
- Typecheck (Expo): `npm run typecheck`.
- Root `typecheck` excludes `admin-console/` (see `tsconfig.json`), so verify console changes separately: `npm --prefix admin-console run lint` and `npm --prefix admin-console run build`.
- Admin console dev: `npm run console` (delegates to `admin-console` `npm run dev`).
- Worker dev: `npm run worker` (delegates to `worker-service` `npm run dev`).

# Runtime Config

- Mobile app reads the public catalog from the self-hosted Appwrite `public_assets` bucket. `hooks/useRemoteCatalog.ts` assembles the view URL from `EXPO_PUBLIC_APPWRITE_ENDPOINT` / `EXPO_PUBLIC_APPWRITE_PROJECT_ID` / `EXPO_PUBLIC_APPWRITE_PUBLIC_BUCKET_ID` / `EXPO_PUBLIC_APPWRITE_CATALOG_FILE_ID` (see root `.env.example`); a full URL can be forced via `EXPO_PUBLIC_LIBRARY_CATALOG_URL`.
- The repo contains a committed root `.env.local` with secrets; do not echo/copy its contents into chat or logs.

# Expo Router / NativeWind Gotchas

- Expo Router typed routes are enabled (`app.json` `experiments.typedRoutes=true`): route params should match filenames (e.g. `app/book/[bookId]/...`).
- React Compiler is enabled (`app.json` `experiments.reactCompiler=true`): avoid patterns that fight it (don't add memoization everywhere by default).
- NativeWind is wired through Metro + Babel: `metro.config.js` uses `withNativeWind(..., { input: './global.css' })` and `babel.config.js` sets `jsxImportSource: "nativewind"`.
- If you add new directories with Tailwind classes, update `tailwind.config.js` `content` globs or styles will silently not apply.

# Ingestion Pipeline (Admin Console -> Worker -> Assets Repo)

- Admin console creates ingestion jobs in Appwrite (`admin-console/src/app/api/ingestion/create/route.ts`) and triggers a simple in-memory queue (`admin-console/src/lib/job-queue.ts`).
- Queue processing is single-process/in-memory (not Redis): don't assume it's safe across multiple admin-console instances.
- Dispatch uses `WORKER_API_URL` + `WORKER_API_TOKEN` from `admin-console/.env.local` (see `admin-console/.env.example`).
- Worker enforces idempotency via `dispatchToken` (`worker-service/src/server.mjs`): preserve it when retrying/redispatching.

# Worker Service Notes

- Worker loads env from `worker-service/.env.local` via a small custom parser in `worker-service/src/appwrite.mjs` (not `dotenv`); it's a basic `KEY=value` reader (no quoting/expansion).
- Real PDF rendering requires Python + `PyMuPDF`; otherwise use mock rendering: `MOCK_RENDER_ENABLED=true` (see `worker-service/README.md` + `worker-service/.env.example`).
- Publishing writes into a separate local clone at `ASSETS_REPO_PATH` and commits there; pushing is disabled by default (`GIT_PUSH_ENABLED=false`).
- Publishing uploads pages/covers/manifests/metadata/catalog to the Appwrite `public_assets` bucket via `worker-service/src/upload.mjs` (deterministic file IDs, delete-then-create overwrite, anonymous read).

# Appwrite Schema Scripts

- Schema-of-record + provisioning for the self-hosted Appwrite at `http://35.200.174.46/v1` (set `APPWRITE_ENDPOINT`/`APPWRITE_PROJECT_ID`/`APPWRITE_API_KEY` in `admin-console/.env.local`):
  - `scripts/appwrite-schema.json` — declarative schema (database, collections + attributes, buckets incl. the public `public_assets` bucket with anonymous read).
  - Root `npm run appwrite:provision` → `./scripts/provision-appwrite.mjs` (idempotent, zero-dependency; dry-run: `npm run appwrite:provision:dry`).
- Root script `npm run appwrite:add-attributes` runs `./scripts/add-missing-attributes.mjs` and expects Appwrite env values to be present in `admin-console/.env.local` (see `scripts/README.md`).
- Admin console has the same script locally: `npm --prefix admin-console run add-attributes`.
- Public delivery migration (GitHub assets -> Appwrite `public_assets`) is planned in `plans/appwrite-delivery-migration.md`.

# Known Footguns

- `npm run reset-project` points at `./scripts/reset-project.js`, but that file is currently missing in the repo.

# Remote Metadata Expansion Spec

## Purpose

This document defines the remote metadata contract needed to make `islamic-library` feel as strong as `shifa-shareef`.

The main problem today is:

- the pipeline can publish books
- the app can load remote books
- but the frontend still has to invent too much product structure

This spec fixes that by defining which fields should come from published metadata instead of being guessed in the app.

## Why This Is Needed

The current remote contract is enough for:

- title
- subtitle
- author
- category
- cover
- language list
- manifest URL

It is not enough for:

- real section previews
- real reading plans
- today target copy
- devotional framing
- calm, authored book-home UX

Without this expansion, the frontend keeps generating:

- fake sections from page count
- fake plans from page count
- generic reading prompts

That is acceptable as a temporary fallback, but not as the intended product.

## Design Principle

The frontend should render authored reading structure.

It should not infer final product semantics from page counts alone.

That means the published metadata should carry:

- editorial framing
- real reading structure
- real plan structure
- optional devotional prompts

## Scope

This spec expands only the public metadata contract.

It does not change:

- source PDF upload flow
- worker render flow
- manifest page asset structure
- Appwrite control-plane records

It changes:

- `metadata.json`
- frontend types that consume `metadata.json`

## Contract Split

Keep the split as:

- `catalog.json`
  for book discovery
- `metadata.json`
  for book-level and edition-level product structure
- `manifest.json`
  for page delivery

Rule:

- `catalog.json` answers: “what books exist?”
- `metadata.json` answers: “how should this book be presented and structured?”
- `manifest.json` answers: “how are the reading pages delivered?”

## Required Expansion

### 1. Book-Level Editorial Fields

Add:

- `featuredQuote`
- `todayPrompt`
- `devotionalContext`
- `readingTone`

Purpose:

- support richer book-home composition
- avoid generic placeholder copy

Example:

```json
{
  "id": "shifa-shareef-roman-urdu",
  "title": "Shifa Shareef",
  "subtitle": "Roman Urdu",
  "author": "Islamic Library",
  "description": "A devotional reading edition of Shifa Shareef in Roman Urdu.",
  "category": "Durood",
  "coverImage": "https://cdn.jsdelivr.net/gh/.../cover.png",
  "featuredQuote": "Begin with calm. Continue with steadiness.",
  "todayPrompt": "Read 2 pages from your current place with presence and regularity.",
  "devotionalContext": "A daily companion for salawat-centered reading.",
  "readingTone": "calm-guided",
  "languages": []
}
```

### 2. Volume-Level Sections

Add real `sections` inside each volume.

Each section should include:

- `id`
- `title`
- optional `subtitle`
- optional `kind`
- `startPage`
- `endPage`
- `estimatedMinutes`
- optional `description`
- optional `entryPage`
- optional `order`

Purpose:

- replace fake sections
- support real book-home section previews
- support real sections screen

Example:

```json
{
  "id": "volume1",
  "title": "Volume 1",
  "manifestUrl": "https://cdn.jsdelivr.net/gh/.../manifest.json",
  "sections": [
    {
      "id": "opening-salawat",
      "title": "Opening Salawat",
      "subtitle": "A steady beginning for daily reading",
      "kind": "litany",
      "startPage": 1,
      "endPage": 18,
      "entryPage": 1,
      "order": 1,
      "estimatedMinutes": 12,
      "description": "A gentle opening portion for daily continuation."
    }
  ]
}
```

### 3. Volume-Level Plans

Add real `plans` inside each volume.

Each plan should include:

- `id`
- `title`
- `description`
- `totalDays`
- `items`

Each item should include:

- `day`
- `label`
- `startPage`
- `endPage`
- `estimatedMinutes`

Purpose:

- replace fake plans
- support authored reading paths
- preserve the plan quality of `shifa-shareef`

### 4. Optional Book-Home Guidance

Add optional volume-level guidance:

- `todayTarget`
- `introNote`

Purpose:

- support a stronger book home without hardcoding generic copy in the app

Example:

```json
{
  "id": "volume1",
  "title": "Volume 1",
  "manifestUrl": "https://cdn.jsdelivr.net/gh/.../manifest.json",
  "todayTarget": "Continue with 2 pages from your current place.",
  "introNote": "Keep the reading light, steady, and consistent."
}
```

## Recommended Public Metadata Shape

```ts
type PublicBookMetadata = {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  coverImage?: string;
  featuredQuote?: string;
  todayPrompt?: string;
  devotionalContext?: string;
  readingTone?: "calm-guided" | "study" | "reflective" | "liturgical";
  languages: PublicBookMetadataLanguage[];
};

type PublicBookMetadataLanguage = {
  id: string;
  title: string;
  nativeTitle?: string;
  volumes: PublicBookMetadataVolume[];
};

type PublicBookMetadataVolume = {
  id: string;
  title: string;
  manifestUrl: string;
  introNote?: string;
  todayTarget?: string;
  sections?: PublicBookSection[];
  plans?: PublicBookPlan[];
};

type PublicBookSection = {
  id: string;
  title: string;
  subtitle?: string;
  kind?:
    | "front-matter"
    | "chapter"
    | "litany"
    | "dua"
    | "reflection"
    | "appendix"
    | "custom";
  startPage: number;
  endPage: number;
  estimatedMinutes: number;
  description?: string;
  entryPage?: number;
  order?: number;
};

type PublicBookPlan = {
  id: string;
  title: string;
  description: string;
  totalDays: number;
  items: PublicBookPlanItem[];
};

type PublicBookPlanItem = {
  day: number;
  label: string;
  startPage: number;
  endPage: number;
  estimatedMinutes: number;
};
```

## Section Design Guidance

Sections should be authored as real reader entry points, not just page buckets.

That means a good section should answer:

- where should the reader begin from here?
- what kind of portion is this?
- how heavy or light is this portion?

Recommended editorial rules:

- `title` should be the main visible label
- `subtitle` should add human guidance, not repeat the title
- `kind` should support calmer UI treatment in the app
- `entryPage` should be used when the best jump point is not simply `startPage`
- `order` should define explicit display order when needed

Example better section list:

```json
[
  {
    "id": "muqaddimah",
    "title": "Muqaddimah",
    "subtitle": "Opening pages and devotional framing",
    "kind": "front-matter",
    "startPage": 1,
    "endPage": 12,
    "entryPage": 1,
    "order": 1,
    "estimatedMinutes": 8
  },
  {
    "id": "majlis-1",
    "title": "Majlis 1",
    "subtitle": "A gentle place to begin the main reading",
    "kind": "chapter",
    "startPage": 13,
    "endPage": 44,
    "entryPage": 13,
    "order": 2,
    "estimatedMinutes": 18
  }
]
```

## What Stays In Manifest

Do not move page-delivery fields into metadata.

Keep in `manifest.json`:

- `bookId`
- `languageId`
- `volumeId`
- `version`
- `totalPages`
- `baseUrl`
- `filePattern`
- `extension`
- `coverImage`
- `pages`

Reason:

- page delivery is transport data
- sections/plans/editorial framing are product data

That separation should stay clear.

## Worker Responsibilities

The worker should eventually publish enriched `metadata.json`, not only minimal metadata.

That means the ingestion/admin path must be able to provide:

- book-level editorial fields
- volume-level sections
- volume-level plans
- optional today target / intro note

There are two valid V1.5 approaches:

### Option A

Admin enters these fields manually during book setup.

Pros:

- simplest operationally
- highest editorial control

Cons:

- more admin effort

### Option B

The worker seeds a minimal metadata file and a later editorial pass enriches it.

Pros:

- easier ingestion

Cons:

- books may be publishable before they are product-complete

Recommendation:

Use `Option A` for flagship books and real production reading experiences.

## Frontend Consumption Rules

Once this spec is implemented:

- `Book Home` should use remote `sections`, `plans`, `todayPrompt`, and `devotionalContext`
- `Sections` screen should use remote `sections`
- `Plans` screen should use remote `plans`
- `Reader` should still use `manifest.json` for page delivery

Fallback behavior:

- temporary generated sections/plans may remain during transition
- but they should be treated as migration-only fallback, not final product behavior

## Rollout Plan

### Step 1

Expand `data/types.ts` to support the new optional remote metadata fields.

### Step 2

Update the worker publish contract so enriched metadata can be written.

### Step 3

Update the admin/content workflow so editors can provide:

- devotional framing
- sections
- plans

### Step 4

Refactor `Book Home` to consume this metadata first.

### Step 5

Refactor `Sections` and `Plans` to remove synthetic generation.

## Success Condition

This spec is successful when:

- no primary user-facing screen depends on synthetic sections/plans
- book-home copy is no longer generic
- the frontend feels authored in the same way `shifa-shareef` does

## Final Decision

The correct long-term contract is:

- `catalog.json` for discovery
- enriched `metadata.json` for product structure
- `manifest.json` for page delivery

This is the missing layer between the current backend pipeline and the frontend quality we want.

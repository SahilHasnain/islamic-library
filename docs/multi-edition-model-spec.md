# Multi-Edition Model Spec

## Purpose

This document defines the stable model for one book with:

- multiple languages
- multiple volumes inside each language
- one user-facing default reading edition

The current system already supports multi-edition paths technically, but the product and admin flow still behave like one book has one active `languageId` and one active `volumeId`.

This spec corrects that.

## Problem

Today the system is split:

- the app route model supports `/book/[bookId]` and `/reader/[bookId]/[languageId]/[volumeId]/[page]`
- public metadata supports `languages[] -> volumes[]`
- but admin records and worker payloads still lean on a single `languageId` and `volumeId`

That creates drift:

- edition switching is under-specified
- default edition rules are unclear
- future admin UI would have to guess how editions are grouped

## Core Rule

Treat `book`, `language`, and `volume` as separate layers:

- `book`
  editorial identity and discovery
- `language`
  edition family inside the book
- `volume`
  concrete readable unit inside a language

The frontend should choose one default edition from published metadata. The admin flow should author and publish that same structure explicitly.

## Public Metadata Shape

### Book Level

Add:

- `defaultLanguageId`

Purpose:

- tells the app which language should be preferred when there is no stored user progress

### Language Level

Add:

- `summary`
- `order`
- `defaultVolumeId`

Purpose:

- `summary`
  short language-specific framing for edition switching
- `order`
  stable display order for language picker UI
- `defaultVolumeId`
  tells the app where to enter when a language has multiple volumes

### Volume Level

Add:

- `subtitle`
- `order`

Purpose:

- `subtitle`
  lets a volume carry a human-friendly label like `Majalis 1-3` or `Part One`
- `order`
  keeps volume switching stable even if IDs are not naturally sortable

## Recommended Public Types

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
  defaultLanguageId?: string;
  languages: PublicBookMetadataLanguage[];
};

type PublicBookMetadataLanguage = {
  id: string;
  title: string;
  nativeTitle?: string;
  summary?: string;
  order?: number;
  defaultVolumeId?: string;
  volumes: PublicBookMetadataVolume[];
};

type PublicBookMetadataVolume = {
  id: string;
  title: string;
  subtitle?: string;
  manifestUrl: string;
  order?: number;
  introNote?: string;
  todayTarget?: string;
  sections?: PublicBookSection[];
  plans?: PublicBookPlan[];
};
```

## Admin Model

The admin side should stop treating `languageId` and `volumeId` as book-wide identity.

Instead:

- `book`
  owns book-level metadata only
- `edition`
  owns one `languageId`
- `volume`
  belongs to one `edition`

For Phase 1 of this model, we do not need a new Appwrite collection yet. We do need a stable in-code contract that later UI and publish code can build on.

## Admin Contract

Recommended editor-facing shape:

```ts
type AdminEditionVolumeInput = {
  id: string;
  title: string;
  subtitle?: string;
  order?: number;
  introNote?: string;
  todayTarget?: string;
  sourceFileId?: string;
  manifestUrl?: string;
  sections?: PublicBookSection[];
  plans?: PublicBookPlan[];
};

type AdminEditionInput = {
  languageId: string;
  title: string;
  nativeTitle?: string;
  summary?: string;
  order?: number;
  defaultVolumeId?: string;
  volumes: AdminEditionVolumeInput[];
};
```

## Default Edition Rules

When the app opens a book and there is no stored progress:

1. use `defaultLanguageId` if present
2. otherwise use the lowest-ordered language
3. inside that language, use `defaultVolumeId` if present
4. otherwise use the lowest-ordered volume

This rule should be the same in:

- Book Home
- Reader entry
- offline download controls
- continue reading fallback

## Product Implications

This model allows:

- one card in Library for a book
- explicit language switching on Book Home
- explicit volume switching inside the selected language
- per-edition progress, bookmarks, and downloads

Without it, the app stays biased toward a single hardcoded edition.

## Non-Goals In This Go

This go does not yet add:

- the edition-switcher UI
- the multi-edition admin form
- new Appwrite collections

It only stabilizes the contract so those later goes are clean.

## Success Condition

This go is successful when:

- the public metadata contract has explicit default-edition semantics
- the admin codebase has explicit edition and volume input types
- the next UI go does not have to invent edition rules ad hoc

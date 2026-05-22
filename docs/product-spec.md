# Islamic Library App Spec

## Working Positioning

This app should be a calm Islamic reading library, not a generic document shelf.

The product goal:

- make Islamic reading feel approachable every day
- reduce friction to resume any book
- turn long texts into small guided reading sessions
- support multiple books, languages, and offline reading
- create a peaceful and respectful atmosphere

The product framing is:

`guided Islamic reading library`, not `PDF manager`

## Core Product Thesis

Most Islamic reading apps fail in one of two ways:

- they are too bare and feel like a file browser
- they are too broad and become noisy, cluttered, or academic

This app should sit in the middle:

- structured enough to motivate consistency
- quiet enough to feel devotional
- scalable enough to support many books

## Target User

Primary user:

- a Muslim who wants to read beneficial Islamic texts regularly
- often reads in short sessions
- wants structure and motivation more than raw file access

Secondary user:

- someone exploring Islamic books in Urdu, English, Roman Urdu, or Arabic
- wants to keep a personal library and continue multiple books over time

## Product Principles

- Resume should be the default action everywhere.
- The app should reduce decision fatigue.
- Reading progress should feel encouraging, not gamified.
- Books should feel curated and guided, not dumped into a list.
- Offline reading should be first-class.

Avoid:

- social feed patterns
- loud animations
- achievement-heavy gamification
- cluttered toolbars
- a reference-app tone in the core reading loop

## V1 Scope

V1 should be intentionally narrow and strong.

Include:

- multi-book library
- per-book home screen
- image-based or PDF-based reading
- continue reading
- bookmarks
- sections / chapter navigation
- reading plans
- progress tracking
- offline download support
- multi-language-ready content model

Exclude for V1:

- social features
- cloud sync
- audio sync
- advanced notes and highlights
- full-text OCR search
- user uploads

## Recommended Book Strategy For V1

Do not start with a huge catalog.

Start with:

- 1 flagship devotional or seerah-style book
- 2 to 4 short companion books
- at most 1 to 2 languages per book initially

Good V1 categories:

- seerah
- durood / salawat
- duas and daily adhkar
- akhlaq and self-rectification
- short motivational Islamic readings

## Information Architecture

Recommended top-level app structure:

1. Library
2. Journey
3. Bookmarks
4. Settings

Recommended book-level structure:

1. Book Home
2. Reader
3. Sections
4. Plans

## Screen Definitions

### 1. Library

Purpose:

- show the user what to read next
- surface their in-progress books
- make the library feel curated

Modules:

- continue reading rail
- featured book
- in-progress books
- categories
- downloaded books

Each book card should show:

- cover
- title
- author or source
- current status
- optional language badge
- quick action: `Resume`, `Start`, or `Download`

### 2. Book Home

Purpose:

- provide the best next action for one specific book

Modules:

- continue reading hero card
- book description
- current plan
- sections preview
- bookmarks preview
- gentle daily target

This is where the current `shifa-shareef` home pattern can be reused almost directly.

### 3. Reader

Purpose:

- offer the cleanest possible reading experience

Core controls:

- back
- bookmark
- theme switch
- previous / next page
- section title
- page progress

Future controls can be added later, but V1 should stay restrained.

### 4. Sections

Purpose:

- break long books into manageable parts

Each row should show:

- section title
- page range
- estimated reading time
- status: unread, in progress, completed

### 5. Plans

Purpose:

- turn intention into a repeatable reading habit

Starter plans:

- 7-day intensive
- 21-day balanced
- daily light

Default recommendation should usually be the light plan.

### 6. Journey

Purpose:

- motivate consistency across the whole library

Metrics:

- current streak
- total sessions
- pages read
- books in progress
- sections completed

Tone should remain reflective, not competitive.

### 7. Bookmarks

Purpose:

- give users a clean place to revisit saved passages across books

Each bookmark item should show:

- book title
- section title if available
- page
- saved date

## Reading Experience

The reading loop should feel like this:

1. Open app
2. See a clear next reading action
3. Resume in one tap
4. Read a small portion
5. Leave with visible but gentle progress

That loop matters more than catalog size.

## Design Direction

The visual system should feel:

- calm
- warm
- editorial
- premium
- devotional without decorative overload

Recommended direction:

- warm ivory or parchment surfaces
- deep green as primary accent
- muted gold for highlights
- charcoal or dark olive text

Typography:

- a distinctive, elegant display face for headings
- a highly readable UI/body face
- Arabic support when needed

Motion:

- soft fades
- subtle card transitions
- no playful bounce-heavy behavior

## Content Model

The app should be designed around books first, then editions and volumes.

Suggested model:

```ts
type LibraryBook = {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  description: string;
  category: string;
  coverImage?: string;
  featured: boolean;
  languages: BookLanguage[];
};

type BookLanguage = {
  id: string;
  title: string;
  nativeTitle?: string;
  volumes: BookVolume[];
};

type BookVolume = {
  id: string;
  title: string;
  totalPages: number;
  sections: Section[];
  plans: ReadingPlan[];
  deliveryMode: "bundled" | "remote" | "hybrid";
};

type Section = {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  estimatedMinutes: number;
};

type ReadingPlan = {
  id: string;
  title: string;
  totalDays: number;
  items: {
    day: number;
    label: string;
    startPage: number;
    endPage: number;
  }[];
};
```

## Data and Delivery Strategy

The current `shifa-shareef` split between app shell and remote assets is the correct long-term direction.

Recommended architecture:

- app repo contains UI, metadata, and core logic
- asset repo contains page images and manifests
- manifests exist per book language or per volume
- reading assets resolve by `bookId`, `languageId`, `volumeId`, and `page`

Suggested path shape:

`pages/<bookId>/<languageId>/<volumeId>/page-001.webp`

This will scale much better than embedding all content in the app bundle.

## Technical Architecture

Recommended app structure:

```txt
app/
  _layout.tsx
  (tabs)/
    _layout.tsx
    library.tsx
    journey.tsx
    bookmarks.tsx
    settings.tsx
  book/
    [bookId]/
      index.tsx
      sections.tsx
      plans.tsx
  reader/
    [bookId]/
      [languageId]/
        [volumeId]/
          [page].tsx

components/
constants/
data/
  books/
  manifests/
  types.ts
hooks/
lib/
docs/
```

## Persistence

Persist at minimum:

- last read location per book/language/volume
- reading sessions
- bookmarks
- active reading plan
- theme preference
- download state

Recommended storage:

- MMKV for fast local state
- AsyncStorage only if simplicity is preferred early

## V1 Build Phases

### Phase 1

- create app shell and tabs
- define book-first data model
- add library screen
- add one sample book flow

### Phase 2

- build book home
- build sections and plans
- build reader
- save progress and bookmarks

### Phase 3

- add journey
- add multi-book progress aggregation
- add offline download states

### Phase 4

- visual polish
- empty states
- onboarding
- performance hardening

## Immediate Build Recommendation

First implement these in order:

1. book-first data model
2. library screen
3. single book home
4. reader

If those four are strong, the product direction will be clear very quickly.

## Naming

`islamic-library` is fine as a repo name, but probably not as the product name.

Possible product directions:

- Noor Library
- Miftaah
- Daily Deen Library
- Safar
- Qareeb

The product name should feel editorial and calm, not generic.

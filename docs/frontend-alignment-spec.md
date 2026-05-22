# Frontend Alignment Spec

## Purpose

This document explains how `islamic-library` should realign its frontend with the product strengths of `shifa-shareef`.

The goal is not to copy the old app blindly.

The goal is to preserve the reading quality, devotional tone, and UX confidence of `shifa-shareef` while adapting it to a multi-book remote catalog architecture.

## Diagnosis

`islamic-library` is currently stronger in backend architecture than in product execution.

What is good now:

- remote catalog architecture
- ingestion and publishing pipeline
- remote metadata and manifest loading
- real page-asset reader path

What is weak now:

- library screen composition
- book-home editorial quality
- plan and section semantics
- motivational reading rhythm
- visual confidence

The current frontend behaves more like a generic content shell than a deliberately authored Islamic reading app.

## What `shifa-shareef` Gets Right

After reviewing [shifa-shareef/app/(tabs)/index.tsx](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/shifa-shareef/app/(tabs)/index.tsx) and its surrounding data model, the strongest product traits are:

### 1. The home screen is reading-first

The main screen is not a shelf.

It is a guided continuation surface:

- strong `Continue Reading` hero
- clear current section
- precise page position
- clear offline status
- visible reading plan state
- gentle target for today
- visible reading structure

This makes the app feel like a devotional reading companion, not a browser.

### 2. The app has a strong “product grammar”

`shifa-shareef` consistently uses:

- one dominant hero card
- one primary next action
- soft but intentional card hierarchy
- meaningful chips and labels
- visible progress language
- low-friction route decisions

That consistency is a large part of why it feels good.

### 3. Content structure is real, not synthetic

`shifa-shareef` has:

- true language structure
- true volume structure
- true sections
- true plans
- true page/image reading model

The current `islamic-library` frontend often invents:

- fake sections from page counts
- fake plans from page counts
- generic route labels

That keeps the system functional, but weakens the reading experience.

### 4. It is devotional, not transactional

The copy and layout in `shifa-shareef` encourage calm continuation:

- “Continue Reading”
- “Today’s gentle target”
- “Choose a Reading Plan”
- “Reading Structure”

This is much stronger than generic “book details” or “reader assets loaded” language.

### 5. It handles complexity without exposing it

`shifa-shareef` supports:

- multiple languages
- multiple volumes
- downloads
- active plan state

But the interface still feels simple.

That is important.

`islamic-library` currently exposes too much system shape and not enough product curation.

## Main Misalignment In `islamic-library`

### 1. We generalized too early

We moved from:

- one deeply-authored reading product

to:

- a generic remote catalog frontend

before preserving the original reading UX patterns.

### 2. Library-first displaced reading-first

The current [app/(tabs)/library.tsx](C:/Users/MD%20SAHIL%20HASNAIN/desktop/projects/islamic-library/app/(tabs)/library.tsx) is structurally correct, but too generic.

It gives:

- collection
- categories
- cards

But it does not yet give:

- a strong devotional center
- a feeling of guided continuation
- a “why should I read now?” prompt

### 3. Book Home is too technical

The current book screen is remote-safe, but it still feels system-derived.

Problems:

- remote-state messaging dominates too much
- sections are synthetic
- plans are synthetic
- there is not enough real editorial rhythm

### 4. Reader fallback language is still utility-first

The reader is functional, but the fallback/support language still sounds like infrastructure.

That is acceptable during development, but not for the product.

### 5. The metadata contract is still too thin for a premium reading experience

Right now the pipeline gives enough metadata to render a book.

It does not yet give enough metadata to preserve the `shifa-shareef` product feel.

## Product Direction

`islamic-library` should not become a generic Islamic shelf.

It should become:

`a multi-book devotional reading library built with the same reading grammar as shifa-shareef`

That means:

- `Library` is new
- but `Book Home`, `Plans`, `Sections`, and `Reader` should remain much closer to `shifa-shareef`

## What To Preserve From `shifa-shareef`

Preserve these patterns directly:

### Home grammar

- one strong hero
- one strong current reading action
- visible next-step reading state
- plan visibility
- today target
- reading structure preview

### Visual tone

- warm cream surfaces
- deep green hero emphasis
- gold for devotion/progress accents
- large confident headings
- soft but clear card hierarchy

### Reading language

- continue reading
- active plan
- gentle target
- reading structure
- offline ready / available online

### Simplicity of action

- one obvious main CTA
- minimal decision fatigue
- avoid exposing raw system state unless necessary

## What Should Change For `islamic-library`

### 1. Add a true library layer

This is the correct new layer.

Needed:

- featured current book
- recently read books
- curated categories
- library collection

But this should still be framed around reading continuation, not browsing alone.

### 2. Make book home the real product center

Each book home should inherit the `shifa-shareef` home structure:

- continue reading hero
- offline/availability status
- active plan or plan chooser
- today’s target
- reading structure
- book-specific devotional context

So the Library screen chooses a book, but the Book Home becomes the real “reading dashboard”.

### 3. Replace synthetic sections and plans

This is critical.

Do not derive final product sections and plans from page counts alone.

Instead, the ingestion model should eventually support remote fields for:

- `sections`
- `plans`
- `book home prompts`
- `reading targets`

These should be provided by metadata, not invented in the app.

### 4. Reduce infrastructure messaging in user-facing screens

User-facing screens should not lead with:

- remote state
- manifest state
- metadata state
- route fallback state

Those are useful for debugging, but not for the reading experience.

In production UX:

- show calm fallback UI
- log technical errors elsewhere
- keep the surface devotional and readable

### 5. Make the reader feel like a premium image-reader again

`shifa-shareef` already had the right direction:

- image-based reading
- page-aware structure
- reading progress
- bookmark control

`islamic-library` should lean into that instead of over-explaining the render pipeline.

## Required Remote Metadata Expansion

If we want `islamic-library` to feel as good as `shifa-shareef`, the remote metadata must grow.

Current metadata is enough for:

- title
- subtitle
- author
- category
- manifest URL

It is not enough for:

- strong book home
- real sections
- real plans
- motivational copy
- editorial framing

Recommended new remote metadata fields:

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
  languages: Array<{
    id: string;
    title: string;
    nativeTitle?: string;
    volumes: Array<{
      id: string;
      title: string;
      manifestUrl: string;
      sections?: Array<{
        id: string;
        title: string;
        startPage: number;
        endPage: number;
        estimatedMinutes: number;
      }>;
      plans?: Array<{
        id: string;
        title: string;
        description: string;
        totalDays: number;
        items: Array<{
          day: number;
          label: string;
          startPage: number;
          endPage: number;
          estimatedMinutes: number;
        }>;
      }>;
    }>;
  }>;
};
```

Without this, the frontend will keep guessing.

## Screen-by-Screen Alignment Plan

### 1. Library Tab

Current problem:

- too much like a shelf
- not enough devotional motivation

Target:

- featured current reading hero
- `Continue Reading` first
- second row: in-progress books
- third row: categories
- fourth row: full library

Important:

- keep the first screen reading-first, not browsing-first

### 2. Book Home

This should be the closest descendant of `shifa-shareef` home.

Must contain:

- strong continue reading hero
- section context
- offline/availability state
- active plan state
- today target
- reading structure preview
- book-specific framing copy

### 3. Sections

Should not be synthetic in final form.

Temporary fallback is acceptable, but target behavior is:

- remote-defined sections
- stable order
- meaningful section names
- reading-time estimates

### 4. Plans

Should mirror `shifa-shareef` plan clarity:

- few plan options
- calm copy
- visible day progression
- easy “active plan” state

### 5. Reader

Should be:

- image-first
- calm
- lightly instrumented
- low-system-noise

Reduce:

- technical messaging
- fallback explanation copy

Keep:

- bookmark
- theme
- page progress
- previous/next

## What To Remove Or De-Emphasize

These patterns should be reduced:

- generic “published catalog” labels
- “remote-first route active” copy
- “manifest unavailable” style user-facing emphasis
- fake sections as final behavior
- fake plans as final behavior
- too many state/debug messages on core reading surfaces

These are useful during development, but not in the real product.

## Recommended Next Build Sequence

### Step 1

Write a `remote metadata expansion spec`

This defines the real remote fields needed to support:

- sections
- plans
- today target
- devotional framing

### Step 2

Refactor `Book Home` first

This is the most important screen to realign.

It should become the strongest descendant of `shifa-shareef`.

### Step 3

Refactor `Library` second

Build it around:

- continuation
- curation
- devotion

not just listing.

### Step 4

Refactor `Reader` copy and chrome

Keep the remote architecture.
Change the product language.

### Step 5

Replace synthetic sections/plans with remote-defined ones

This is the product-quality unlock.

## Final Recommendation

Do not continue extending the current generic frontend as-is.

The correct move is:

`preserve shifa-shareef as the product grammar`

and:

`adapt islamic-library as a multi-book system around that grammar`

Short version:

- `shifa-shareef` should be the frontend baseline
- `islamic-library` should be the scalable content system
- the next work should be alignment, not more generic expansion


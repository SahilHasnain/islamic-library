# Implementation Notes

## Why This Direction

The spec is based on the strongest parts of `shifa-shareef`:

- one-tap resume flow
- guided sections
- reading plans
- bookmarks
- journey/progress
- remote content readiness

The main change is not the reader itself.

The main change is the data model:

- from one title with languages
- to many books, each with languages and volumes

## First Refactor Target

The first meaningful engineering task should be defining the shared types and seed data for:

- books
- languages
- volumes
- sections
- plans

Everything else depends on this structure.

## Suggested First Seed Content

For development, create seed metadata for:

- one flagship book
- one short dua collection
- one motivational reading book

That is enough to validate the library UX without overbuilding content tooling.

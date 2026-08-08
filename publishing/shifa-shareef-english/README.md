# Shifa Shareef English Publishing Project

This directory is for the PDF, EPUB, and print manuscript of the English edition of `Shifa Shareef`.

The website can remain section-based for SEO, but this publishing project should be manuscript-first: front matter, parts, chapters, notes, glossary, and export outputs.

## Current Status

- Status: draft, partial translation.
- Current migration source: `content/drafts/shifa-shareef-english.md`.
- Public website source: `content/books/shifa-shareef.json`.
- Publishing manuscript source going forward: files under `manuscript/`.

## Workflow

1. Continue translating in the relevant `manuscript/` file.
2. Keep translation decisions in `notes/translation-style-guide.md`.
3. Add recurring terms to `notes/glossary.md`.
4. Record larger editorial decisions in `notes/editorial-decisions.md`.
5. Export generated files only under `exports/`.

## Important Rule

Avoid maintaining two independent English manuscripts. The existing single draft should be migrated into this structure in reviewed batches, then this publishing manuscript should become the source of truth.

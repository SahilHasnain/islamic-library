# Edition Upload Guide

## Overview
The admin console now supports flexible uploads for both new books and additional editions (languages/volumes) of existing books.

## Upload Scenarios

### 1. New Book (First Edition)
When creating a completely new book:

**Required Fields:**
- Title
- Language ID
- Volume ID
- Source PDF

**Optional Fields:**
- Book slug (auto-generated from title if not provided)
- Subtitle
- Author
- Description
- Category

**Example:**
```
Title: Seerat e Mustafa
Subtitle: A gentle seerah reading journey
Author: Allama Abdul Mustafa Al Aazmi
Category: Seerah
Language ID: english
Volume ID: volume1
PDF: [upload file]
```

### 2. New Edition (Additional Language/Volume)
When adding a new language or volume to an existing book:

**Required Fields:**
- Book slug (must match existing book)
- Language ID
- Volume ID
- Source PDF

**Optional Fields:**
- Title (only if you want to update it)
- Subtitle (only if you want to update it)
- Author (only if you want to update it)
- Description (only if you want to update it)
- Category (only if you want to update it)

**Example - Adding Hindi edition:**
```
Book slug: seerat-e-mustafa
Language ID: hindi
Volume ID: volume1
PDF: [upload file]
```

**Example - Adding Volume 2 to existing language:**
```
Book slug: seerat-e-mustafa
Language ID: english
Volume ID: volume2
PDF: [upload file]
```

## Field Behavior

### For Existing Books
- Metadata fields (title, author, etc.) are **optional**
- If provided, they will **update** the book's metadata
- If omitted, existing metadata is **preserved**
- Language and volume must be unique (no duplicates)

### For New Books
- Title is **required** (used to generate slug if not provided)
- Other metadata fields are optional but recommended

## UI Indicators

- Fields marked with `*` (red asterisk) are always required
- Fields marked with "(optional)" can be left empty
- Fields marked with "(required for new books)" are only needed when creating a new book
- Book slug field shows existing books in a dropdown for easy selection

## Backend Logic

1. **Slug Resolution:**
   - If slug is provided → use it
   - If title is provided → generate slug from title
   - Otherwise → error

2. **Book Creation/Update:**
   - If book exists → update only provided fields
   - If book is new → require title, create with all provided fields

3. **Metadata Merging:**
   - Worker service now properly merges new editions with existing metadata
   - All existing languages/volumes are preserved
   - New language/volume is added to the metadata.json

## Error Messages

- "Language and volume are required." - Always need these fields
- "A source PDF upload is required." - PDF is mandatory
- "Either a book slug or title is required." - Need one to identify/create book
- "Title is required when creating a new book." - New books need a title
- "This book already has an ingestion job or published edition for the same language and volume." - Duplicate edition detected

## Tips

1. **Use the slug dropdown** - Select from existing books to avoid typos
2. **Leave metadata empty** - When adding editions, you don't need to re-enter book details
3. **Check existing jobs** - The job list shows what's already queued/published
4. **Language ID format** - Use lowercase, consistent naming (e.g., "english", "hindi", "urdu")
5. **Volume ID format** - Use consistent naming (e.g., "volume1", "volume2")

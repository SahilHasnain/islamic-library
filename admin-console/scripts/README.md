# Admin Console Scripts

## Add Missing Attributes

This script adds the missing `defaultLanguageId` and `defaultVolumeId` attributes to the `books` collection in your Appwrite database.

### Problem Solved

When uploading books, you may encounter the error:
```
unknown attribute defaultLanguageid
```

This happens because the Appwrite `books` collection is missing these optional attributes that the code expects.

### Usage

From the `admin-console` directory:

```bash
npm run add-attributes
```

Or directly:

```bash
node ./scripts/add-missing-attributes.mjs
```

### Prerequisites

Make sure `.env.local` in the admin-console directory contains:
- `APPWRITE_ENDPOINT` - Your Appwrite server URL
- `APPWRITE_PROJECT_ID` - Your project ID
- `APPWRITE_API_KEY` - API key with database write permissions

### What it does

1. Connects to your Appwrite instance
2. Adds `defaultLanguageId` (string, 255 chars, optional) to the `books` collection
3. Adds `defaultVolumeId` (string, 255 chars, optional) to the `books` collection
4. Safely skips attributes that already exist

### After Running

- Wait a few moments for Appwrite to process the changes
- You can verify the new attributes in your Appwrite Console under:
  - Databases → `library_ingestion` → `books` → Attributes
- Try uploading a book again - the error should be resolved

### Troubleshooting

**Missing environment variables:**
- Ensure `.env.local` exists in the `admin-console` directory
- Check that all required variables are set

**Permission errors:**
- Verify your API key has permissions to modify database schemas
- You may need to use an API key with admin/owner permissions

**Connection errors:**
- Check that `APPWRITE_ENDPOINT` is correct and accessible
- Verify `APPWRITE_PROJECT_ID` matches your project

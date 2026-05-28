# Appwrite Database Scripts

## Add Missing Attributes

This script adds the missing `defaultLanguageId` and `defaultVolumeId` attributes to the `books` collection in your Appwrite database.

### Prerequisites

1. Make sure you have the environment variables set in `admin-console/.env.local`:
   - `APPWRITE_ENDPOINT`
   - `APPWRITE_PROJECT_ID`
   - `APPWRITE_API_KEY`

2. Ensure `node-appwrite` is installed (it should be in the admin-console dependencies)

### Usage

From the root of the `islamic-library` project, run:

```bash
npm run appwrite:add-attributes
```

Or directly:

```bash
node ./scripts/add-missing-attributes.mjs
```

### What it does

The script will:
1. Connect to your Appwrite instance using the credentials from `.env.local`
2. Add the `defaultLanguageId` string attribute (255 chars, optional) to the `books` collection
3. Add the `defaultVolumeId` string attribute (255 chars, optional) to the `books` collection
4. Skip attributes that already exist (safe to run multiple times)

### Expected Output

```
🔧 Adding missing attributes to books collection...

Adding defaultLanguageId attribute...
✅ defaultLanguageId attribute added successfully

Adding defaultVolumeId attribute...
✅ defaultVolumeId attribute added successfully

✨ All attributes added successfully!

Note: Appwrite may take a few moments to process these changes.
You can verify the attributes in your Appwrite Console.
```

### Troubleshooting

If you get an error about missing environment variables:
- Check that `admin-console/.env.local` exists and has the required variables
- Make sure the API key has sufficient permissions to modify database schemas

If you get a connection error:
- Verify the `APPWRITE_ENDPOINT` is correct and accessible
- Check that the `APPWRITE_PROJECT_ID` matches your project

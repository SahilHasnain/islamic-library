import * as dotenv from "dotenv";
import { Client, Databases } from "node-appwrite";
import * as path from "path";

// Load environment variables from admin-console
dotenv.config({ path: path.join(__dirname, "..", "admin-console", ".env.local") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const endpoint = requireEnv("APPWRITE_ENDPOINT");
const projectId = requireEnv("APPWRITE_PROJECT_ID");
const apiKey = requireEnv("APPWRITE_API_KEY");

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = "library_ingestion";
const BOOKS_COLLECTION_ID = "books";

async function addMissingAttributes() {
  console.log("🔧 Adding missing attributes to books collection...\n");

  try {
    // Add defaultLanguageId attribute
    console.log("Adding defaultLanguageId attribute...");
    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        BOOKS_COLLECTION_ID,
        "defaultLanguageId",
        255,
        false, // not required
        undefined, // no default value
        false // not array
      );
      console.log("✅ defaultLanguageId attribute added successfully");
    } catch (error: any) {
      if (error.message?.includes("already exists") || error.code === 409) {
        console.log("ℹ️  defaultLanguageId attribute already exists");
      } else {
        throw error;
      }
    }

    // Add defaultVolumeId attribute
    console.log("\nAdding defaultVolumeId attribute...");
    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        BOOKS_COLLECTION_ID,
        "defaultVolumeId",
        255,
        false, // not required
        undefined, // no default value
        false // not array
      );
      console.log("✅ defaultVolumeId attribute added successfully");
    } catch (error: any) {
      if (error.message?.includes("already exists") || error.code === 409) {
        console.log("ℹ️  defaultVolumeId attribute already exists");
      } else {
        throw error;
      }
    }

    console.log("\n✨ All attributes added successfully!");
    console.log("\nNote: Appwrite may take a few moments to process these changes.");
    console.log("You can verify the attributes in your Appwrite Console.");
  } catch (error) {
    console.error("\n❌ Error adding attributes:", error);
    process.exit(1);
  }
}

addMissingAttributes();

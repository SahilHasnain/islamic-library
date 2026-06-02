import "server-only";

import { Client, Databases, ID, Storage } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

function requireEnv(name: "APPWRITE_ENDPOINT" | "APPWRITE_PROJECT_ID" | "APPWRITE_API_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required Appwrite environment variable: ${name}`);
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

export const appwriteDatabases = new Databases(client);
export const appwriteStorage = new Storage(client);
export { ID, InputFile };

export const APPWRITE_IDS = {
  databaseId: "library_ingestion",
  booksCollectionId: "books",
  jobsCollectionId: "ingestion_jobs",
  publishEventsCollectionId: "publish_events",
  aiAnalysisDraftsCollectionId: "ai_analysis_drafts",
  sourcePdfsBucketId: "source_pdfs",
} as const;

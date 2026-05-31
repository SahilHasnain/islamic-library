import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Client, Databases } from "../admin-console/node_modules/node-appwrite/dist/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, "..", "admin-console", ".env.local");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    continue;
  }

  const [key, ...valueParts] = trimmed.split("=");
  process.env[key] ??= valueParts.join("=").replace(/^['\"]|['\"]$/g, "");
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const client = new Client()
  .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
  .setProject(requireEnv("APPWRITE_PROJECT_ID"))
  .setKey(requireEnv("APPWRITE_API_KEY"));

const databases = new Databases(client);

const DATABASE_ID = "library_ingestion";
const JOBS_COLLECTION_ID = "ingestion_jobs";

try {
  await databases.createIntegerAttribute(
    DATABASE_ID,
    JOBS_COLLECTION_ID,
    "printedPageStartPage",
    false,
    1,
    100000,
  );
  console.log("printedPageStartPage attribute added to ingestion_jobs.");
} catch (error) {
  if (error?.code === 409 || error?.message?.includes("already exists")) {
    console.log("printedPageStartPage attribute already exists on ingestion_jobs.");
  } else {
    throw error;
  }
}

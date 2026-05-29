import { Client, Storage } from "appwrite";

const publicAppwriteConfig = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  sourcePdfsBucketId: process.env.NEXT_PUBLIC_APPWRITE_SOURCE_PDFS_BUCKET_ID,
};

let clientInstance: Client | null = null;
let storageInstance: Storage | null = null;

export function getAppwriteClient() {
  if (!clientInstance) {
    const { endpoint, projectId } = publicAppwriteConfig;
    if (!endpoint || !projectId) {
      throw new Error("Missing public Appwrite configuration.");
    }

    clientInstance = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId);
  }

  return clientInstance;
}

export function getAppwriteStorage() {
  if (!storageInstance) {
    storageInstance = new Storage(getAppwriteClient());
  }

  return storageInstance;
}

export async function uploadPdfWithProgress(
  file: File,
  onProgress?: (progress: { $id: string; progress: number; sizeUploaded: number; chunksTotal: number; chunksUploaded: number }) => void
): Promise<string> {
  const { sourcePdfsBucketId } = publicAppwriteConfig;
  if (!sourcePdfsBucketId) {
    throw new Error("Missing source PDFs bucket ID.");
  }

  const storage = getAppwriteStorage();
  const fileId = crypto.randomUUID();

  const response = await storage.createFile(
    sourcePdfsBucketId,
    fileId,
    file,
    undefined,
    onProgress
  );

  return response.$id;
}

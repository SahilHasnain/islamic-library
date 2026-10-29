const publicAppwriteConfig = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  sourcePdfsBucketId: process.env.NEXT_PUBLIC_APPWRITE_SOURCE_PDFS_BUCKET_ID,
};

// Appwrite's S3-backed storage requires multipart parts of roughly 5 MB;
// keep the supported maximum while sending only one part at a time.
const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_RETRIES = 4;
const CHUNK_TIMEOUT_MS = 2 * 60 * 1000;

type UploadProgress = {
  $id: string;
  progress: number;
  sizeUploaded: number;
  chunksTotal: number;
  chunksUploaded: number;
};

function uploadChunk(
  url: string,
  projectId: string,
  fileId: string,
  file: File,
  start: number,
  end: number,
  totalSize: number,
  uploadId: string | undefined,
): Promise<{ $id: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("fileId", fileId);
    formData.append("file", new File([file.slice(start, end)], file.name, { type: file.type }));

    request.open("POST", url);
    request.timeout = CHUNK_TIMEOUT_MS;
    request.setRequestHeader("X-Appwrite-Project", projectId);
    request.setRequestHeader("Content-Range", `bytes ${start}-${end - 1}/${totalSize}`);
    if (uploadId) request.setRequestHeader("X-Appwrite-ID", uploadId);

    request.onload = () => {
      let payload: { $id?: string; message?: string } = {};
      try {
        payload = JSON.parse(request.responseText || "{}");
      } catch {
        // Use the HTTP status when Appwrite did not return JSON.
      }

      if (request.status >= 200 && request.status < 300 && payload.$id) {
        resolve({ $id: payload.$id });
        return;
      }

      reject(new Error(payload.message || `Appwrite upload failed (${request.status}).`));
    };
    request.onerror = () => reject(new Error("Network error while uploading PDF chunk."));
    request.ontimeout = () => reject(new Error("PDF chunk upload timed out."));
    request.onabort = () => reject(new Error("PDF chunk upload was cancelled."));
    request.send(formData);
  });
}

async function uploadChunkWithRetry(
  ...args: Parameters<typeof uploadChunk>
): Promise<{ $id: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await uploadChunk(...args);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("PDF chunk upload failed.");
}

export async function uploadPdfWithProgress(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<string> {
  const { endpoint, projectId, sourcePdfsBucketId } = publicAppwriteConfig;
  if (!endpoint || !projectId || !sourcePdfsBucketId) {
    throw new Error("Missing public Appwrite configuration.");
  }

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const url = `${endpoint.replace(/\/$/, "")}/storage/buckets/${encodeURIComponent(sourcePdfsBucketId)}/files`;
  const fileId = crypto.randomUUID();
  let uploadId: string | undefined;
  let uploadedBytes = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const response = await uploadChunkWithRetry(
      url,
      projectId,
      fileId,
      file,
      start,
      end,
      file.size,
      uploadId,
    );

    uploadId = response.$id;
    uploadedBytes = end;
    onProgress?.({
      $id: uploadId,
      progress: Math.round((uploadedBytes / file.size) * 100),
      sizeUploaded: uploadedBytes,
      chunksTotal: totalChunks,
      chunksUploaded: chunkIndex + 1,
    });
  }

  return uploadId!;
}

import { BookViewer } from "@/components/book-viewer";

export default async function ViewerPage({
  searchParams,
}: {
  searchParams: Promise<{
    metadataUrl?: string;
    language?: string;
    volume?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <BookViewer
      metadataUrl={params.metadataUrl}
      languageId={params.language}
      volumeId={params.volume}
    />
  );
}

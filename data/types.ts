export type Section = {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  estimatedMinutes: number;
  description?: string;
};

export type ReadingPlanItem = {
  day: number;
  label: string;
  startPage: number;
  endPage: number;
  estimatedMinutes: number;
};

export type ReadingPlan = {
  id: string;
  title: string;
  description: string;
  totalDays: number;
  items: ReadingPlanItem[];
};

export type BookVolume = {
  id: string;
  title: string;
  totalPages: number;
  deliveryMode: "bundled" | "remote" | "hybrid";
  sections: Section[];
  plans: ReadingPlan[];
};

export type BookLanguage = {
  id: string;
  title: string;
  nativeTitle?: string;
  volumes: BookVolume[];
};

export type LibraryBook = {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  description: string;
  category: string;
  featured: boolean;
  coverTint: string;
  continueReading: {
    languageId: string;
    volumeId: string;
    page: number;
    sectionId: string;
    lastReadLabel: string;
  };
  languages: BookLanguage[];
};

export type ReadingProgress = {
  bookId: string;
  languageId: string;
  volumeId: string;
  page: number;
  updatedAt: string;
};

export type Bookmark = {
  id: string;
  bookId: string;
  languageId: string;
  volumeId: string;
  page: number;
  createdAt: string;
};

export type ReaderTheme = "light" | "sepia";

export type ActiveReadingPlan = {
  bookId: string;
  languageId: string;
  volumeId: string;
  planId: string;
  startedAt: string;
};

export type PublicCatalogBook = {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  category?: string;
  coverImage?: string;
  status: "published";
  metadataUrl: string;
};

export type PublicCatalog = {
  version: string;
  generatedAt: string;
  books: PublicCatalogBook[];
};

export type PublicBookMetadataVolume = {
  id: string;
  title: string;
  manifestUrl: string;
};

export type PublicBookMetadataLanguage = {
  id: string;
  title: string;
  nativeTitle?: string;
  volumes: PublicBookMetadataVolume[];
};

export type PublicBookMetadata = {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  coverImage?: string;
  languages: PublicBookMetadataLanguage[];
};

export type PublicManifestPage = {
  page: number;
  fileName: string;
  width: number;
  height: number;
  size: number;
  url?: string;
};

export type PublicVolumeManifest = {
  bookId: string;
  languageId: string;
  volumeId: string;
  version: string;
  totalPages: number;
  baseUrl: string;
  filePattern: string;
  extension: "webp";
  coverImage?: string;
  pages?: PublicManifestPage[];
};

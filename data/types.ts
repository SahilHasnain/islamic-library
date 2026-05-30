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
  sessionCount?: number;
  pagesViewed?: number[];
};

export type Bookmark = {
  id: string;
  bookId: string;
  languageId: string;
  volumeId: string;
  page: number;
  createdAt: string;
};

export type ReaderTheme = "light" | "sepia" | "night";

export type ActiveReadingPlan = {
  bookId: string;
  languageId: string;
  volumeId: string;
  planId: string;
  startedAt: string;
};

export type BookCompletion = {
  bookId: string;
  languageId: string;
  volumeId: string;
  completedAt: string;
  totalPages: number;
  finalPage: number;
  totalPagesRead?: number;
  totalMinutes?: number;
};

export type PublicCatalogBook = {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  category?: string;
  categoryLabel?: string;
  tags?: string[];
  coverImage?: string;
  status: "published";
  metadataUrl: string;
  nextRecommendedBookId?: string;
};

export type PublicCatalog = {
  version: string;
  generatedAt: string;
  books: PublicCatalogBook[];
};

export type PublicBookMetadataVolume = {
  id: string;
  title: string;
  subtitle?: string;
  manifestUrl: string;
  order?: number;
  introNote?: string;
  todayTarget?: string;
  sections?: PublicBookSection[];
  plans?: PublicBookPlan[];
};

export type PublicBookMetadataLanguage = {
  id: string;
  title: string;
  nativeTitle?: string;
  summary?: string;
  order?: number;
  defaultVolumeId?: string;
  volumes: PublicBookMetadataVolume[];
};

export type PublicBookMetadata = {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  category?: string;
  categoryLabel?: string;
  tags?: string[];
  coverImage?: string;
  featuredQuote?: string;
  todayPrompt?: string;
  devotionalContext?: string;
  readingTone?: "calm-guided" | "study" | "reflective" | "liturgical";
  defaultLanguageId?: string;
  languages: PublicBookMetadataLanguage[];
};

export type PublicBookSection = {
  id: string;
  title: string;
  subtitle?: string;
  kind?:
    | "front-matter"
    | "chapter"
    | "litany"
    | "dua"
    | "reflection"
    | "appendix"
    | "custom";
  startPage: number;
  endPage: number;
  estimatedMinutes: number;
  description?: string;
  entryPage?: number;
  order?: number;
};

export type PublicBookPlanItem = {
  day: number;
  label: string;
  startPage: number;
  endPage: number;
  estimatedMinutes: number;
};

export type PublicBookPlan = {
  id: string;
  title: string;
  description: string;
  totalDays: number;
  items: PublicBookPlanItem[];
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
  extension: string;
  coverImage?: string;
  pages?: PublicManifestPage[];
};

export type ResolvedManifestPageAsset = {
  kind: "local" | "remote" | "missing";
  source?: { uri: string };
  uri?: string;
  cacheUri?: string;
  bookId: string;
  languageId: string;
  volumeId: string;
  page: number;
};

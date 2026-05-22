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

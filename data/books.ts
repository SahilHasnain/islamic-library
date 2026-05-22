import type {
  ActiveReadingPlan,
  BookLanguage,
  LibraryBook,
  ReadingPlan,
  ReadingProgress,
  Section,
} from "./types";

function createPlan(
  id: string,
  title: string,
  description: string,
  totalDays: number,
  totalPages: number,
): ReadingPlan {
  const pagesPerDay = Math.ceil(totalPages / totalDays);

  return {
    id,
    title,
    description,
    totalDays,
    items: Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const startPage = index * pagesPerDay + 1;
      const endPage = Math.min(totalPages, startPage + pagesPerDay - 1);

      return {
        day,
        label: `Day ${day}`,
        startPage,
        endPage,
        estimatedMinutes: Math.max(5, Math.round((endPage - startPage + 1) * 2.5)),
      };
    }),
  };
}

function createLanguage(
  id: string,
  title: string,
  totalPages: number,
  sections: Section[],
): BookLanguage {
  return {
    id,
    title,
    nativeTitle: title,
    volumes: [
      {
        id: "volume1",
        title: "Volume 1",
        totalPages,
        deliveryMode: "hybrid",
        sections,
        plans: [
          createPlan("daily-light", "Daily Light", "A gentle low-friction daily plan.", 30, totalPages),
          createPlan("21-day", "21-Day Balanced", "Steady progress for regular readers.", 21, totalPages),
          createPlan("7-day", "7-Day Intensive", "A shorter focused completion plan.", 7, totalPages),
        ],
      },
    ],
  };
}

const seerahSections: Section[] = [
  { id: "opening", title: "Why This Life Matters", startPage: 1, endPage: 18, estimatedMinutes: 28 },
  { id: "mercy", title: "The Messenger of Mercy", startPage: 19, endPage: 42, estimatedMinutes: 36 },
  { id: "steadfastness", title: "Steadfast Through Difficulty", startPage: 43, endPage: 68, estimatedMinutes: 40 },
  { id: "character", title: "Beauty of Character", startPage: 69, endPage: 96, estimatedMinutes: 42 },
];

const adhkarSections: Section[] = [
  { id: "morning", title: "Morning Adhkar", startPage: 1, endPage: 16, estimatedMinutes: 18 },
  { id: "evening", title: "Evening Adhkar", startPage: 17, endPage: 30, estimatedMinutes: 16 },
  { id: "gratitude", title: "Duas of Gratitude", startPage: 31, endPage: 48, estimatedMinutes: 20 },
];

const heartsSections: Section[] = [
  { id: "intention", title: "Purifying Intention", startPage: 1, endPage: 20, estimatedMinutes: 30 },
  { id: "habits", title: "Small Habits of Taqwa", startPage: 21, endPage: 40, estimatedMinutes: 28 },
  { id: "repentance", title: "Returning After Slipping", startPage: 41, endPage: 60, estimatedMinutes: 28 },
];

export const BOOKS: LibraryBook[] = [
  {
    id: "light-of-the-prophet",
    title: "Light of the Prophet",
    subtitle: "A gentle seerah reading journey",
    author: "Editorial Edition",
    description:
      "A reflective seerah-style reading experience focused on mercy, character, and steady companionship with the life of the Messenger.",
    category: "Seerah",
    featured: true,
    coverTint: "#173D31",
    continueReading: {
      languageId: "english",
      volumeId: "volume1",
      page: 37,
      sectionId: "mercy",
      lastReadLabel: "Last read today",
    },
    languages: [
      createLanguage("english", "English", 96, seerahSections),
      createLanguage("urdu", "Urdu", 96, seerahSections),
    ],
  },
  {
    id: "daily-adhkar-companion",
    title: "Daily Adhkar Companion",
    subtitle: "Short daily remembrance readings",
    author: "Compiled Reader",
    description:
      "A compact daily remembrance collection designed for short sessions and repeat reading throughout the day.",
    category: "Adhkar",
    featured: false,
    coverTint: "#7C6E3F",
    continueReading: {
      languageId: "english",
      volumeId: "volume1",
      page: 14,
      sectionId: "morning",
      lastReadLabel: "Last read yesterday",
    },
    languages: [createLanguage("english", "English", 48, adhkarSections)],
  },
  {
    id: "hearts-under-repair",
    title: "Hearts Under Repair",
    subtitle: "Motivational Islamic reflections",
    author: "Study Notes Edition",
    description:
      "Short, structured reflections on sincerity, discipline, repentance, and building a steadier inner life.",
    category: "Self Development",
    featured: false,
    coverTint: "#445C52",
    continueReading: {
      languageId: "english",
      volumeId: "volume1",
      page: 9,
      sectionId: "intention",
      lastReadLabel: "Last read 3 days ago",
    },
    languages: [createLanguage("english", "English", 60, heartsSections)],
  },
];

export function getBookById(bookId?: string | string[]) {
  const normalizedId = Array.isArray(bookId) ? bookId[0] : bookId;
  return BOOKS.find((book) => book.id === normalizedId) ?? BOOKS[0];
}

export function getLanguageForBook(book: LibraryBook, languageId?: string) {
  return book.languages.find((language) => language.id === languageId) ?? book.languages[0];
}

export function getVolumeForBook(
  book: LibraryBook,
  languageId?: string,
  volumeId?: string,
) {
  const language = getLanguageForBook(book, languageId);
  return language.volumes.find((volume) => volume.id === volumeId) ?? language.volumes[0];
}

export function getSectionById(book: LibraryBook, languageId: string, volumeId: string, sectionId: string) {
  return getVolumeForBook(book, languageId, volumeId).sections.find(
    (section) => section.id === sectionId,
  );
}

export function getCurrentSectionForContinueReading(book: LibraryBook) {
  return getSectionById(
    book,
    book.continueReading.languageId,
    book.continueReading.volumeId,
    book.continueReading.sectionId,
  );
}

export function getEffectiveProgress(book: LibraryBook, progress?: ReadingProgress) {
  return (
    progress ?? {
      bookId: book.id,
      languageId: book.continueReading.languageId,
      volumeId: book.continueReading.volumeId,
      page: book.continueReading.page,
      updatedAt: new Date().toISOString(),
    }
  );
}

export function formatLastReadLabel(updatedAt?: string) {
  if (!updatedAt) {
    return "Not started";
  }

  const updatedDate = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - updatedDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "Last read today";
  }

  if (diffDays === 1) {
    return "Last read yesterday";
  }

  return `Last read ${diffDays} days ago`;
}

export function getCurrentSectionForPage(
  book: LibraryBook,
  languageId: string,
  volumeId: string,
  page: number,
) {
  const volume = getVolumeForBook(book, languageId, volumeId);
  return volume.sections.find(
    (section) => page >= section.startPage && page <= section.endPage,
  );
}

export function getSectionProgressLabel(section: Section, page: number) {
  const sectionLength = section.endPage - section.startPage + 1;
  const sectionPage = page - section.startPage + 1;
  return `Section page ${sectionPage} of ${sectionLength}`;
}

export function getGeneratedPageContent(
  book: LibraryBook,
  languageId: string,
  volumeId: string,
  page: number,
) {
  const section =
    getCurrentSectionForPage(book, languageId, volumeId, page) ??
    getSectionById(book, languageId, volumeId, book.continueReading.sectionId);
  const language = getLanguageForBook(book, languageId);
  const volume = getVolumeForBook(book, languageId, volumeId);
  const sectionProgress = section ? getSectionProgressLabel(section, page) : `Page ${page}`;

  return {
    kicker: `${language.title} reading edition`,
    title: section?.title ?? book.title,
    summary:
      section?.description ??
      `${book.title} is being read here as a guided library text, with each section broken into small, consistent reading portions.`,
    paragraphs: [
      `${book.title} invites a slower reading pace. This page belongs to ${section?.title ?? "the current section"}, where the reader is meant to focus on meaning, steadiness, and continuity rather than speed.`,
      `The structure of this library is intentionally light. Each page should feel like a manageable step, giving the reader enough context to continue without the friction of a dense academic interface.`,
      `Within ${language.title}, ${volume.title} preserves the rhythm of the book while the app adds supportive scaffolding around it: resume flow, section context, reading plans, and a calmer sense of progress.`,
    ],
    reflection:
      `Reading becomes sustainable when the next step is clear. ${sectionProgress} keeps the user oriented without turning the experience into a dashboard.`,
    meta: {
      languageTitle: language.title,
      volumeTitle: volume.title,
      sectionProgress,
    },
  };
}

export function getPlanById(book: LibraryBook, languageId: string, volumeId: string, planId?: string) {
  if (!planId) {
    return undefined;
  }

  return getVolumeForBook(book, languageId, volumeId).plans.find((plan) => plan.id === planId);
}

export function getPlanProgress(
  book: LibraryBook,
  progress: ReadingProgress,
  activePlan?: ActiveReadingPlan,
) {
  if (!activePlan) {
    return undefined;
  }

  const plan = getPlanById(book, activePlan.languageId, activePlan.volumeId, activePlan.planId);
  if (!plan) {
    return undefined;
  }

  const currentItem =
    plan.items.find(
      (item) => progress.page >= item.startPage && progress.page <= item.endPage,
    ) ?? plan.items[plan.items.length - 1];

  const currentDay = currentItem?.day ?? 1;
  const progressPercent = Math.round((currentDay / plan.totalDays) * 100);

  return {
    plan,
    currentDay,
    progressPercent,
    currentItem,
  };
}

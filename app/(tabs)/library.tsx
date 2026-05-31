import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ErrorCard,
  HeroCard,
  MetaText,
  Screen
} from "../../components/ui";
import { radii, spacing, typography } from "../../constants/theme";
import type { PublicCatalogBook, ReadingProgress } from "../../data/types";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useBookCompletions } from "../../hooks/useBookCompletions";
import { useReadingPlans } from "../../hooks/useReadingPlans";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { useRemoteBookData } from "../../hooks/useRemoteBookData";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";
import { useVolumeDownload } from "../../hooks/useVolumeDownload";
import {
  loadLibraryLanguagePreference,
  saveLibraryLanguagePreference,
  type LibraryLanguagePreference,
} from "../../lib/library-language-preference";

function getContinueLine(page?: number) {
  return page ? `Page ${page}` : "Not started yet";
}

function normalizeCategoryLabel(category?: string) {
  const trimmed = category?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Uncategorized";
}

function getCategoryDisplayLabel({
  category,
  categoryLabel,
}: {
  category?: string;
  categoryLabel?: string;
}) {
  const curatedLabel = categoryLabel?.trim();
  if (curatedLabel) {
    return curatedLabel;
  }

  return normalizeCategoryLabel(category);
}

type LibrarySortMode = "forYou" | "recent" | "alpha";

const librarySortLabels: Record<LibrarySortMode, string> = {
  forYou: "For You",
  recent: "Recent",
  alpha: "A-Z",
};

function getNextLibrarySortMode(sortMode: LibrarySortMode): LibrarySortMode {
  if (sortMode === "forYou") return "recent";
  if (sortMode === "recent") return "alpha";
  return "forYou";
}

function getTimeValue(value?: string) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getSharedSignalScore(book: PublicCatalogBook, anchorBook?: PublicCatalogBook) {
  if (!anchorBook) {
    return 0;
  }

  let score = 0;
  if (book.category && anchorBook.category && book.category === anchorBook.category) {
    score += 2;
  }

  const anchorTags = new Set(anchorBook.tags ?? []);
  if ((book.tags ?? []).some((tag) => anchorTags.has(tag))) {
    score += 1;
  }

  return score;
}

function sortBooksByTitle(books: PublicCatalogBook[]) {
  return [...books].sort((a, b) => a.title.localeCompare(b.title));
}

function sortBooksByRecentProgress(
  books: PublicCatalogBook[],
  latestProgressByBook: Record<string, ReadingProgress | undefined>,
) {
  return [...books].sort((a, b) => {
    const aProgress = latestProgressByBook[a.id];
    const bProgress = latestProgressByBook[b.id];
    if (!aProgress && !bProgress) return a.title.localeCompare(b.title);
    if (!aProgress) return 1;
    if (!bProgress) return -1;
    return getTimeValue(bProgress.updatedAt) - getTimeValue(aProgress.updatedAt);
  });
}

function sortBooksForYou({
  books,
  remoteBooks,
  latestProgressByBook,
  completionMap,
  completedBookIdSet,
  activePlanBookIds,
}: {
  books: PublicCatalogBook[];
  remoteBooks: PublicCatalogBook[];
  latestProgressByBook: Record<string, ReadingProgress | undefined>;
  completionMap: Record<string, { bookId: string; completedAt: string }>;
  completedBookIdSet: Set<string>;
  activePlanBookIds: Set<string>;
}) {
  const visibleBookIds = new Set(books.map((book) => book.id));
  const booksById = new Map(remoteBooks.map((book) => [book.id, book]));
  const shownBookIds = new Set<string>();

  const inProgressBooks = sortBooksByRecentProgress(
    books.filter((book) => latestProgressByBook[book.id] && !completedBookIdSet.has(book.id)),
    latestProgressByBook,
  );

  const anchorBook =
    inProgressBooks[0] ??
    Object.values(completionMap)
      .sort((a, b) => getTimeValue(b.completedAt) - getTimeValue(a.completedAt))
      .map((completion) => booksById.get(completion.bookId))
      .find(Boolean);

  const orderedBooks: PublicCatalogBook[] = [];
  const pushBook = (book?: PublicCatalogBook) => {
    if (!book || shownBookIds.has(book.id) || !visibleBookIds.has(book.id)) {
      return;
    }

    shownBookIds.add(book.id);
    orderedBooks.push(book);
  };

  inProgressBooks.forEach(pushBook);

  const visitedChainIds = new Set<string>();
  let currentBook = anchorBook;
  for (let index = 0; index < 10; index += 1) {
    const nextBookId = currentBook?.nextRecommendedBookId;
    if (!nextBookId || visitedChainIds.has(nextBookId)) {
      break;
    }

    visitedChainIds.add(nextBookId);
    const nextBook = booksById.get(nextBookId);
    if (!nextBook) {
      break;
    }

    pushBook(nextBook);
    currentBook = nextBook;
  }

  const remainingBooks = books
    .filter((book) => !shownBookIds.has(book.id))
    .sort((a, b) => {
      const aCompleted = completedBookIdSet.has(a.id) ? 1 : 0;
      const bCompleted = completedBookIdSet.has(b.id) ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;

      const aPlan = activePlanBookIds.has(a.id) ? 1 : 0;
      const bPlan = activePlanBookIds.has(b.id) ? 1 : 0;
      if (aPlan !== bPlan) return bPlan - aPlan;

      const sharedSignal = getSharedSignalScore(b, anchorBook) - getSharedSignalScore(a, anchorBook);
      if (sharedSignal !== 0) return sharedSignal;

      return a.title.localeCompare(b.title);
    });

  return [...orderedBooks, ...remainingBooks];
}

function getDownloadButtonLabel({
  canDownload,
  isDownloading,
  isFullyDownloaded,
  progressPercent,
}: {
  canDownload: boolean;
  isDownloading: boolean;
  isFullyDownloaded: boolean;
  progressPercent: number;
}) {
  if (isDownloading) {
    return progressPercent > 0 ? `Saving... ${progressPercent}%` : "Saving...";
  }

  if (isFullyDownloaded) {
    return "Remove Download";
  }

  if (!canDownload) {
    return "";
  }

  return "Save Offline";
}

function getSelectablePillColors({
  selected,
  colors,
}: {
  selected: boolean;
  colors: ReturnType<typeof useAppTheme>["colors"];
}) {
  return {
    backgroundColor: selected ? colors.accent : colors.surfaceMuted,
    textColor: selected ? colors.text : colors.textMuted,
  };
}

function SkeletonBlock({
  width,
  height,
  color,
  radius = 999,
}: {
  width: number | `${number}%`;
  height: number;
  color: string;
  radius?: number;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: color,
      }}
    />
  );
}

function LibrarySkeleton() {
  const { colors, resolvedTheme } = useAppTheme();
  const skeletonAccent = resolvedTheme === "dark" ? colors.surfaceSoft : "#F0E1A7";
  const skeletonText = resolvedTheme === "dark" ? colors.surfaceMuted : "#E2D3AA";
  const skeletonBody = resolvedTheme === "dark" ? colors.surfaceElevated : "#E9DCBA";
  const skeletonSoft = resolvedTheme === "dark" ? colors.surface : "#F1E8D1";
  const heroMuted = resolvedTheme === "dark" ? colors.overlayMuted : "rgba(255, 249, 234, 0.16)";
  const heroStrong = resolvedTheme === "dark" ? colors.overlayLight : "rgba(255, 249, 234, 0.24)";

  return (
    <>
      <HeroCard>
        <SkeletonBlock width={136} height={14} color={heroMuted} />
        <View style={{ flexDirection: "row", gap: 16 }}>
          <SkeletonBlock width={90} height={126} color={heroStrong} radius={8} />
          <View style={{ flex: 1, gap: 10, justifyContent: "center" }}>
            <SkeletonBlock width="92%" height={26} color={heroStrong} />
            <SkeletonBlock width="68%" height={18} color={heroMuted} />
            <SkeletonBlock width={84} height={16} color={heroMuted} />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          <SkeletonBlock width={132} height={44} color={skeletonAccent} />
          <SkeletonBlock width={92} height={44} color={heroMuted} />
          <SkeletonBlock width={116} height={44} color={heroMuted} />
        </View>
      </HeroCard>

      <View style={{ gap: 14, paddingHorizontal: spacing.page }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            paddingHorizontal: 18,
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <SkeletonBlock width={18} height={18} color={skeletonText} />
          <SkeletonBlock width="54%" height={18} color={skeletonSoft} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <SkeletonBlock width={58} height={14} color={skeletonText} />
          <SkeletonBlock width={4} height={4} color={skeletonText} />
          <SkeletonBlock width={64} height={14} color={skeletonText} />
          <SkeletonBlock width={4} height={4} color={skeletonText} />
          <SkeletonBlock width={84} height={14} color={skeletonText} />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingLeft: spacing.page, paddingRight: spacing.page }}
      >
        <SkeletonBlock width={54} height={38} color={skeletonAccent} />
        <SkeletonBlock width={98} height={38} color={skeletonBody} />
        <SkeletonBlock width={112} height={38} color={skeletonBody} />
        <SkeletonBlock width={82} height={38} color={skeletonBody} />
      </ScrollView>

      <View style={{ gap: 12, paddingHorizontal: spacing.page }}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={{ flexDirection: "row", gap: 12 }}>
            {[0, 1].map((column) => (
              <View
                key={column}
                style={{
                  flex: 1,
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <SkeletonBlock width={100} height={140} color={skeletonBody} radius={8} />
                <View style={{ alignItems: "center", gap: 8, width: "100%" }}>
                  <SkeletonBlock width="86%" height={18} color={skeletonText} />
                  <SkeletonBlock width="68%" height={14} color={skeletonSoft} />
                  <SkeletonBlock width="48%" height={14} color={skeletonSoft} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </>
  );
}

function ResumeReadingHero({
  candidates,
  index,
  onChangeIndex,
  latestProgressByBook,
}: {
  candidates: PublicCatalogBook[];
  index: number;
  onChangeIndex: (nextIndex: number) => void;
  latestProgressByBook: Record<string, ReadingProgress | undefined>;
}) {
  const { colors } = useAppTheme();
  const activeBook = candidates[index];
  const activeProgress = activeBook ? latestProgressByBook[activeBook.id] : undefined;

  const [contentWidth, setContentWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const isAnimatingRef = useRef(false);

  const canAdvance = candidates.length > 1;

  const { manifest, metadata, selectedLanguage, selectedVolume } = useRemoteBookData(
    activeBook?.id ?? "",
    activeProgress?.languageId,
    activeProgress?.volumeId,
  );
  const { canDownload, downloadAll, isDownloading, isFullyDownloaded, progressPercent, removeDownload } =
    useVolumeDownload(manifest);

  const downloadButtonLabel = getDownloadButtonLabel({
    canDownload,
    isDownloading,
    isFullyDownloaded,
    progressPercent,
  });
  const readerLanguageId =
    selectedLanguage?.id ?? activeProgress?.languageId ?? metadata?.languages[0]?.id ?? "english";
  const readerVolumeId =
    selectedVolume?.id ??
    activeProgress?.volumeId ??
    selectedLanguage?.volumes[0]?.id ??
    metadata?.languages[0]?.volumes[0]?.id ??
    "volume1";
  const readerPage = activeProgress?.page ?? 1;

  const advance = useCallback(() => {
    if (!canAdvance) {
      return;
    }

    if (isAnimatingRef.current) {
      return;
    }

    const nextIndex = (index + 1) % candidates.length;

    // If we can't measure width yet, fall back to a non-animated advance.
    if (contentWidth <= 0) {
      onChangeIndex(nextIndex);
      return;
    }

    isAnimatingRef.current = true;
    const slideDistance = contentWidth + 24;

    Animated.timing(translateX, {
      toValue: -slideDistance,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      translateX.setValue(slideDistance);
      onChangeIndex(nextIndex);
      requestAnimationFrame(() => {
        Animated.timing(translateX, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          isAnimatingRef.current = false;
        });
      });
    });
  }, [canAdvance, candidates.length, contentWidth, index, onChangeIndex, translateX]);

  return (
    <HeroCard>
      <Text
        style={{
          color: colors.textOnDark,
          fontSize: typography.label,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Continue Reading
      </Text>

      <View style={{ position: "relative" }}>
        <View
          onLayout={(event) => {
            setContentWidth(event.nativeEvent.layout.width);
          }}
          style={{ overflow: "hidden" }}
        >
          <Animated.View style={{ transform: [{ translateX }] }}>
            <View style={{ flexDirection: "row", gap: 16 }}>
              {/* Cover Thumbnail */}
              <View
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              >
                {activeBook?.coverImage ? (
                  <Image
                    source={{ uri: activeBook.coverImage }}
                    contentFit="cover"
                    transition={120}
                    style={{
                      width: 90,
                      height: 126,
                      borderRadius: 8,
                      backgroundColor: colors.surfaceMuted,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 90,
                      height: 126,
                      borderRadius: 8,
                      backgroundColor: colors.accent,
                    }}
                  />
                )}
              </View>

              {/* Book Info */}
              <View style={{ flex: 1, gap: spacing.gapMd, justifyContent: "center" }}>
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: colors.textOnDark,
                      fontSize: typography.title,
                      fontWeight: "800",
                    }}
                    numberOfLines={2}
                  >
                    {activeBook?.title ?? ""}
                  </Text>
                  <Text
                    style={{
                      color: colors.textOnDarkMuted,
                      fontSize: typography.body,
                      lineHeight: 22,
                    }}
                    numberOfLines={1}
                  >
                    {activeBook?.subtitle ?? "Reading edition"}
                  </Text>
                  <Text
                    style={{
                      color: colors.textOnDarkSubtle,
                      fontSize: typography.bodySmall,
                      lineHeight: 22,
                    }}
                  >
                    {getContinueLine(activeProgress?.page)}
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {canAdvance ? (
          <Pressable
            onPress={advance}
            hitSlop={10}
            style={{
              position: "absolute",
              right: -8,
              top: 44,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.overlayLight,
              borderWidth: 1,
              borderColor: colors.overlayMuted,
            }}
            accessibilityRole="button"
            accessibilityLabel="Next in-progress book"
          >
            <Ionicons name="chevron-forward" size={22} color={colors.textOnDark} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Link
          href={
            activeBook
              ? (`/reader/${activeBook.id}/${readerLanguageId}/${readerVolumeId}/${readerPage}` as const)
              : ("/" as const)
          }
          asChild
        >
          <Pressable
            style={{
              borderRadius: radii.pill,
              backgroundColor: colors.accent,
              paddingHorizontal: 20,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: typography.bodySmall,
                fontWeight: "800",
              }}
            >
              {activeProgress?.page ? "Resume Reading" : "Start Reading"}
            </Text>
          </Pressable>
        </Link>

        <Link
          href={activeBook ? (`/book/${activeBook.id}` as const) : ("/" as const)}
          asChild
        >
          <Pressable
            style={{
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.textOnDarkMuted,
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                color: colors.textOnDark,
                fontSize: typography.control,
                fontWeight: "800",
              }}
            >
              View Book
            </Text>
          </Pressable>
        </Link>

        {canDownload ? (
          <Pressable
            onPress={() => {
              void (isFullyDownloaded ? removeDownload() : downloadAll());
            }}
            style={{
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.textOnDarkMuted,
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                color: colors.textOnDark,
                fontSize: typography.control,
                fontWeight: "800",
              }}
            >
              {downloadButtonLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </HeroCard>
  );
}

function LibraryBookCard({
  bookId,
  title,
  coverImage,
  preferredLanguageId,
}: {
  bookId: string;
  title: string;
  coverImage?: string;
  preferredLanguageId?: string;
}) {
  const { colors } = useAppTheme();

  return (
    <Link
      href={
        preferredLanguageId
          ? (`/book/${bookId}?languageId=${preferredLanguageId}` as const)
          : (`/book/${bookId}` as const)
      }
      asChild
    >
      <Pressable
        style={{
          overflow: "hidden",
          paddingVertical: 4,
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Cover Image with Shadow */}
        <View
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          {coverImage ? (
            <Image
              source={{ uri: coverImage }}
              contentFit="cover"
              transition={120}
              style={{
                width: 100,
                height: 140,
                borderRadius: 8,
                backgroundColor: colors.surfaceMuted,
              }}
            />
          ) : (
            <View
              style={{
                width: 100,
                height: 140,
                borderRadius: 8,
                backgroundColor: colors.accentStrong,
              }}
            />
          )}
        </View>

        {/* Book Info */}
        <View style={{ gap: 6, alignItems: "center", width: "100%" }}>
          <Text
            style={{
              color: colors.text,
              fontSize: typography.subtitle,
              fontWeight: "800",
              textAlign: "center",
            }}
            numberOfLines={2}
          >
            {title}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

export default function LibraryScreen() {
  const { colors } = useAppTheme();
  const { error, isLoaded, latestProgressByBook, refreshProgress } = useReadingProgress();
  const { completedBookIds, completionMap, refreshCompletions } = useBookCompletions();
  const { activePlanMap, refreshPlans } = useReadingPlans();
  const {
    catalog,
    error: catalogError,
    hasRemoteCatalog,
    isConfigured: isCatalogConfigured,
    isLoading: isCatalogLoading,
  } = useRemoteCatalog();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [sortBy, setSortBy] = useState<LibrarySortMode>("forYou");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showLanguageMenu, setShowLanguageMenu] = useState<boolean>(false);
  const [bookMetadataMap, setBookMetadataMap] = useState<Record<string, { languages: LibraryLanguagePreference[] }>>({});
  const [resumeIndex, setResumeIndex] = useState(0);
  const hasLoadedLanguagePreferenceRef = useRef(false);
  const allCategoryPillColors = getSelectablePillColors({
    selected: selectedCategory === "all",
    colors,
  });
  const shouldShowLibrarySkeleton = !isLoaded || isCatalogLoading;

  useFocusEffect(
    useCallback(() => {
      void refreshProgress();
      void refreshCompletions();
      void refreshPlans();
    }, [refreshCompletions, refreshPlans, refreshProgress]),
  );

  useEffect(() => {
    let isMounted = true;

    void loadLibraryLanguagePreference().then((preference) => {
      if (!isMounted) {
        return;
      }

      if (preference?.title) {
        setSelectedLanguage(preference.title);
      }

      hasLoadedLanguagePreferenceRef.current = true;
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const remoteBooks = useMemo(() => catalog?.books ?? [], [catalog?.books]);
  const completedBookIdSet = useMemo(() => new Set(completedBookIds), [completedBookIds]);
  const activePlanBookIds = useMemo(
    () => new Set(Object.values(activePlanMap).map((plan) => plan.bookId)),
    [activePlanMap],
  );
  const inProgressBooks = useMemo(
    () =>
      remoteBooks.filter(
        (book) => latestProgressByBook[book.id] && !completedBookIdSet.has(book.id),
      ),
    [completedBookIdSet, latestProgressByBook, remoteBooks],
  );

  const sortedInProgressBooks = useMemo(() => {
    return sortBooksByRecentProgress(inProgressBooks, latestProgressByBook);
  }, [inProgressBooks, latestProgressByBook]);

  const resumeCandidates = sortedInProgressBooks.length > 0 ? sortedInProgressBooks : remoteBooks;

  useEffect(() => {
    // Keep index valid when the candidate list changes (e.g. after progress refresh).
    if (resumeIndex >= resumeCandidates.length) {
      setResumeIndex(0);
    }
  }, [resumeCandidates.length, resumeIndex]);

  // In-progress content is surfaced via the resume hero carousel.

  // Load metadata for all books to get language information
  useEffect(() => {
    const loadAllMetadata = async () => {
      const metadataPromises = remoteBooks.map(async (book) => {
        if (!book.metadataUrl) return null;
        try {
          const response = await fetch(book.metadataUrl);
          const metadata = await response.json();
          return {
            bookId: book.id,
            languages:
              metadata.languages?.map((lang: { id: string; title: string }) => ({
                id: lang.id,
                title: lang.title,
              })) || [],
          };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(metadataPromises);
      const metadataMap: Record<string, { languages: LibraryLanguagePreference[] }> = {};
      results.forEach((result) => {
        if (result) {
          metadataMap[result.bookId] = { languages: result.languages };
        }
      });
      setBookMetadataMap(metadataMap);
    };

    if (remoteBooks.length > 0) {
      void loadAllMetadata();
    }
  }, [remoteBooks]);

  // Extract unique categories
  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    remoteBooks.forEach((book) => {
      const category = getCategoryDisplayLabel({
        category: book.category,
        categoryLabel: book.categoryLabel,
      });
      categories.add(category);
    });
    return Array.from(categories).sort();
  }, [remoteBooks]);

  // Extract unique languages from loaded metadata
  const uniqueLanguages = useMemo(() => {
    const languagesByTitle = new Map<string, LibraryLanguagePreference>();
    Object.values(bookMetadataMap).forEach((metadata) => {
      metadata.languages.forEach((language) => {
        languagesByTitle.set(language.title, language);
      });
    });
    return Array.from(languagesByTitle.values()).sort((left, right) =>
      left.title.localeCompare(right.title),
    );
  }, [bookMetadataMap]);

  useEffect(() => {
    if (!hasLoadedLanguagePreferenceRef.current) {
      return;
    }

    if (selectedLanguage !== "all" && uniqueLanguages.length === 0) {
      return;
    }

    const preference = uniqueLanguages.find((language) => language.title === selectedLanguage);
    void saveLibraryLanguagePreference(preference ?? null);
  }, [selectedLanguage, uniqueLanguages]);

  // Filter and sort books
  const filteredAndSortedBooks = useMemo(() => {
    let books = remoteBooks;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      books = books.filter((book) => {
        return (
          book.title.toLowerCase().includes(query) ||
          book.subtitle?.toLowerCase().includes(query) ||
          book.author?.toLowerCase().includes(query) ||
          getCategoryDisplayLabel({
            category: book.category,
            categoryLabel: book.categoryLabel,
          })
            .toLowerCase()
            .includes(query)
        );
      });
    }

    // Category filter
    if (selectedCategory !== "all") {
      books = books.filter((book) => {
        const bookCategory = getCategoryDisplayLabel({
          category: book.category,
          categoryLabel: book.categoryLabel,
        });
        return bookCategory === selectedCategory;
      });
    }

    // Language filter
    if (selectedLanguage !== "all") {
      books = books.filter((book) => {
        const metadata = bookMetadataMap[book.id];
        return metadata?.languages.some((language) => language.title === selectedLanguage);
      });
    }

    // Sort
    if (sortBy === "alpha") {
      books = sortBooksByTitle(books);
    } else if (sortBy === "recent") {
      books = sortBooksByRecentProgress(books, latestProgressByBook);
    } else {
      books = sortBooksForYou({
        books,
        remoteBooks,
        latestProgressByBook,
        completionMap,
        completedBookIdSet,
        activePlanBookIds,
      });
    }

    return books;
  }, [
    remoteBooks,
    searchQuery,
    selectedCategory,
    selectedLanguage,
    sortBy,
    latestProgressByBook,
    completionMap,
    completedBookIdSet,
    activePlanBookIds,
    bookMetadataMap,
  ]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 5,
          paddingHorizontal: spacing.page,
          gap: spacing.gap3xl,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Language menu overlay - close menu when tapping outside */}
        {showLanguageMenu ? (
          <Pressable
            onPress={() => setShowLanguageMenu(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
          />
        ) : null}

        {error ? (
          <ErrorCard
            title="Progress unavailable"
            message="Saved reading progress could not be restored for this session."
          />
        ) : null}
        {catalogError ? (
          <ErrorCard
            title="Library unavailable"
            message="The library could not be loaded right now."
          />
        ) : null}
        {!isCatalogConfigured ? (
          <ErrorCard
            title="Library unavailable"
            message="The library is not available in this build."
          />
        ) : null}
        {isCatalogConfigured && !isCatalogLoading && !catalogError && !hasRemoteCatalog ? (
          <ErrorCard title="No books yet" message="The library does not contain any books yet." />
        ) : null}

        {shouldShowLibrarySkeleton ? <LibrarySkeleton /> : null}

        {!shouldShowLibrarySkeleton && resumeCandidates.length > 0 ? (
          <ResumeReadingHero
            candidates={resumeCandidates}
            index={resumeIndex}
            onChangeIndex={setResumeIndex}
            latestProgressByBook={latestProgressByBook}
          />
        ) : null}


        {!shouldShowLibrarySkeleton ? (
          <View style={{ gap: 14, paddingHorizontal: spacing.page }}>
          {/* Search Bar */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              paddingHorizontal: 18,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>🔍</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search books..."
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: typography.body,
                padding: 0,
              }}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <Text style={{ color: colors.textMuted, fontSize: typography.body }}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Filters and Sort */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <MetaText>{filteredAndSortedBooks.length} books</MetaText>
            <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>•</Text>
            <Pressable
              onPress={() => {
                setSortBy(getNextLibrarySortMode(sortBy));
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <MetaText>{librarySortLabels[sortBy]}</MetaText>
              <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>▾</Text>
            </Pressable>
            {uniqueLanguages.length > 0 ? (
              <>
                <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>•</Text>
                <View style={{ position: "relative" }}>
                  <Pressable
                    onPress={() => setShowLanguageMenu(!showLanguageMenu)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <MetaText>{selectedLanguage === "all" ? "All" : selectedLanguage}</MetaText>
                    <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>▾</Text>
                  </Pressable>
                  {showLanguageMenu ? (
                    <View
                      style={{
                        position: "absolute",
                        top: 24,
                        right: 0,
                        backgroundColor: colors.surface,
                        borderRadius: radii.md,
                        paddingVertical: 8,
                        minWidth: 120,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 4,
                        zIndex: 1000,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          setSelectedLanguage("all");
                          setShowLanguageMenu(false);
                        }}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          backgroundColor:
                            selectedLanguage === "all" ? colors.surfaceMuted : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: typography.bodySmall,
                            fontWeight: selectedLanguage === "all" ? "800" : "400",
                          }}
                        >
                          All Languages
                        </Text>
                      </Pressable>
                      {uniqueLanguages.map((language) => (
                        <Pressable
                          key={language.id}
                          onPress={() => {
                            setSelectedLanguage(language.title);
                            setShowLanguageMenu(false);
                          }}
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            backgroundColor:
                              selectedLanguage === language.title ? colors.surfaceMuted : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              color: colors.text,
                              fontSize: typography.bodySmall,
                              fontWeight: selectedLanguage === language.title ? "800" : "400",
                            }}
                          >
                            {language.title}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>
          </View>
        ) : null}

        {/* Category Filter Chips */}
        {!shouldShowLibrarySkeleton ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingLeft: spacing.page, paddingRight: spacing.page }}
          >
            <Pressable
              onPress={() => setSelectedCategory("all")}
              style={{
                borderRadius: radii.pill,
                backgroundColor: allCategoryPillColors.backgroundColor,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  color: allCategoryPillColors.textColor,
                  fontSize: typography.control,
                  fontWeight: "800",
                }}
              >
                All
              </Text>
            </Pressable>
            {uniqueCategories.map((category) => {
              const pillColors = getSelectablePillColors({
                selected: selectedCategory === category,
                colors,
              });

              return (
                <Pressable
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  style={{
                    borderRadius: radii.pill,
                    backgroundColor: pillColors.backgroundColor,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <Text
                    style={{
                      color: pillColors.textColor,
                      fontSize: typography.control,
                      fontWeight: "800",
                    }}
                  >
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {!shouldShowLibrarySkeleton ? (
          <View style={{ gap: spacing.gapXl }}>
            <FlatList
              data={filteredAndSortedBooks}
              keyExtractor={(book: PublicCatalogBook) => book.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={{
                gap: 12,
                paddingHorizontal: spacing.page,
              }}
              contentContainerStyle={{
                gap: 12,
              }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: spacing.gapXl }}>
                  <MetaText>No books found in this category.</MetaText>
                </View>
              }
              renderItem={({ item: book }: { item: PublicCatalogBook }) => (
                <View style={{ flex: 1 }}>
                  <LibraryBookCard
                    bookId={book.id}
                    title={book.title}
                    coverImage={book.coverImage}
                    preferredLanguageId={
                      bookMetadataMap[book.id]?.languages.find(
                        (language) => language.title === selectedLanguage,
                      )?.id
                    }
                  />
                </View>
              )}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

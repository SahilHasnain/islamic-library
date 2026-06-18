import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";

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
import {
  loadLibraryLanguagePreference,
  saveLibraryLanguagePreference,
  type LibraryLanguagePreference,
} from "../../lib/library-language-preference";

type LibraryLanguageOption = LibraryLanguagePreference & {
  coverImage?: string;
};

function withCacheBust(url: string, cacheKey: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
}

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

const librarySortOptions: LibrarySortMode[] = ["forYou", "recent", "alpha"];

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

function addWeightedCount(map: Map<string, number>, key: string | undefined, weight: number) {
  const normalizedKey = key?.trim();
  if (!normalizedKey) {
    return;
  }

  map.set(normalizedKey, (map.get(normalizedKey) ?? 0) + weight);
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
  const catalogRank = new Map(remoteBooks.map((book, index) => [book.id, index]));
  const incomingRecommendationCount = new Map<string, number>();
  remoteBooks.forEach((book) => {
    if (book.nextRecommendedBookId) {
      incomingRecommendationCount.set(
        book.nextRecommendedBookId,
        (incomingRecommendationCount.get(book.nextRecommendedBookId) ?? 0) + 1,
      );
    }
  });
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
  const categoryAffinity = new Map<string, number>();
  const authorAffinity = new Map<string, number>();
  const tagAffinity = new Map<string, number>();
  sortBooksByRecentProgress(
    remoteBooks.filter((book) => latestProgressByBook[book.id]),
    latestProgressByBook,
  )
    .slice(0, 5)
    .forEach((book, index) => {
      const weight = Math.max(1, 5 - index);
      addWeightedCount(categoryAffinity, book.category, weight * 2);
      addWeightedCount(authorAffinity, book.author, weight);
      (book.tags ?? []).forEach((tag) => addWeightedCount(tagAffinity, tag, weight));
    });

  Object.values(completionMap)
    .sort((a, b) => getTimeValue(b.completedAt) - getTimeValue(a.completedAt))
    .slice(0, 5)
    .forEach((completion, index) => {
      const book = booksById.get(completion.bookId);
      const weight = Math.max(1, 4 - index);
      addWeightedCount(categoryAffinity, book?.category, weight);
      addWeightedCount(authorAffinity, book?.author, weight * 0.5);
      (book?.tags ?? []).forEach((tag) => addWeightedCount(tagAffinity, tag, weight * 0.5));
    });

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
      const getForYouScore = (book: PublicCatalogBook) => {
        let score = 0;
        if (activePlanBookIds.has(book.id)) score += 30;
        if (book.nextRecommendedBookId && visibleBookIds.has(book.nextRecommendedBookId)) score += 18;
        score += (incomingRecommendationCount.get(book.id) ?? 0) * 10;
        score += getSharedSignalScore(book, anchorBook) * 12;
        score += book.category ? (categoryAffinity.get(book.category) ?? 0) * 3 : 0;
        score += book.author ? (authorAffinity.get(book.author) ?? 0) * 2 : 0;
        score += (book.tags ?? []).reduce((total, tag) => total + (tagAffinity.get(tag) ?? 0), 0);
        score += Math.max(0, 8 - (catalogRank.get(book.id) ?? 999) * 0.1);
        if (completedBookIdSet.has(book.id)) score -= 40;
        return score;
      };

      const scoreDifference = getForYouScore(b) - getForYouScore(a);
      if (scoreDifference !== 0) return scoreDifference;

      return a.title.localeCompare(b.title);
    });

  return [...orderedBooks, ...remainingBooks];
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
  const readerLanguageId =
    selectedLanguage?.id ?? activeProgress?.languageId ?? metadata?.languages[0]?.id ?? "english";
  const readerVolumeId =
    selectedVolume?.id ??
    activeProgress?.volumeId ??
    selectedLanguage?.volumes[0]?.id ??
    metadata?.languages[0]?.volumes[0]?.id ??
    "volume1";
  const readerPage = activeProgress?.page ?? 1;
  const heroCoverImage = manifest?.coverImage
    ? withCacheBust(manifest.coverImage, `${manifest.version}-${readerLanguageId}-${readerVolumeId}`)
    : activeBook?.coverImage;

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
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.xl,
        padding: spacing.hero,
        gap: spacing.gapLg,
      }}
    >
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
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.16,
                  shadowRadius: 5,
                  elevation: 3,
                }}
              >
                {heroCoverImage ? (
                  <Image
                    source={{ uri: heroCoverImage }}
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
                      color: colors.text,
                      fontSize: typography.title,
                      fontWeight: "800",
                    }}
                    numberOfLines={2}
                  >
                    {activeBook?.title ?? ""}
                  </Text>
                  {activeBook?.subtitle ? (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: typography.body,
                        lineHeight: 22,
                      }}
                      numberOfLines={1}
                    >
                      {activeBook.subtitle}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      color: colors.textMuted,
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

      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
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
                backgroundColor: colors.surfaceMuted,
                paddingHorizontal: 16,
                paddingVertical: 13,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: typography.control,
                  fontWeight: "800",
                }}
              >
                View Book
              </Text>
            </Pressable>
          </Link>
        </View>

        {canAdvance ? (
          <Pressable
            onPress={advance}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surfaceMuted,
            }}
            accessibilityRole="button"
            accessibilityLabel="Next in-progress book"
          >
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const refineButtonRef = useRef<any>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number; maxHeight: number } | null>(null);
  const showRefineMenu = menuAnchor !== null;

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAuthor, setSelectedAuthor] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [sortBy, setSortBy] = useState<LibrarySortMode>("forYou");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchVisible, setIsSearchVisible] = useState<boolean>(false);
  const [bookMetadataMap, setBookMetadataMap] = useState<Record<string, { languages: LibraryLanguageOption[] }>>({});
  const [resumeIndex, setResumeIndex] = useState(0);
  const hasLoadedLanguagePreferenceRef = useRef(false);
  const searchInputRef = useRef<TextInput>(null);
  const allCategoryPillColors = getSelectablePillColors({
    selected: selectedCategory === "all",
    colors,
  });
  const refineCount = (sortBy !== "forYou" ? 1 : 0) + (selectedAuthor !== "all" ? 1 : 0);
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

  useEffect(() => {
    if (!isSearchVisible) {
      return;
    }

    const focusHandle = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 80);

    return () => clearTimeout(focusHandle);
  }, [isSearchVisible]);

  const remoteBooks = useMemo(() => catalog?.books ?? [], [catalog?.books]);
  const catalogCacheKey = catalog?.version ?? catalog?.generatedAt ?? "library";
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
          const response = await fetch(withCacheBust(book.metadataUrl, catalogCacheKey), {
            headers: {
              Accept: "application/json",
              "Cache-Control": "no-cache",
            },
          });
          const metadata = await response.json();
          const languages = await Promise.all(
            (metadata.languages ?? []).map(
              async (language: {
                id: string;
                title: string;
                defaultVolumeId?: string;
                volumes?: { id: string; manifestUrl?: string; order?: number }[];
              }) => {
                const orderedVolumes = [...(language.volumes ?? [])].sort((left, right) => {
                  const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
                  const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
                  if (leftOrder !== rightOrder) {
                    return leftOrder - rightOrder;
                  }

                  return left.id.localeCompare(right.id);
                });
                const volume =
                  orderedVolumes.find((candidate) => candidate.id === language.defaultVolumeId) ??
                  orderedVolumes[0];

                if (!volume?.manifestUrl) {
                  return { id: language.id, title: language.title };
                }

                try {
                  const manifestResponse = await fetch(
                    withCacheBust(volume.manifestUrl, catalogCacheKey),
                    {
                      headers: {
                        Accept: "application/json",
                        "Cache-Control": "no-cache",
                      },
                    },
                  );
                  const manifest = await manifestResponse.json();
                  const coverImage = manifest.coverImage
                    ? withCacheBust(
                        manifest.coverImage as string,
                        `${manifest.version ?? catalogCacheKey}-${language.id}`,
                      )
                    : undefined;
                  return {
                    id: language.id,
                    title: language.title,
                    coverImage,
                  };
                } catch {
                  return { id: language.id, title: language.title };
                }
              },
            ),
          );

          return {
            bookId: book.id,
            languages,
          };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(metadataPromises);
      const metadataMap: Record<string, { languages: LibraryLanguageOption[] }> = {};
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
  }, [catalogCacheKey, remoteBooks]);

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

  const uniqueAuthors = useMemo(() => {
    const authors = new Set<string>();
    remoteBooks.forEach((book) => {
      const author = book.author?.trim();
      if (author) {
        authors.add(author);
      }
    });
    return Array.from(authors).sort();
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

    if (selectedAuthor !== "all") {
      books = books.filter((book) => book.author?.trim() === selectedAuthor);
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
    selectedAuthor,
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
      {isSearchVisible ? (
        <View
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 12,
            right: 12,
            zIndex: 5000,
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            paddingHorizontal: 16,
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.12,
            shadowRadius: 14,
            elevation: 10,
          }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 18 }}>🔍</Text>
          <TextInput
            ref={searchInputRef}
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
          <Pressable
            onPress={() => {
              setSearchQuery("");
              setIsSearchVisible(false);
            }}
            hitSlop={10}
          >
            <Text style={{ color: colors.textMuted, fontSize: typography.body }}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 5,
          paddingHorizontal: spacing.page,
          gap: spacing.gap3xl,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >


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
          <View
            style={{
              gap: 14,
              paddingHorizontal: 12,
              position: "relative",
              zIndex: showRefineMenu ? 2000 : 1,
            }}
          >
          {/* Category Filter Chips */}
          <View
            style={{
              backgroundColor: colors.surface,
              marginHorizontal: -(spacing.page + 12),
              paddingVertical: 10,
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                alignItems: "center",
                gap: 10,
                paddingLeft: spacing.page + 12,
                paddingRight: spacing.page + 12,
              }}
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
              <Pressable
                onPress={() => {
                  setIsSearchVisible(true);
                  setMenuAnchor(null);
                }}
                hitSlop={10}
                style={{
                  marginLeft: 2,
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: colors.surfaceMuted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Search library"
              >
                <Text style={{ color: colors.text, fontSize: 17 }}>🔍</Text>
              </Pressable>
              {refineCount > 0 ? (
                <Pressable
                  onPress={() => {
                    setSortBy("forYou");
                    setSelectedAuthor("all");
                    setMenuAnchor(null);
                  }}
                  hitSlop={10}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    borderRadius: radii.pill,
                    backgroundColor: colors.surfaceSoft,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Reset refinements"
                >
                  <Text style={{ color: colors.textMuted, fontSize: typography.caption, fontWeight: "600" }}>✕</Text>
                  <Text style={{ color: colors.textMuted, fontSize: typography.caption, fontWeight: "600" }}>Reset</Text>
                </Pressable>
              ) : null}
              <Pressable
                ref={refineButtonRef}
                onPress={() => {
                  if (menuAnchor) {
                    setMenuAnchor(null);
                  } else {
                    refineButtonRef.current?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
                      const top = y + height + 4;
                      const right = windowWidth - x - width;
                      const maxHeight = windowHeight - top - insets.bottom - 8;
                      setMenuAnchor({ top, right, maxHeight });
                    });
                  }
                }}
                hitSlop={10}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: radii.pill,
                  backgroundColor: showRefineMenu || refineCount > 0 ? colors.surfaceSoft : colors.surfaceMuted,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
                accessibilityRole="button"
                accessibilityLabel="Refine library"
              >
                <Text
                  style={{
                    color: showRefineMenu || refineCount > 0 ? colors.accent : colors.text,
                    fontSize: typography.control,
                    fontWeight: "800",
                  }}
                >
                  Refine{refineCount > 0 ? ` ${refineCount}` : ""}
                </Text>
                <Text
                  style={{
                    color: showRefineMenu || refineCount > 0 ? colors.accent : colors.textMuted,
                    fontSize: typography.caption,
                  }}
                >
                  ▾
                </Text>
              </Pressable>
            </ScrollView>
          </View>
          </View>
        ) : null}

        {!shouldShowLibrarySkeleton ? (
          <View style={{ gap: spacing.gapXl }}>
            <FlatList
              data={filteredAndSortedBooks}
              showsVerticalScrollIndicator={false}
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
                  {(() => {
                    const preferredLanguage = bookMetadataMap[book.id]?.languages.find(
                      (language) => language.title === selectedLanguage,
                    );

                    return (
                      <LibraryBookCard
                        bookId={book.id}
                        title={book.title}
                        coverImage={preferredLanguage?.coverImage ?? book.coverImage}
                        preferredLanguageId={preferredLanguage?.id}
                      />
                    );
                  })()}
                </View>
              )}
            />
          </View>
        ) : null}
      </ScrollView>

      {showRefineMenu && menuAnchor ? (
        <>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setMenuAnchor(null)} />
          <View
            style={{
              position: "absolute",
              top: menuAnchor.top,
              right: menuAnchor.right,
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              padding: 10,
              width: 240,
              maxHeight: menuAnchor.maxHeight,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.12,
              shadowRadius: 18,
              elevation: 8,
              zIndex: 3000,
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.textMuted, fontSize: typography.caption, fontWeight: "800", paddingHorizontal: 6 }}>
                Sort
              </Text>
              <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
                {librarySortOptions.map((sortMode) => {
                  const selected = sortBy === sortMode;

                  return (
                    <Pressable
                      key={sortMode}
                      onPress={() => setSortBy(sortMode)}
                      style={{
                        borderRadius: radii.pill,
                        backgroundColor: selected ? colors.surfaceSoft : colors.surfaceMuted,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: selected ? colors.accent : colors.text,
                          fontSize: typography.caption,
                          fontWeight: "800",
                        }}
                      >
                        {librarySortLabels[sortMode]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {uniqueLanguages.length > 0 ? (
                <View style={{ gap: 8, paddingTop: 16 }}>
                  <Text style={{ color: colors.textMuted, fontSize: typography.caption, fontWeight: "800", paddingHorizontal: 6 }}>
                    Language
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {[{ id: "all", title: "All" }, ...uniqueLanguages].map((language) => {
                      const selected = selectedLanguage === (language.id === "all" ? "all" : language.title);

                      return (
                        <Pressable
                          key={language.id}
                          onPress={() => setSelectedLanguage(language.id === "all" ? "all" : language.title)}
                          style={{
                            borderRadius: radii.pill,
                            backgroundColor: selected ? colors.surfaceSoft : colors.surfaceMuted,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: selected ? colors.accent : colors.text,
                              fontSize: typography.caption,
                              fontWeight: "800",
                            }}
                          >
                            {language.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {uniqueAuthors.length > 0 ? (
                <View style={{ gap: 8, paddingTop: 16 }}>
                  <Text style={{ color: colors.textMuted, fontSize: typography.caption, fontWeight: "800", paddingHorizontal: 6 }}>
                    Author
                  </Text>
                  <View>
                    <Pressable
                      onPress={() => setSelectedAuthor("all")}
                      style={{
                        borderRadius: radii.sm,
                        backgroundColor: selectedAuthor === "all" ? colors.surfaceSoft : "transparent",
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                      }}
                    >
                      <Text
                        style={{
                          color: selectedAuthor === "all" ? colors.accent : colors.text,
                          fontSize: typography.bodySmall,
                          fontWeight: selectedAuthor === "all" ? "800" : "400",
                        }}
                      >
                        All Authors
                      </Text>
                    </Pressable>
                    {uniqueAuthors.map((author) => (
                      <Pressable
                        key={author}
                        onPress={() => setSelectedAuthor(author)}
                        style={{
                          borderRadius: radii.sm,
                          backgroundColor: selectedAuthor === author ? colors.surfaceSoft : "transparent",
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                        }}
                      >
                        <Text
                          style={{
                            color: selectedAuthor === author ? colors.accent : colors.text,
                            fontSize: typography.bodySmall,
                            fontWeight: selectedAuthor === author ? "800" : "400",
                          }}
                          numberOfLines={1}
                        >
                          {author}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

            </ScrollView>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

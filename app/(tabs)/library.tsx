import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";

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

const REFINE_FAB_SIZE = 56;
const REFINE_FAB_MARGIN = 16;
const TAB_BAR_HEIGHT = 56;

const IS_WEB = Platform.OS === "web";

const LIBRARY_LAYOUT = {
  contentMaxWidth: 760,
  gridContentMaxWidth: 1240,
  wideMinViewportWidth: 1024,
  extraColumnMinWidth: 190,
  gutter: 24,
  searchBarMaxWidth: 620,
} as const;

// "For You" ranking model.
// Each signal below is normalized to a 0..1 magnitude before being scaled by its
// weight, so weights are comparable and tunable in isolation.
const FOR_YOU_WEIGHTS = {
  // Book points to another book in the visible list (curated "next" link).
  curatedChain: 40,
  // How many other books explicitly recommend this book (capped).
  incomingRecommendation: 25,
  // Category / tag overlap with the anchor book (recently-read or last completed).
  sharedAnchor: 15,
  // Aggregate affinity across recently-read/completed books.
  categoryAffinity: 8,
  authorAffinity: 14,
  tagAffinity: 6,
  // Early catalog position acts as a mild editorial ordering preference.
  catalogOrder: 3,
} as const;

// Negative: demote already-completed books so the front of the list stays fresh.
const COMPLETION_PENALTY = -20;

// Caps used to normalize unbounded signals into 0..1.
const INCOMING_RECOMMENDATION_CAP = 5;
const AFFINITY_CAP = 10;
const RECENT_AFFINITY_COUNT = 5;
const COMPLETION_AFFINITY_COUNT = 5;

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

function normalizeSignal(value: number, cap: number) {
  return Math.max(0, Math.min(value, cap)) / cap;
}

type ForYouContext = {
  visibleBookIds: Set<string>;
  booksById: Map<string, PublicCatalogBook>;
  catalogRank: Map<string, number>;
  incomingRecommendationCount: Map<string, number>;
  categoryAffinity: Map<string, number>;
  authorAffinity: Map<string, number>;
  tagAffinity: Map<string, number>;
  anchorBook?: PublicCatalogBook;
  completedBookIdSet: Set<string>;
};

function buildForYouContext({
  books,
  remoteBooks,
  latestProgressByBook,
  completionMap,
  completedBookIdSet,
}: {
  books: PublicCatalogBook[];
  remoteBooks: PublicCatalogBook[];
  latestProgressByBook: Record<string, ReadingProgress | undefined>;
  completionMap: Record<string, { bookId: string; completedAt: string }>;
  completedBookIdSet: Set<string>;
}): ForYouContext {
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

  const inProgressBooks = sortBooksByRecentProgress(
    books.filter((book) => latestProgressByBook[book.id]),
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
  inProgressBooks
    .slice(0, RECENT_AFFINITY_COUNT)
    .forEach((book, index) => {
      const weight = Math.max(1, RECENT_AFFINITY_COUNT - index);
      addWeightedCount(categoryAffinity, book.category, weight * 2);
      addWeightedCount(authorAffinity, book.author, weight * 2);
      (book.tags ?? []).forEach((tag) => addWeightedCount(tagAffinity, tag, weight));
    });

  Object.values(completionMap)
    .sort((a, b) => getTimeValue(b.completedAt) - getTimeValue(a.completedAt))
    .slice(0, COMPLETION_AFFINITY_COUNT)
    .forEach((completion, index) => {
      const book = booksById.get(completion.bookId);
      const weight = Math.max(1, COMPLETION_AFFINITY_COUNT - index);
      addWeightedCount(categoryAffinity, book?.category, weight);
      addWeightedCount(authorAffinity, book?.author, weight);
      (book?.tags ?? []).forEach((tag) => addWeightedCount(tagAffinity, tag, weight * 0.5));
    });

  return {
    visibleBookIds,
    booksById,
    catalogRank,
    incomingRecommendationCount,
    categoryAffinity,
    authorAffinity,
    tagAffinity,
    anchorBook,
    completedBookIdSet,
  };
}

function scoreBookForYou(book: PublicCatalogBook, context: ForYouContext) {
  let score = 0;

  // Curated next-link: this book points to another visible book.
  if (book.nextRecommendedBookId && context.visibleBookIds.has(book.nextRecommendedBookId)) {
    score += FOR_YOU_WEIGHTS.curatedChain;
  }

  // Explicit recommendations from other books in the catalog.
  score +=
    normalizeSignal(
      context.incomingRecommendationCount.get(book.id) ?? 0,
      INCOMING_RECOMMENDATION_CAP,
    ) * FOR_YOU_WEIGHTS.incomingRecommendation;

  // Shared signals with the anchor book (0..3 normalized to 0..1).
  score +=
    (getSharedSignalScore(book, context.anchorBook) / 3) * FOR_YOU_WEIGHTS.sharedAnchor;

  // Aggregate affinity from recently-read and completed books.
  if (book.category) {
    score +=
      normalizeSignal(context.categoryAffinity.get(book.category) ?? 0, AFFINITY_CAP) *
      FOR_YOU_WEIGHTS.categoryAffinity;
  }
  if (book.author) {
    score +=
      normalizeSignal(context.authorAffinity.get(book.author) ?? 0, AFFINITY_CAP) *
      FOR_YOU_WEIGHTS.authorAffinity;
  }
  const tagSum = (book.tags ?? []).reduce(
    (total, tag) => total + (context.tagAffinity.get(tag) ?? 0),
    0,
  );
  score += normalizeSignal(tagSum, AFFINITY_CAP) * FOR_YOU_WEIGHTS.tagAffinity;

  // Editorial ordering preference for books appearing earlier in the catalog.
  score +=
    normalizeSignal(
      Math.max(0, 10 - (context.catalogRank.get(book.id) ?? 999)),
      10,
    ) * FOR_YOU_WEIGHTS.catalogOrder;

  // Demote books the reader has already completed.
  if (context.completedBookIdSet.has(book.id)) {
    score += COMPLETION_PENALTY;
  }

  return score;
}

function sortBooksForYou({
  books,
  remoteBooks,
  latestProgressByBook,
  completionMap,
  completedBookIdSet,
}: {
  books: PublicCatalogBook[];
  remoteBooks: PublicCatalogBook[];
  latestProgressByBook: Record<string, ReadingProgress | undefined>;
  completionMap: Record<string, { bookId: string; completedAt: string }>;
  completedBookIdSet: Set<string>;
}) {
  const context = buildForYouContext({
    books,
    remoteBooks,
    latestProgressByBook,
    completionMap,
    completedBookIdSet,
  });

  const shownBookIds = new Set<string>();
  const orderedBooks: PublicCatalogBook[] = [];
  const pushBook = (book?: PublicCatalogBook) => {
    if (!book || shownBookIds.has(book.id) || !context.visibleBookIds.has(book.id)) {
      return;
    }

    shownBookIds.add(book.id);
    orderedBooks.push(book);
  };

  const inProgressBooks = sortBooksByRecentProgress(
    books.filter((book) => latestProgressByBook[book.id] && !completedBookIdSet.has(book.id)),
    latestProgressByBook,
  );
  inProgressBooks.forEach(pushBook);

  // Follow the curated recommendation chain, skipping broken/invisible links
  // so a single missing book can't kill the walk.
  const visitedChainIds = new Set<string>();
  let currentBook = context.anchorBook;
  for (let index = 0; index < 10 && currentBook; index += 1) {
    const nextBookId = currentBook.nextRecommendedBookId;
    if (!nextBookId || visitedChainIds.has(nextBookId)) {
      break;
    }

    visitedChainIds.add(nextBookId);
    currentBook = context.booksById.get(nextBookId);
    if (!currentBook) {
      break;
    }

    pushBook(currentBook);
  }

  const remainingBooks = books
    .filter((book) => !shownBookIds.has(book.id))
    .sort((a, b) => {
      const scoreDifference = scoreBookForYou(b, context) - scoreBookForYou(a, context);
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
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 12 }}>
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
                paddingVertical: 10,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: typography.bodySmall,
                  fontWeight: "800",
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                {activeProgress?.page ? "Resume" : "Start"}
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
                paddingHorizontal: 20,
                paddingVertical: 10,
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: typography.control,
                  fontWeight: "800",
                  textAlign: "center",
                }}
                numberOfLines={1}
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

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;
  const number = parseInt(value, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function rgbToHex([r, g, b]: [number, number, number]) {
  const clamp = (part: number) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function interpolateColor(from: string, to: string, amount: number) {
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  return rgbToHex([
    fromRgb[0] + (toRgb[0] - fromRgb[0]) * amount,
    fromRgb[1] + (toRgb[1] - fromRgb[1]) * amount,
    fromRgb[2] + (toRgb[2] - fromRgb[2]) * amount,
  ]);
}

function GradientFab({
  size,
  colors,
  onPress,
  badge,
  active,
}: {
  size: number;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onPress: () => void;
  badge?: number;
  active?: boolean;
}) {
  const steps = 10;
  const from = active ? colors.accentStrong : colors.accent;
  const to = colors.accentStrong;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Refine library"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
        elevation: 8,
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {Array.from({ length: steps }).map((_, index) => (
          <View
            key={index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: size / steps,
              transform: [{ translateY: (size / steps) * index }],
              backgroundColor: interpolateColor(from, to, index / (steps - 1)),
            }}
          />
        ))}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "rgba(255,255,255,0.12)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={active ? "options" : "options-outline"} size={Math.round(size * 0.44)} color="#1B1206" />
        </View>
      </View>
      {badge && badge > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 5,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceElevated,
            borderWidth: 2,
            borderColor: colors.background,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "800" }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
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
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ search?: string }>();
  const { error, isLoaded, latestProgressByBook, refreshProgress } = useReadingProgress();
  const { completedBookIds, completionMap, refreshCompletions } = useBookCompletions();
  const {
    catalog,
    error: catalogError,
    hasRemoteCatalog,
    isConfigured: isCatalogConfigured,
    isLoading: isCatalogLoading,
  } = useRemoteCatalog();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isWideLayout = IS_WEB && windowWidth >= LIBRARY_LAYOUT.wideMinViewportWidth;
  const contentMaxWidth = isWideLayout
    ? LIBRARY_LAYOUT.gridContentMaxWidth
    : LIBRARY_LAYOUT.contentMaxWidth;
  const contentGutter = IS_WEB ? LIBRARY_LAYOUT.gutter : spacing.page;
  const pageContentContainer = {
    width: "100%",
    maxWidth: contentMaxWidth,
    alignSelf: "center",
    gap: spacing.gap3xl,
    paddingHorizontal: contentGutter,
  } as const;
  const gridColumns = isWideLayout
    ? Math.max(
        3,
        Math.min(
          6,
          Math.floor(
            (Math.min(windowWidth, contentMaxWidth) - contentGutter * 2) / LIBRARY_LAYOUT.extraColumnMinWidth,
          ),
        ),
      )
    : 2;

  const [menuAnchor, setMenuAnchor] = useState<{ bottom: number; right: number; maxHeight: number } | null>(null);
  const showRefineMenu = menuAnchor !== null;

  const languageButtonRef = useRef<View>(null);
  const [languageMenuAnchor, setLanguageMenuAnchor] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const showLanguageMenu = languageMenuAnchor !== null;

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

  function toggleRefineMenu() {
    if (menuAnchor) {
      setMenuAnchor(null);
      return;
    }

    setLanguageMenuAnchor(null);
    const bottom = REFINE_FAB_MARGIN + REFINE_FAB_SIZE + 8;
    const right = REFINE_FAB_MARGIN;
    const maxHeight = windowHeight - insets.top - TAB_BAR_HEIGHT - insets.bottom - bottom - 12;
    setMenuAnchor({ bottom, right, maxHeight: Math.max(120, maxHeight) });
  }

  function toggleLanguageMenu() {
    if (languageMenuAnchor) {
      setLanguageMenuAnchor(null);
      return;
    }

    setMenuAnchor(null);
    languageButtonRef.current?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
      const top = y + height + 6;
      const maxLeft = windowWidth - 160 - 8;
      const left = Math.max(8, Math.min(x, maxLeft));
      const maxHeight = windowHeight - top - insets.bottom - TAB_BAR_HEIGHT - 12;
      setLanguageMenuAnchor({ top, left, maxHeight: Math.max(160, maxHeight) });
    });
  }

  useFocusEffect(
    useCallback(() => {
      void refreshProgress();
      void refreshCompletions();
    }, [refreshCompletions, refreshProgress]),
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

  useEffect(() => {
    if (searchParams.search === "1") {
      setIsSearchVisible(true);
      setMenuAnchor(null);
      setLanguageMenuAnchor(null);
      router.setParams({ search: undefined });
    }
  }, [router, searchParams.search]);

  const remoteBooks = useMemo(() => catalog?.books ?? [], [catalog?.books]);
  const catalogCacheKey = catalog?.version ?? catalog?.generatedAt ?? "library";
  const completedBookIdSet = useMemo(() => new Set(completedBookIds), [completedBookIds]);
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
    bookMetadataMap,
  ]);

  return (
    <Screen>
      {isSearchVisible ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 0,
            right: 0,
            zIndex: 5000,
            paddingHorizontal: 12,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: LIBRARY_LAYOUT.searchBarMaxWidth,
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
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{
          ...pageContentContainer,
          paddingTop: insets.top + 5,
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Pressable
              ref={languageButtonRef}
              onPress={toggleLanguageMenu}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderRadius: radii.pill,
                backgroundColor: showLanguageMenu ? colors.surfaceSoft : colors.surfaceMuted,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose language"
            >
              <Ionicons name="language" size={15} color={colors.accent} />
              <Text
                style={{
                  color: selectedLanguage === "all" ? colors.textMuted : colors.text,
                  fontSize: typography.control,
                  fontWeight: "800",
                }}
              >
                {selectedLanguage === "all" ? "All Languages" : selectedLanguage}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>▾</Text>
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
          </View>
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
            </ScrollView>
          </View>
          </View>
        ) : null}

        {!shouldShowLibrarySkeleton ? (
          <View style={{ gap: spacing.gapXl }}>
            <FlatList
              key={`library-grid-${gridColumns}`}
              data={filteredAndSortedBooks}
              showsVerticalScrollIndicator={false}
              keyExtractor={(book: PublicCatalogBook) => book.id}
              numColumns={gridColumns}
              scrollEnabled={false}
              columnWrapperStyle={{
                gap: 12,
                paddingHorizontal: isWideLayout ? 0 : spacing.page,
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
              bottom: menuAnchor.bottom,
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
                      onPress={() => {
                        setSortBy(sortMode);
                        setMenuAnchor(null);
                      }}
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

              {uniqueAuthors.length > 0 ? (
                <View style={{ gap: 8, paddingTop: 16 }}>
                  <Text style={{ color: colors.textMuted, fontSize: typography.caption, fontWeight: "800", paddingHorizontal: 6 }}>
                    Author
                  </Text>
                  <ScrollView
                    style={{ maxHeight: 160 }}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    <Pressable
                      onPress={() => {
                        setSelectedAuthor("all");
                        setMenuAnchor(null);
                      }}
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
                        onPress={() => {
                          setSelectedAuthor(author);
                          setMenuAnchor(null);
                        }}
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
                  </ScrollView>
                </View>
              ) : null}

            </ScrollView>
          </View>
        </>
      ) : null}

      {showLanguageMenu && languageMenuAnchor ? (
        <>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setLanguageMenuAnchor(null)} />
          <View
            style={{
              position: "absolute",
              top: languageMenuAnchor.top,
              left: languageMenuAnchor.left,
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              padding: 6,
              width: 160,
              maxHeight: 200,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 10,
              elevation: 6,
              zIndex: 3000,
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <Text style={{ color: colors.textMuted, fontSize: typography.caption, fontWeight: "800", paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 }}>
                Language
              </Text>
              {[{ id: "all", title: "All" }, ...uniqueLanguages].map((language) => {
                const selected = selectedLanguage === (language.id === "all" ? "all" : language.title);

                return (
                  <Pressable
                    key={language.id}
                    onPress={() => {
                      setSelectedLanguage(language.id === "all" ? "all" : language.title);
                      setLanguageMenuAnchor(null);
                    }}
                    style={{
                      borderRadius: radii.sm,
                      backgroundColor: selected ? colors.surfaceSoft : "transparent",
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.accent : colors.text,
                        fontSize: typography.caption,
                        fontWeight: selected ? "800" : "400",
                      }}
                    >
                      {language.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      ) : null}

      {!shouldShowLibrarySkeleton ? (
        <View
          style={{
            position: "absolute",
            right: REFINE_FAB_MARGIN,
            bottom: REFINE_FAB_MARGIN,
            zIndex: showRefineMenu ? 1000 : 1500,
          }}
        >
          <GradientFab
            size={REFINE_FAB_SIZE}
            colors={colors}
            onPress={toggleRefineMenu}
            badge={refineCount}
            active={showRefineMenu}
          />
        </View>
      ) : null}
    </Screen>
  );
}

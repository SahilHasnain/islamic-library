import { Image } from "expo-image";
import { Link, Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";

import { ErrorCard } from "../../../components/ui";
import type { PublicBookTocEntry, PublicCatalogBook } from "../../../data/types";
import { useAppTheme } from "../../../hooks/useAppTheme";
import { useBookCompletions } from "../../../hooks/useBookCompletions";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";
import { useReadingProgress } from "../../../hooks/useReadingProgress";
import { useVolumeDownload } from "../../../hooks/useVolumeDownload";
import {
  loadLibraryLanguagePreference,
  type LibraryLanguagePreference,
} from "../../../lib/library-language-preference";

const IS_WEB = Platform.OS === "web";

const BOOK_PAGE_LAYOUT = {
  contentMaxWidth: 760,
  wideContentMaxWidth: 900,
  wideMinViewportWidth: 1024,
  gutter: 24,
  coverWidth: 132,
  coverHeight: 190,
  relatedCardWidth: 248,
};

function SkeletonBlock({
  width,
  height,
  color,
}: {
  width: number | `${number}%`;
  height: number;
  color: string;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 999,
        backgroundColor: color,
      }}
    />
  );
}

function getRelatedBookScore(book: PublicCatalogBook, currentBook?: PublicCatalogBook) {
  if (!currentBook || book.id === currentBook.id) {
    return 0;
  }

  let score = 0;
  if (currentBook.nextRecommendedBookId === book.id) score += 100;
  if (currentBook.recommendations?.some((recommendation) => recommendation.bookId === book.id)) score += 80;
  if (book.category && currentBook.category && book.category === currentBook.category) score += 30;
  if (book.author && currentBook.author && book.author === currentBook.author) score += 30;
  const currentTags = new Set(currentBook.tags ?? []);
  score += (book.tags ?? []).filter((tag) => currentTags.has(tag)).length * 12;
  return score;
}

function getOrderedTocEntries(entries: PublicBookTocEntry[]) {
  return [...entries]
    .filter((entry) => entry.title.trim())
    .sort((left, right) => (left.renderedPage ?? Number.MAX_SAFE_INTEGER) - (right.renderedPage ?? Number.MAX_SAFE_INTEGER));
}

function getTocEntryPage(entry: PublicBookTocEntry) {
  return Math.max(1, Math.floor(entry.renderedPage || entry.printedPage || 1));
}

function toTitleCase(value: string) {
  return value
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === "-") {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

function getSelectableChipColors({
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

function OpenBookFab({
  size,
  colors,
  href,
}: {
  size: number;
  colors: ReturnType<typeof useAppTheme>["colors"];
  href: Href;
}) {
  const steps = 10;

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open book"
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
                backgroundColor: interpolateColor(colors.accent, colors.accentStrong, index / (steps - 1)),
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
            <Ionicons name="book" size={Math.round(size * 0.44)} color="#1B1206" />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

export default function BookHomeScreen() {
  const { colors, resolvedTheme } = useAppTheme();
  const skeletonAccent = resolvedTheme === "dark" ? colors.surfaceSoft : "#F0E1A7";
  const skeletonText = resolvedTheme === "dark" ? colors.surfaceMuted : "#E2D3AA";
  const skeletonBody = resolvedTheme === "dark" ? colors.surfaceElevated : "#E9DCBA";
  const skeletonSoft = resolvedTheme === "dark" ? colors.surface : "#F1E8D1";
  const skeletonOutline = resolvedTheme === "dark" ? colors.overlayMuted : "rgba(255, 249, 234, 0.16)";
  const selectedLanguageColors = getSelectableChipColors({ selected: true, colors });
  const inactiveLanguageColors = getSelectableChipColors({ selected: false, colors });
  const { bookId, languageId: routeLanguageId, volumeId: routeVolumeId } = useLocalSearchParams<{
    bookId: string;
    languageId?: string;
    volumeId?: string;
  }>();
  const readingBookId = Array.isArray(bookId) ? bookId[0] : bookId ?? "";
  const { isLoaded: isProgressLoaded, progress } = useReadingProgress(readingBookId);
  const [selectedLanguageId, setSelectedLanguageId] = useState<string | undefined>(
    Array.isArray(routeLanguageId) ? routeLanguageId[0] : routeLanguageId,
  );
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | undefined>(
    Array.isArray(routeVolumeId) ? routeVolumeId[0] : routeVolumeId,
  );
  const [libraryLanguagePreference, setLibraryLanguagePreference] =
    useState<LibraryLanguagePreference | null>(null);
  const [isLanguagePreferenceLoaded, setIsLanguagePreferenceLoaded] = useState(false);
  const [isTocSheetVisible, setIsTocSheetVisible] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const actionFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showActionFeedback = useMemo(
    () => (message: string) => {
      setActionFeedback(message);
      if (actionFeedbackTimeoutRef.current) {
        clearTimeout(actionFeedbackTimeoutRef.current);
      }
      actionFeedbackTimeoutRef.current = setTimeout(() => {
        setActionFeedback(null);
        actionFeedbackTimeoutRef.current = null;
      }, 2200);
    },
    [],
  );
  const effectiveLanguageId = selectedLanguageId ?? libraryLanguagePreference?.id ?? progress?.languageId;
  const {
    catalogBooks,
    catalogBook,
    isCatalogLoading,
    metadata,
    metadataError,
    isMetadataLoading,
    manifest,
    manifestError,
    isManifestLoading,
    remoteState,
    selectedLanguage,
    selectedVolume,
  } = useRemoteBookData(
    readingBookId,
    effectiveLanguageId,
    selectedVolumeId ?? progress?.volumeId,
  );
  const {
    canDownload,
    downloadAll,
    isDownloading,
    isFullyDownloaded,
    isPartiallyDownloaded,
    progressPercent,
    removeDownload,
  } = useVolumeDownload(manifest);

  const resolvedLanguageId =
    selectedLanguage?.id ?? progress?.languageId ?? metadata?.languages?.[0]?.id ?? "english";
  const resolvedVolumeId =
    selectedVolume?.id ??
    progress?.volumeId ??
    selectedLanguage?.volumes?.[0]?.id ??
    metadata?.languages?.[0]?.volumes?.[0]?.id ??
    "volume1";
  const { isCompleted, markAsCompleted, removeCompletion } = useBookCompletions(
    readingBookId,
    resolvedLanguageId,
    resolvedVolumeId,
  );
  const editionProgress =
    progress?.languageId === resolvedLanguageId && progress?.volumeId === resolvedVolumeId
      ? progress
      : undefined;
  const orderedLanguages = useMemo(() => {
    return [...(metadata?.languages ?? [])].sort((left, right) => {
      const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.title.localeCompare(right.title);
    });
  }, [metadata?.languages]);
  const orderedVolumes = useMemo(() => {
    return [...(selectedLanguage?.volumes ?? [])].sort((left, right) => {
      const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.title.localeCompare(right.title);
    });
  }, [selectedLanguage?.volumes]);

  useEffect(() => {
    let isMounted = true;

    void loadLibraryLanguagePreference().then((preference) => {
      if (!isMounted) {
        return;
      }

      setLibraryLanguagePreference(preference);
      setIsLanguagePreferenceLoaded(true);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedLanguageId || !libraryLanguagePreference || !metadata?.languages.length) {
      return;
    }

    const preferredLanguage = metadata.languages.find(
      (language) =>
        language.id === libraryLanguagePreference.id ||
        language.title === libraryLanguagePreference.title,
    );

    if (preferredLanguage) {
      setSelectedLanguageId(preferredLanguage.id);
    }
  }, [libraryLanguagePreference, metadata?.languages, selectedLanguageId]);

  useEffect(() => {
    if (!selectedLanguageId || !selectedLanguage?.id) {
      return;
    }

    const nextDefaultVolumeId =
      selectedLanguage.defaultVolumeId ??
      [...selectedLanguage.volumes]
        .sort((left, right) => {
          const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }

          return left.title.localeCompare(right.title);
        })[0]?.id;

    const volumeStillExists = selectedLanguage.volumes.some((volume) => volume.id === selectedVolumeId);
    if (!volumeStillExists) {
      setSelectedVolumeId(nextDefaultVolumeId);
    }
  }, [selectedLanguage, selectedLanguageId, selectedVolumeId]);
  const totalPages = manifest?.totalPages ?? 1;
  const resumePage = Math.min(editionProgress?.page ?? 1, totalPages);
  const displayTitle = metadata?.title ?? catalogBook?.title ?? "Book";
  const displayDescription = metadata?.description;
  const displayAuthor = metadata?.author ?? catalogBook?.author;
  const displayCategory = metadata?.category ?? catalogBook?.category ?? "Library";
  const tocEntries = getOrderedTocEntries(selectedVolume?.tocEntries ?? []);
  const relatedBooks = useMemo(() => {
    return catalogBooks
      .filter((book) => book.id !== readingBookId)
      .map((book) => ({
        book,
        score: getRelatedBookScore(book, catalogBook),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.book.title.localeCompare(right.book.title);
      })
      .slice(0, 5);
  }, [catalogBook, catalogBooks, readingBookId]);
  const isBookDataLoading =
    isCatalogLoading || isMetadataLoading || isManifestLoading || !isProgressLoaded || !isLanguagePreferenceLoaded;
  const shouldShowInitialSkeleton =
    !isProgressLoaded ||
    !isLanguagePreferenceLoaded ||
    (isBookDataLoading && !metadata && !manifest && !metadataError && !manifestError);
  const toggleBookCompletion = async () => {
    if (isCompleted) {
      await removeCompletion(readingBookId, resolvedLanguageId, resolvedVolumeId);
      showActionFeedback("Marked as not completed");
      return;
    }

    await markAsCompleted({
      bookId: readingBookId,
      languageId: resolvedLanguageId,
      volumeId: resolvedVolumeId,
      completedAt: new Date().toISOString(),
      totalPages,
      finalPage: resumePage,
      totalPagesRead: editionProgress?.pagesViewed?.length,
    });
    showActionFeedback("Marked as completed");
  };
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const isWideLayout = IS_WEB && viewportWidth >= BOOK_PAGE_LAYOUT.wideMinViewportWidth;
  const contentMaxWidth = isWideLayout ? BOOK_PAGE_LAYOUT.wideContentMaxWidth : BOOK_PAGE_LAYOUT.contentMaxWidth;
  const contentGutter = IS_WEB ? BOOK_PAGE_LAYOUT.gutter : 20;
  const pageContentContainer = {
    width: "100%",
    maxWidth: contentMaxWidth,
    alignSelf: "center",
    gap: 20,
    paddingHorizontal: contentGutter,
  } as const;
  const relatedBookCard = ({ book }: { book: PublicCatalogBook }) => (
    <Link key={book.id} href={`/book/${book.id}` as const} asChild>
      <Pressable
        style={{
          width: isWideLayout ? BOOK_PAGE_LAYOUT.relatedCardWidth : 210,
          backgroundColor: colors.surfaceMuted,
          borderRadius: 16,
          padding: 12,
          flexDirection: "row",
          gap: 10,
        }}
      >
        {book.coverImage ? (
          <Image
            source={{ uri: book.coverImage }}
            contentFit="cover"
            transition={120}
            style={{
              width: 52,
              height: 72,
              borderRadius: 8,
              backgroundColor: colors.surface,
            }}
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 72,
              borderRadius: 8,
              backgroundColor: colors.accentStrong,
            }}
          />
        )}
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }} numberOfLines={2}>
            {book.title}
          </Text>
          {book.author ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
              {book.author}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {book.category ? (
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }} numberOfLines={1}>
                {book.category}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        {shouldShowInitialSkeleton ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ ...pageContentContainer, paddingTop: insets.top + 16, paddingBottom: 40 }}
          >
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 24,
                padding: 20,
                gap: 12,
              }}
            >
              <View style={{ gap: 4 }}>
                <SkeletonBlock width={120} height={14} color={skeletonAccent} />
                <SkeletonBlock width="48%" height={24} color={skeletonText} />
              </View>
              <View style={{ gap: 8 }}>
                <SkeletonBlock width={88} height={14} color={skeletonText} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <SkeletonBlock width={88} height={34} color={skeletonBody} />
                  <SkeletonBlock width={104} height={34} color={skeletonBody} />
                  <SkeletonBlock width={92} height={34} color={skeletonAccent} />
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <SkeletonBlock width={72} height={14} color={skeletonText} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <SkeletonBlock width={112} height={34} color={skeletonBody} />
                  <SkeletonBlock width={96} height={34} color={skeletonBody} />
                </View>
              </View>
            </View>

            <View
              style={{
                backgroundColor: colors.accent,
                borderRadius: 24,
                padding: 16,
                gap: 14,
              }}
            >
              <View style={{ gap: 4 }}>
                <SkeletonBlock width={176} height={16} color={skeletonOutline} />
                <SkeletonBlock width={84} height={14} color={skeletonOutline} />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <SkeletonBlock width="100%" height={40} color={colors.text} />
              </View>
            </View>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 24,
                padding: 18,
                gap: 14,
              }}
            >
              <View style={{ gap: 4 }}>
                <SkeletonBlock width={128} height={14} color={skeletonAccent} />
                <SkeletonBlock width="66%" height={28} color={skeletonText} />
              </View>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <SkeletonBlock width={92} height={14} color={skeletonText} />
                  <SkeletonBlock width={44} height={14} color={skeletonAccent} />
                </View>
                <SkeletonBlock width="100%" height={5} color={skeletonBody} />
              </View>
              <View
                style={{
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: 16,
                  padding: 14,
                  gap: 8,
                }}
              >
                <SkeletonBlock width={96} height={14} color={skeletonText} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <SkeletonBlock width={152} height={18} color={skeletonBody} />
                  <SkeletonBlock width={52} height={14} color={skeletonText} />
                </View>
              </View>
              <SkeletonBlock width="92%" height={16} color={skeletonSoft} />
              <SkeletonBlock width={104} height={38} color={skeletonAccent} />
            </View>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 24,
                padding: 18,
                gap: 14,
              }}
            >
              <View style={{ gap: 4 }}>
                <SkeletonBlock width={132} height={14} color={skeletonAccent} />
                <SkeletonBlock width={120} height={28} color={skeletonText} />
              </View>
              <View style={{ gap: 8 }}>
                <SkeletonBlock width="100%" height={60} color={skeletonBody} />
                <SkeletonBlock width="100%" height={60} color={skeletonBody} />
                <SkeletonBlock width="100%" height={60} color={skeletonBody} />
              </View>
              <SkeletonBlock width="100%" height={38} color={skeletonAccent} />
            </View>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 24,
                padding: 18,
                gap: 12,
              }}
            >
              <SkeletonBlock width={116} height={14} color={skeletonAccent} />
              <SkeletonBlock width="100%" height={18} color={skeletonSoft} />
              <SkeletonBlock width="88%" height={18} color={skeletonSoft} />
              <View style={{ gap: 10 }}>
                <SkeletonBlock width="100%" height={54} color={skeletonBody} />
                <SkeletonBlock width="100%" height={54} color={skeletonBody} />
              </View>
            </View>
          </ScrollView>
        ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            ...pageContentContainer,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 96,
          }}
        >
          {!isBookDataLoading && (metadataError || manifestError) ? (
            <ErrorCard
              title="Book details unavailable"
              message="This book could not be loaded right now."
            />
          ) : null}
          {!isBookDataLoading && !catalogBook ? (
            <ErrorCard title="Book unavailable" message="This book is not available right now." />
          ) : null}
          {!isBookDataLoading &&
          catalogBook &&
          ["language-missing", "volume-missing", "manifest-missing"].includes(remoteState) ? (
            <ErrorCard
              title="Edition unavailable"
              message="This reading edition is incomplete right now."
            />
          ) : null}

          {IS_WEB && catalogBook ? (
            <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-start" }}>
              {catalogBook?.coverImage ? (
                <Image
                  source={{ uri: catalogBook.coverImage }}
                  contentFit="cover"
                  transition={120}
                  style={{
                    width: BOOK_PAGE_LAYOUT.coverWidth,
                    height: BOOK_PAGE_LAYOUT.coverHeight,
                    borderRadius: 16,
                    backgroundColor: colors.surfaceMuted,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: BOOK_PAGE_LAYOUT.coverWidth,
                    height: BOOK_PAGE_LAYOUT.coverHeight,
                    borderRadius: 16,
                    backgroundColor: colors.surfaceMuted,
                  }}
                />
              )}
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ color: colors.text, fontSize: 26, fontWeight: "800" }}>{displayTitle}</Text>
                {displayAuthor ? (
                  <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: "600" }}>{displayAuthor}</Text>
                ) : null}
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 12,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {displayCategory}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Language & Volume Selection - TOP */}
          {(orderedLanguages.length > 1 || orderedVolumes.length > 1) && (
            <View style={{ gap: 12, backgroundColor: colors.surface, borderRadius: 24, padding: 20 }}>
              <View style={{ gap: 2 }}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 12,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  🌍 Choose Edition
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 18,
                    fontWeight: "800",
                  }}
                >
                  {displayTitle}
                </Text>
              </View>
              {orderedLanguages.length > 1 ? (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 12,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    Language
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {orderedLanguages.map((language) => {
                      const isActive = language.id === resolvedLanguageId;
                      const chipColors = isActive ? selectedLanguageColors : inactiveLanguageColors;

                      return (
                        <Pressable
                          key={language.id}
                          onPress={() => {
                            setSelectedLanguageId(language.id);
                            setSelectedVolumeId(language.defaultVolumeId ?? language.volumes[0]?.id);
                          }}
                          style={{
                            borderRadius: 999,
                            backgroundColor: chipColors.backgroundColor,
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                          }}
                        >
                          <Text
                            style={{
                              color: chipColors.textColor,
                              fontSize: 13,
                              fontWeight: "800",
                            }}
                          >
                            {language.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
              {orderedVolumes.length > 1 ? (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 12,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    Volume
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {orderedVolumes.map((volume) => {
                      const isActive = volume.id === resolvedVolumeId;
                      const chipColors = isActive ? selectedLanguageColors : inactiveLanguageColors;

                      return (
                        <Pressable
                          key={volume.id}
                          onPress={() => {
                            setSelectedVolumeId(volume.id);
                          }}
                          style={{
                            borderRadius: 999,
                            backgroundColor: chipColors.backgroundColor,
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                          }}
                        >
                          <Text
                            style={{
                              color: chipColors.textColor,
                              fontSize: 13,
                              fontWeight: "800",
                            }}
                          >
                            {volume.subtitle?.trim() ? volume.subtitle : volume.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          )}

          {/* Primary Action Section - Compact */}
          <View
            style={{
              backgroundColor: colors.accent,
              borderRadius: 24,
              padding: 16,
              gap: 12,
            }}
          >
            {/* Header with Progress */}
            <View style={{ gap: 4 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: "800",
                }}
              >
                ▶️ {editionProgress ? `Continue from Page ${resumePage}` : "Start Reading"}
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 12,
                  fontWeight: "600",
                  opacity: 0.8,
                }}
              >
                {editionProgress ? "Ongoing" : "Not started yet"}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Link
                href={
                  `/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${resumePage}` as const
                }
                asChild
              >
                <Pressable
                  style={{
                    flex: 1,
                    borderRadius: 999,
                    backgroundColor: colors.text,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "800" }}>
                    {editionProgress ? "Continue" : "Start"}
                  </Text>
                </Pressable>
              </Link>
              {canDownload && !IS_WEB ? (
                <Pressable
                  onPress={() => {
                    if (isDownloading) {
                      return;
                    }
                    if (isFullyDownloaded) {
                      Alert.alert(
                        "Remove download?",
                        "This book will no longer be available offline.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => {
                              void removeDownload().then(() => {
                                showActionFeedback("Download removed");
                              });
                            },
                          },
                        ],
                      );
                    } else if (isPartiallyDownloaded) {
                      void downloadAll().then(() => {
                        showActionFeedback("Download complete");
                      });
                    } else {
                      void downloadAll().then(() => {
                        showActionFeedback("Saved for offline reading");
                      });
                    }
                  }}
                  style={{
                    borderRadius: 999,
                    backgroundColor: colors.surfaceMuted,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    justifyContent: "center",
                    alignItems: "center",
                    opacity: isDownloading ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                    {isDownloading
                      ? `${progressPercent}%`
                      : isFullyDownloaded
                        ? "📦"
                        : "💾"}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  void toggleBookCompletion();
                }}
                  style={{
                  borderRadius: 999,
                  backgroundColor: colors.surfaceMuted,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                  {isCompleted ? "✓" : "○"}
                </Text>
              </Pressable>
             </View>

             {isDownloading ? (
               <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600", opacity: 0.8 }}>
                 Downloading pages... {progressPercent}%
               </Text>
             ) : actionFeedback ? (
               <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600", opacity: 0.8 }}>
                 {actionFeedback}
               </Text>
             ) : null}
           </View>

          {/* About This Book */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 18, gap: 12 }}>
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 12,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                ℹ️ About This Book
              </Text>
            </View>

            {displayDescription ? (
              IS_WEB ? (
                <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 22 }}>
                  {displayDescription}
                </Text>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  style={{ maxHeight: 180 }}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 22 }}>
                    {displayDescription}
                  </Text>
                </ScrollView>
              )
            ) : null}

            {/* Metadata - Compact Grid */}
            <View style={{ gap: 10 }}>
              <View
                style={{
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: 12,
                  padding: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 16 }}>📂</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", opacity: 0.8 }}>
                    Category
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>
                    {displayCategory}
                  </Text>
                </View>
              </View>

              {displayAuthor ? (
                <View
                  style={{
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: 12,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Text style={{ fontSize: 16 }}>✍️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", opacity: 0.8 }}>
                      Author
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>
                      {displayAuthor}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {relatedBooks.length > 0 ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 18, gap: 14 }}>
              <View style={{ gap: 2 }}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 12,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  🔗 Related Books
                </Text>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
                  Continue the Thread
                </Text>
              </View>

              {isWideLayout ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {relatedBooks.map(({ book }) => relatedBookCard({ book }))}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {relatedBooks.map(({ book }) => relatedBookCard({ book }))}
                </ScrollView>
              )}
            </View>
          ) : null}

          {/* Book Structure - TOC */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 18, gap: 14 }}>
            {/* Header */}
            <Pressable
              onPress={() => {
                if (tocEntries.length > 0) {
                  setIsTocSheetVisible(true);
                }
              }}
              disabled={tocEntries.length === 0}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ gap: 2 }}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 12,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  Book Structure
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
                    Table of Contents
                  </Text>
                  {tocEntries.length > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        borderRadius: 999,
                        backgroundColor: colors.surfaceMuted,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>
                        {tocEntries.length}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>

            {tocEntries.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                TOC is not available for this book yet. You can still start reading or jump to any page in the reader.
              </Text>
            ) : null}
          </View>
        </ScrollView>
        )}

        {!shouldShowInitialSkeleton ? (
          <View
            style={{
              position: "absolute",
              right: 16,
              bottom: insets.bottom + 16,
            }}
          >
            <OpenBookFab
              size={56}
              colors={colors}
              href={`/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${resumePage}` as Href}
            />
          </View>
        ) : null}

        <Modal
          visible={isTocSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsTocSheetVisible(false)}
        >
          <Pressable
            onPress={() => setIsTocSheetVisible(false)}
            style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                maxHeight: "68%",
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                backgroundColor: colors.surface,
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 28,
              }}
            >
              <View style={{ width: 36, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.surfaceMuted }} />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontSize: 21, fontWeight: "800" }}>
                    Table of Contents
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 3 }} numberOfLines={1}>
                    {tocEntries.length ? `${tocEntries.length} entries · tap to jump` : displayTitle}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setIsTocSheetVisible(false)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 6 })}
                >
                  <Ionicons name="close" size={23} color={colors.text} />
                </Pressable>
              </View>

              {tocEntries.length ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: 14, paddingBottom: 8 }}
                >
                  {tocEntries.map((entry, index) => {
                    const entryPage = getTocEntryPage(entry);
                    const hasPage = typeof entry.printedPage === "number" || typeof entry.renderedPage === "number";

                    return (
                      <Pressable
                        key={`${entry.title}-${index}`}
                        onPress={() => {
                          router.push(
                            `/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${entryPage}` as Href,
                          );
                          setIsTocSheetVisible(false);
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "flex-start",
                          flexWrap: "nowrap",
                          paddingVertical: 12,
                          paddingLeft: 4,
                          paddingRight: 6,
                          opacity: pressed ? 0.55 : 1,
                        })}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              color: colors.text,
                              fontSize: 14,
                              fontWeight: "500",
                              lineHeight: 21,
                              textTransform: "capitalize",
                            }}
                          >
                            {toTitleCase(entry.title)}
                          </Text>
                        </View>
                        <View style={{ width: 50, paddingTop: 4, alignItems: "flex-end" }}>
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11.5,
                              fontWeight: "500",
                              textAlign: "right",
                            }}
                            numberOfLines={1}
                          >
                            {hasPage ? `p. ${entryPage}` : "—"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </>
  );
}

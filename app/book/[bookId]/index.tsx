import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorCard } from "../../../components/ui";
import type { PublicBookPlan, PublicBookSection, PublicCatalogBook } from "../../../data/types";
import { useAppTheme } from "../../../hooks/useAppTheme";
import { useBookCompletions } from "../../../hooks/useBookCompletions";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";
import { useReadingPlans } from "../../../hooks/useReadingPlans";
import { useReadingProgress } from "../../../hooks/useReadingProgress";
import { useVolumeDownload } from "../../../hooks/useVolumeDownload";
import {
  loadLibraryLanguagePreference,
  type LibraryLanguagePreference,
} from "../../../lib/library-language-preference";

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
  if (!canDownload) {
    return "";
  }

  if (isDownloading) {
    return progressPercent > 0 ? `Saving... ${progressPercent}%` : "Saving...";
  }

  if (isFullyDownloaded) {
    return "Remove Download";
  }

  return "Save Offline";
}

function buildFallbackPlans(totalPages: number): PublicBookPlan[] {
  const total = Math.max(totalPages, 1);
  const presets = [7, 21, 30];

  return presets.map((days) => {
    const pageSpan = Math.max(1, Math.ceil(total / days));
    return {
      id: `remote-${days}-day`,
      title: `${days}-day reading path`,
      description: `Read through this book over ${days} steady sessions.`,
      totalDays: days,
      items: Array.from({ length: days }, (_, index) => {
        const startPage = Math.min(total, index * pageSpan + 1);
        const endPage =
          index === days - 1 ? total : Math.min(total, (index + 1) * pageSpan);

        return {
          day: index + 1,
          label: `Day ${index + 1}`,
          startPage,
          endPage,
          estimatedMinutes: Math.max(8, (endPage - startPage + 1) * 2),
        };
      }),
    };
  });
}

function buildFallbackSections(totalPages: number): PublicBookSection[] {
  const total = Math.max(totalPages, 1);
  const sectionCount = Math.min(6, Math.max(3, Math.ceil(total / 40)));
  const sectionSpan = Math.max(1, Math.ceil(total / sectionCount));

  return Array.from({ length: sectionCount }, (_, index) => {
    const startPage = index * sectionSpan + 1;
    const endPage =
      index === sectionCount - 1 ? total : Math.min(total, (index + 1) * sectionSpan);

    return {
      id: `section-${index + 1}`,
      title: `Section ${index + 1}`,
      startPage,
      endPage,
      estimatedMinutes: Math.max(10, (endPage - startPage + 1) * 2),
      description: "A calm portion for steady reading.",
    };
  });
}

function getOrderedSections(sections: PublicBookSection[]) {
  return [...sections].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.startPage - right.startPage;
  });
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
  const effectiveLanguageId = selectedLanguageId ?? libraryLanguagePreference?.id ?? progress?.languageId;
  const { activePlan } = useReadingPlans(
    readingBookId,
    effectiveLanguageId,
    selectedVolumeId ?? progress?.volumeId,
  );
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
    progressPercent: downloadProgressPercent,
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
  const displaySubtitle = metadata?.subtitle ?? catalogBook?.subtitle ?? "Reading edition";
  const displayDescription =
    metadata?.description ?? "Open the book and continue with steady reading.";
  const displayAuthor = metadata?.author ?? catalogBook?.author;
  const displayCategory = metadata?.category ?? catalogBook?.category ?? "Library";
  const hasAuthoredSections = Boolean(selectedVolume?.sections?.length);
  const sections = getOrderedSections(
    hasAuthoredSections ? selectedVolume?.sections ?? [] : buildFallbackSections(totalPages),
  );
  const plans =
    selectedVolume?.plans?.length ? selectedVolume.plans : buildFallbackPlans(totalPages);
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
  const activeRemotePlan =
    activePlan &&
    activePlan.languageId === resolvedLanguageId &&
    activePlan.volumeId === resolvedVolumeId
      ? plans.find((plan) => plan.id === activePlan.planId)
      : undefined;
  const currentPlanItem =
    activeRemotePlan?.items.find(
      (item) => resumePage >= item.startPage && resumePage <= item.endPage,
    ) ?? activeRemotePlan?.items[0];
  const currentDay = currentPlanItem?.day ?? 1;
  const progressPercent = activeRemotePlan
    ? Math.min(100, Math.round((currentDay / activeRemotePlan.totalDays) * 100))
    : 0;
  const devotionalContext =
    selectedVolume?.introNote ??
    metadata?.devotionalContext ??
    "Keep the reading calm, steady, and devotional.";
  const todayTarget =
    selectedVolume?.todayTarget ??
    metadata?.todayPrompt ??
    "Read 2 pages from your current place. The goal is consistency, not speed.";
  const featuredQuote =
    metadata?.featuredQuote ??
    "Begin with calm. Continue with steadiness. Let the reading remain the focus.";
  const downloadButtonLabel = getDownloadButtonLabel({
    canDownload,
    isDownloading,
    isFullyDownloaded,
    progressPercent: downloadProgressPercent,
  });
  const isBookDataLoading =
    isCatalogLoading || isMetadataLoading || isManifestLoading || !isProgressLoaded || !isLanguagePreferenceLoaded;
  const shouldShowInitialSkeleton =
    !isProgressLoaded ||
    !isLanguagePreferenceLoaded ||
    (isBookDataLoading && !metadata && !manifest && !metadataError && !manifestError);
  const toggleBookCompletion = async () => {
    if (isCompleted) {
      await removeCompletion(readingBookId, resolvedLanguageId, resolvedVolumeId);
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
  };
  const insets = useSafeAreaInsets();

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
          <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, gap: 20, paddingBottom: 40 }}>
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
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, gap: 20, paddingBottom: 40 }}>
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
              {canDownload ? (
                <Pressable
                  onPress={() => {
                    void (isFullyDownloaded ? removeDownload() : downloadAll());
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
                    {isFullyDownloaded ? "📦" : "💾"}
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
           </View>

          {/* Today's Focus Section - Improved */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 24,
                padding: 18,
                gap: 10,
              }}
            >
            {/* Header */}
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
                📅 Today&apos;s Focus
              </Text>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
                {activeRemotePlan ? activeRemotePlan.title : "Set Your Reading Pace"}
              </Text>
            </View>

            {activeRemotePlan ? (
              <>
                {/* Progress Bar - Compact */}
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>
                      Day {currentDay}/{activeRemotePlan.totalDays}
                    </Text>
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
                      {progressPercent}%
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: colors.surfaceMuted,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${progressPercent}%`,
                        height: "100%",
                        backgroundColor: colors.accent,
                      }}
                    />
                  </View>
                </View>

                {/* Today's Task - Highlighted */}
                <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: 14, gap: 6 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
                    📖 {currentPlanItem?.label}
                  </Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                      Pages {currentPlanItem?.startPage}–{currentPlanItem?.endPage}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
                      ⏱️ {currentPlanItem?.estimatedMinutes}m
                    </Text>
                  </View>
                </View>

                {/* Daily Target - Subtle */}
                 <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, fontStyle: "italic" }}>
                  💭 &quot;{todayTarget}&quot;
                 </Text>

                {/* View Plans Button */}
                <Link
                  href={
                    `/book/${readingBookId}/plans?languageId=${resolvedLanguageId}&volumeId=${resolvedVolumeId}` as const
                  }
                  asChild
                >
                  <Pressable
                    style={{
                      alignSelf: "flex-start",
                      borderRadius: 999,
                      backgroundColor: colors.surfaceMuted,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                      View Plans
                    </Text>
                  </Pressable>
                </Link>
              </>
            ) : (
              <>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, fontWeight: "500" }}>
                  Select a reading plan to structure your daily reading and track your progress steadily.
                </Text>
                <Link
                  href={
                    `/book/${readingBookId}/plans?languageId=${resolvedLanguageId}&volumeId=${resolvedVolumeId}` as const
                  }
                  asChild
                >
                  <Pressable
                    style={{
                      alignSelf: "flex-start",
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                      paddingHorizontal: 18,
                      paddingVertical: 11,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                      Choose Plan
                    </Text>
                  </Pressable>
                </Link>
              </>
            )}
          </View>

          {/* Book Structure - Key Sections */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 18, gap: 14 }}>
            {/* Header */}
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
                📚 Book Structure
              </Text>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
                Key Sections
              </Text>
            </View>

            {!hasAuthoredSections ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                Guided sections are being prepared. Browse gentle page ranges for now.
              </Text>
            ) : null}

            {/* Sections List */}
            <View style={{ gap: 8 }}>
              {sections.slice(0, 3).map((section, index) => (
                <View
                  key={section.id}
                  style={{
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: 12,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>
                          {index + 1}
                        </Text>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 }}>
                          {section.title}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        Pages {section.startPage}–{section.endPage} • ⏱️ {section.estimatedMinutes}m
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Action Button */}
            <View style={{ paddingTop: 4 }}>
              <Link
                href={
                  `/book/${readingBookId}/sections?languageId=${resolvedLanguageId}&volumeId=${resolvedVolumeId}` as const
                }
                asChild
              >
                <Pressable
                  style={{
                    backgroundColor: colors.accent,
                    borderRadius: 999,
                    paddingVertical: 11,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                    View All
                  </Text>
                </Pressable>
              </Link>
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

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {relatedBooks.map(({ book, score }) => (
                  <Link key={book.id} href={`/book/${book.id}` as const} asChild>
                    <Pressable
                      style={{
                        width: 210,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: 16,
                        padding: 12,
                        gap: 8,
                      }}
                    >
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
                        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }}>
                          Match {score}
                        </Text>
                      </View>
                    </Pressable>
                  </Link>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* About This Book */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 18, gap: 12 }}>
            {/* Header */}
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

            {/* Description */}
            <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 22 }}>
              {displayDescription}
            </Text>

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
        </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

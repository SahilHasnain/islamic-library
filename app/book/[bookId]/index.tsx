import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorCard, LoadingCard } from "../../../components/ui";
import type { PublicBookPlan, PublicBookSection } from "../../../data/types";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";
import { useReadingPlans } from "../../../hooks/useReadingPlans";
import { useReadingProgress } from "../../../hooks/useReadingProgress";
import { useVolumeDownload } from "../../../hooks/useVolumeDownload";

const colors = {
  background: "#F7F1E3",
  surface: "#FFF9EA",
  surfaceMuted: "#F3E7C9",
  accent: "#C9A961",
  accentSoft: "#EFE2B6",
  text: "#173D31",
  textMuted: "#5F6C65",
  heroSubtle: "#C9D5CF",
  heroMuted: "#D9E2DC",
};

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

export default function BookHomeScreen() {
  const { bookId, languageId: routeLanguageId, volumeId: routeVolumeId } = useLocalSearchParams<{
    bookId: string;
    languageId?: string;
    volumeId?: string;
  }>();
  const readingBookId = Array.isArray(bookId) ? bookId[0] : bookId ?? "";
  const { progress } = useReadingProgress(readingBookId);
  const [selectedLanguageId, setSelectedLanguageId] = useState<string | undefined>(
    Array.isArray(routeLanguageId) ? routeLanguageId[0] : routeLanguageId,
  );
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | undefined>(
    Array.isArray(routeVolumeId) ? routeVolumeId[0] : routeVolumeId,
  );
  const { activePlan } = useReadingPlans(
    readingBookId,
    selectedLanguageId ?? progress?.languageId,
    selectedVolumeId ?? progress?.volumeId,
  );
  const {
    catalogBook,
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
    selectedLanguageId ?? progress?.languageId,
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
    if (!selectedLanguageId && resolvedLanguageId) {
      setSelectedLanguageId(resolvedLanguageId);
    }
  }, [resolvedLanguageId, selectedLanguageId]);

  useEffect(() => {
    if (!selectedVolumeId && resolvedVolumeId) {
      setSelectedVolumeId(resolvedVolumeId);
    }
  }, [resolvedVolumeId, selectedVolumeId]);

  useEffect(() => {
    if (!selectedLanguage?.id) {
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
  }, [selectedLanguage, selectedVolumeId]);
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

  return (
    <>
      <Stack.Screen
        options={{
          title: displayTitle,
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
          {isMetadataLoading || isManifestLoading ? (
            <LoadingCard title="Loading book data" message="Preparing this book for reading." />
          ) : null}
          {metadataError || manifestError ? (
            <ErrorCard
              title="Book details unavailable"
              message="This book could not be loaded right now."
            />
          ) : null}
          {!catalogBook ? (
            <ErrorCard title="Book unavailable" message="This book is not available right now." />
          ) : null}
          {catalogBook &&
          ["language-missing", "volume-missing", "manifest-missing"].includes(remoteState) ? (
            <ErrorCard
              title="Edition unavailable"
              message="This reading edition is incomplete right now."
            />
          ) : null}

          <View
            style={{
              backgroundColor: colors.text,
              borderRadius: 28,
              padding: 24,
              gap: 18,
            }}
          >
            {(orderedLanguages.length > 1 || orderedVolumes.length > 1) && (
              <View style={{ gap: 12 }}>
                {orderedLanguages.length > 1 ? (
                  <View style={{ gap: 8 }}>
                    <Text
                      style={{
                        color: colors.heroSubtle,
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
                        return (
                          <Pressable
                            key={language.id}
                            onPress={() => {
                              setSelectedLanguageId(language.id);
                              setSelectedVolumeId(language.defaultVolumeId ?? language.volumes[0]?.id);
                            }}
                            style={{
                              borderRadius: 999,
                              backgroundColor: isActive
                                ? "#F0E1A7"
                                : "rgba(255, 249, 234, 0.14)",
                              paddingHorizontal: 14,
                              paddingVertical: 9,
                            }}
                          >
                            <Text
                              style={{
                                color: isActive ? colors.text : "#FFF9EA",
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
                        color: colors.heroSubtle,
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
                        return (
                          <Pressable
                            key={volume.id}
                            onPress={() => {
                              setSelectedVolumeId(volume.id);
                            }}
                            style={{
                              borderRadius: 999,
                              backgroundColor: isActive
                                ? "#F0E1A7"
                                : "rgba(255, 249, 234, 0.14)",
                              paddingHorizontal: 14,
                              paddingVertical: 9,
                            }}
                          >
                            <Text
                              style={{
                                color: isActive ? colors.text : "#FFF9EA",
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
            <Text
              style={{
                color: "#FFF9EA",
                fontSize: 14,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Continue Reading
            </Text>
            <View style={{ gap: 10 }}>
              <Text style={{ color: "#FFF9EA", fontSize: 30, fontWeight: "800" }}>
                {displayTitle}
              </Text>
              <Text style={{ color: colors.heroSubtle, fontSize: 15, lineHeight: 22 }}>
                {displaySubtitle}
              </Text>
              <Text style={{ color: colors.heroMuted, fontSize: 15, lineHeight: 22 }}>
                Page {resumePage}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Link
                href={
                  `/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${resumePage}` as const
                }
                asChild
              >
                <Pressable
                  style={{
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    backgroundColor: "#F0E1A7",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>
                    Resume Reading
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
                    backgroundColor: "rgba(255, 249, 234, 0.16)",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: "#FFF9EA", fontSize: 13, fontWeight: "800" }}>
                    {downloadButtonLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {activeRemotePlan ? (
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 24,
                padding: 20,
                gap: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 13,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    Active plan
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
                    {activeRemotePlan.title}
                  </Text>
                </View>
                <Link
                  href={
                    `/book/${readingBookId}/plans?languageId=${resolvedLanguageId}&volumeId=${resolvedVolumeId}` as const
                  }
                  asChild
                >
                  <Pressable
                    style={{
                      borderRadius: 14,
                      backgroundColor: colors.accentSoft,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                      View
                    </Text>
                  </Pressable>
                </Link>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
                Day {currentDay} of {activeRemotePlan.totalDays}
              </Text>
              <View
                style={{
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: "#E8DDC0",
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
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 13,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {currentPlanItem?.label} | Pages {currentPlanItem?.startPage}-{currentPlanItem?.endPage}
              </Text>
            </View>
          ) : (
            <Link
              href={
                `/book/${readingBookId}/plans?languageId=${resolvedLanguageId}&volumeId=${resolvedVolumeId}` as const
              }
              asChild
            >
              <Pressable
                style={{
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: 24,
                  padding: 22,
                  gap: 14,
                }}
              >
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      alignSelf: "flex-start",
                      color: colors.text,
                      fontSize: 12,
                      fontWeight: "800",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    Reading plan
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800" }}>
                    Choose a Reading Plan
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
                    Build consistency with a gentle structure that fits your pace.
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {plans[0]?.title ?? "Guided daily options"} | View plans
                </Text>
              </Pressable>
            </Link>
          )}

          <View
            style={{
              backgroundColor: colors.surfaceMuted,
              borderRadius: 24,
              padding: 20,
              gap: 14,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
              Today&apos;s gentle target
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
              {todayTarget}
            </Text>
            <Link
              href={
                `/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${resumePage}` as const
              }
              asChild
            >
              <Pressable
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: colors.accent,
                  paddingHorizontal: 18,
                  paddingVertical: 11,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>
                  Read for 5 minutes
                </Text>
              </Pressable>
            </Link>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
              Reading structure
            </Text>
            {!hasAuthoredSections ? (
              <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 22 }}>
                Guided sections are still being prepared. For now, the book is divided into gentle page ranges.
              </Text>
            ) : null}
            {sections.slice(0, 3).map((section) => (
              <View
                key={section.id}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
                    {section.title}
                  </Text>
                  {section.subtitle ? (
                    <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 2 }}>
                      {section.subtitle}
                    </Text>
                  ) : null}
                  <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 2 }}>
                    Pages {section.startPage}-{section.endPage}
                  </Text>
                </View>
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>
                  {section.estimatedMinutes} min
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Link
              href={
                `/book/${readingBookId}/sections?languageId=${resolvedLanguageId}&volumeId=${resolvedVolumeId}` as const
              }
              asChild
            >
              <Pressable
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 20,
                  padding: 18,
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                  Sections
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21 }}>
                  Browse the book in manageable portions.
                </Text>
              </Pressable>
            </Link>
            <Link
              href={
                `/book/${readingBookId}/plans?languageId=${resolvedLanguageId}&volumeId=${resolvedVolumeId}` as const
              }
              asChild
            >
              <Pressable
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 20,
                  padding: 18,
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                  Plans
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21 }}>
                  Follow a pace that supports regular reading.
                </Text>
              </Pressable>
            </Link>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
              About this book
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
              {displayDescription}
            </Text>
            <Text
              style={{
                color: colors.accent,
                fontSize: 13,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              {displayCategory} | {displayAuthor ?? "Editorial selection"}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 24,
              padding: 22,
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 18,
                lineHeight: 28,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              {metadata?.devotionalContext ?? devotionalContext}
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                lineHeight: 26,
                fontWeight: "700",
                textAlign: "center",
                marginTop: 14,
              }}
            >
              {featuredQuote}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

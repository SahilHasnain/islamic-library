import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorCard, LoadingCard } from "../../../components/ui";
import { formatLastReadLabel } from "../../../data/books";
import type { ReadingPlan } from "../../../data/types";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";
import { useReadingPlans } from "../../../hooks/useReadingPlans";
import { useReadingProgress } from "../../../hooks/useReadingProgress";

const colors = {
  background: "#F7F1E3",
  surface: "#FFF9EA",
  accent: "#C9A961",
  text: "#173D31",
  textMuted: "#5F6C65",
};

function buildRemotePlans(totalPages: number): ReadingPlan[] {
  const total = Math.max(totalPages, 1);
  const presets = [7, 14, 30];

  return presets.map((days) => {
    const pageSpan = Math.max(1, Math.ceil(total / days));
    return {
      id: `remote-${days}-day`,
      title: `${days}-day reading path`,
      description: `Read through this edition over ${days} steady sessions.`,
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

function buildSections(totalPages: number) {
  const total = Math.max(totalPages, 1);
  const sectionCount = Math.min(6, Math.max(3, Math.ceil(total / 40)));
  const sectionSpan = Math.max(1, Math.ceil(total / sectionCount));

  return Array.from({ length: sectionCount }, (_, index) => {
    const startPage = index * sectionSpan + 1;
    const endPage = index === sectionCount - 1 ? total : Math.min(total, (index + 1) * sectionSpan);

    return {
      id: `section-${index + 1}`,
      title: `Section ${index + 1}`,
      startPage,
      endPage,
      estimatedMinutes: Math.max(10, (endPage - startPage + 1) * 2),
    };
  });
}

export default function BookHomeScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const readingBookId = Array.isArray(bookId) ? bookId[0] : bookId ?? "";
  const { progress } = useReadingProgress(readingBookId);
  const { activePlan } = useReadingPlans(readingBookId);
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
  } = useRemoteBookData(readingBookId, progress?.languageId, progress?.volumeId);

  const resolvedLanguageId =
    selectedLanguage?.id ?? progress?.languageId ?? metadata?.languages?.[0]?.id ?? "english";
  const resolvedVolumeId =
    selectedVolume?.id ??
    progress?.volumeId ??
    selectedLanguage?.volumes?.[0]?.id ??
    metadata?.languages?.[0]?.volumes?.[0]?.id ??
    "volume1";
  const totalPages = manifest?.totalPages ?? 1;
  const resumePage = Math.min(progress?.page ?? 1, totalPages);
  const displayTitle = metadata?.title ?? catalogBook?.title ?? "Published book";
  const displaySubtitle = metadata?.subtitle ?? catalogBook?.subtitle ?? "Remote edition";
  const displayDescription =
    metadata?.description ?? "This book is being read from the published remote catalog.";
  const displayAuthor = metadata?.author ?? catalogBook?.author;
  const displayCategory = metadata?.category ?? catalogBook?.category ?? "Library";
  const displayLanguageTitle =
    selectedLanguage?.title ?? metadata?.languages?.[0]?.title ?? resolvedLanguageId;
  const displayVolumeTitle = selectedVolume?.title ?? resolvedVolumeId;
  const sections = buildSections(totalPages);
  const plans = buildRemotePlans(totalPages);
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
            <LoadingCard
              title="Loading book data"
              message="Fetching the published metadata and manifest for this book."
            />
          ) : null}
          {metadataError || manifestError ? (
            <ErrorCard
              title="Remote book data unavailable"
              message="Published metadata or manifest could not be loaded for this book."
            />
          ) : null}
          {!catalogBook ? (
            <ErrorCard
              title="Book not in published catalog"
              message="This book is not present in the current published catalog."
            />
          ) : null}
          {catalogBook &&
          ["language-missing", "volume-missing", "manifest-missing"].includes(remoteState) ? (
            <ErrorCard
              title="Published edition incomplete"
              message="The selected published edition is missing language, volume, or manifest data."
            />
          ) : null}

          <View
            style={{
              backgroundColor: colors.text,
              borderRadius: 28,
              padding: 24,
              gap: 10,
            }}
          >
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
            <Text style={{ color: "#FFF9EA", fontSize: 30, fontWeight: "800" }}>
              {displayTitle}
            </Text>
            <Text style={{ color: "#D9E2DC", fontSize: 16, lineHeight: 24 }}>
              {displaySubtitle}
            </Text>
            <Text style={{ color: "#C9D5CF", fontSize: 14, lineHeight: 22 }}>
              {displayLanguageTitle} | Page {resumePage} of {totalPages} |{" "}
              {formatLastReadLabel(progress?.updatedAt)}
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
                  backgroundColor: "#EFD997",
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>
                  Resume Reading
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
              {displayCategory} | {displayAuthor ?? "Editorial selection"} | Remote metadata
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Link href={`/book/${readingBookId}/sections` as const} asChild>
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
                  Browse this edition in manageable page ranges.
                </Text>
              </Pressable>
            </Link>
            <Link href={`/book/${readingBookId}/plans` as const} asChild>
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
                  Follow a remote reading plan that matches your pace.
                </Text>
              </Pressable>
            </Link>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
              Published edition
            </Text>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
              {displayLanguageTitle} | {displayVolumeTitle}
            </Text>
            {sections.slice(0, 3).map((section) => (
              <View key={section.id} style={{ gap: 4 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
                  {section.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>
                  Pages {section.startPage}-{section.endPage} | {section.estimatedMinutes} min
                </Text>
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
              Suggested plan
            </Text>
            {activeRemotePlan ? (
              <>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
                  {activeRemotePlan.title}
                </Text>
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
              </>
            ) : (
              <>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
                  {plans[0].title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
                  {plans[0].description}
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
                  {plans[0].totalDays} days | Pages {plans[0].items[0].startPage}-{plans[0].items[0].endPage} on day 1
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

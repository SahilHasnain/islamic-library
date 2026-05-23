import { Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { EmptyCard, ErrorCard, LoadingCard, ProgressBar, Screen } from "../../../components/ui";
import { colors, radii } from "../../../constants/theme";
import type { PublicBookPlan } from "../../../data/types";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";
import { useReadingPlans } from "../../../hooks/useReadingPlans";
import { useReadingProgress } from "../../../hooks/useReadingProgress";

function buildRemotePlans(totalPages: number): PublicBookPlan[] {
  const total = Math.max(totalPages, 1);
  const presets = [7, 14, 30];

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

export default function BookPlansScreen() {
  const { bookId, languageId: routeLanguageId, volumeId: routeVolumeId } = useLocalSearchParams<{
    bookId: string;
    languageId?: string;
    volumeId?: string;
  }>();
  const readingBookId = Array.isArray(bookId) ? bookId[0] : bookId ?? "";
  const preferredLanguageId = Array.isArray(routeLanguageId) ? routeLanguageId[0] : routeLanguageId;
  const preferredVolumeId = Array.isArray(routeVolumeId) ? routeVolumeId[0] : routeVolumeId;
  const { error: plansError, isLoaded: plansLoaded, activePlan, clearPlan, selectPlan } =
    useReadingPlans(readingBookId, preferredLanguageId, preferredVolumeId);
  const { error: progressError, isLoaded: progressLoaded, progress } =
    useReadingProgress(readingBookId);
  const {
    metadata,
    metadataError,
    isMetadataLoading,
    manifest,
    selectedLanguage,
    selectedVolume,
  } = useRemoteBookData(
    readingBookId,
    preferredLanguageId ?? progress?.languageId,
    preferredVolumeId ?? progress?.volumeId,
  );
  const totalPages = manifest?.totalPages ?? 1;
  const plans =
    selectedVolume?.plans?.length ? selectedVolume.plans : buildRemotePlans(totalPages);
  const displayTitle = metadata?.title ?? "Published book";
  const displayLanguageTitle = selectedLanguage?.title ?? preferredLanguageId ?? progress?.languageId ?? "Edition";
  const displayVolumeTitle = selectedVolume?.subtitle ?? selectedVolume?.title;
  const resolvedLanguageId = selectedLanguage?.id ?? preferredLanguageId ?? progress?.languageId ?? "english";
  const resolvedVolumeId = selectedVolume?.id ?? preferredVolumeId ?? progress?.volumeId ?? "volume1";
  const editionProgress =
    progress?.languageId === resolvedLanguageId && progress?.volumeId === resolvedVolumeId
      ? progress
      : undefined;
  const activeRemotePlan =
    activePlan &&
    activePlan.languageId === resolvedLanguageId &&
    activePlan.volumeId === resolvedVolumeId
      ? plans.find((plan) => plan.id === activePlan.planId)
      : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Plans",
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800" }}>
            {displayTitle}
          </Text>
          {isMetadataLoading ? (
            <LoadingCard
              title="Loading book metadata"
              message="Preparing the reading plans for this book."
            />
          ) : null}
          {!plansLoaded || !progressLoaded ? (
            <LoadingCard
              title="Loading plans"
              message="Restoring your selected plan and current position."
            />
          ) : null}
          {plansError || progressError || metadataError ? (
            <ErrorCard
              title="Plan progress may be incomplete"
              message="Stored plan or progress data could not be fully loaded."
            />
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>{displayLanguageTitle}</Text>
          {displayVolumeTitle ? (
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              {displayVolumeTitle}
            </Text>
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
            Choose a reading rhythm that helps you continue with steadiness rather than speed.
          </Text>

          {activeRemotePlan && editionProgress ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radii.md, padding: 18, gap: 8 }}>
              {(() => {
                const currentPlanItem =
                  activeRemotePlan.items.find(
                    (item) =>
                      editionProgress.page >= item.startPage &&
                      editionProgress.page <= item.endPage,
                  ) ?? activeRemotePlan.items[0];

                if (!currentPlanItem) {
                  return (
                    <EmptyCard
                      title="Active plan unavailable"
                      message="This plan is not available for the current reading edition."
                    />
                  );
                }

                const progressPercent = Math.min(
                  100,
                  Math.round((currentPlanItem.day / activeRemotePlan.totalDays) * 100),
                );

                return (
                  <>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                      Active plan
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
                      {activeRemotePlan.title}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                      Day {currentPlanItem.day} of {activeRemotePlan.totalDays}
                    </Text>
                    <ProgressBar progressPercent={progressPercent} />
                    <Pressable
                      onPress={() => {
                            void clearPlan(readingBookId, resolvedLanguageId, resolvedVolumeId);
                      }}
                      style={{
                        alignSelf: "flex-start",
                        borderRadius: radii.pill,
                        backgroundColor: colors.surfaceSoft,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                        Clear active plan
                      </Text>
                    </Pressable>
                  </>
                );
              })()}
            </View>
          ) : null}

          {plans.map((plan) => (
            <View
              key={plan.id}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.md,
                padding: 18,
                gap: 8,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                {plan.title}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                {plan.description}
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
                {plan.totalDays} days | Day 1 pages {plan.items[0].startPage}-{plan.items[0].endPage}
              </Text>
              <Pressable
                onPress={() => {
                  void selectPlan({
                    bookId: readingBookId,
                    languageId: resolvedLanguageId,
                    volumeId: resolvedVolumeId,
                    planId: plan.id,
                    startedAt: new Date().toISOString(),
                  });
                }}
                style={{
                  alignSelf: "flex-start",
                  borderRadius: radii.pill,
                  backgroundColor: activePlan?.planId === plan.id ? "#173D31" : "#EFE2B6",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{
                    color: activePlan?.planId === plan.id ? "#FFF9EA" : colors.text,
                    fontSize: 13,
                    fontWeight: "800",
                  }}
                >
                  {activePlan?.planId === plan.id ? "Active plan" : "Choose plan"}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </Screen>
    </>
  );
}

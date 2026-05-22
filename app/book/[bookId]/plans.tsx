import { Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { EmptyCard, ErrorCard, LoadingCard, ProgressBar, Screen } from "../../../components/ui";
import { getBookById, getLanguageForBook, getPlanProgress, getVolumeForBook } from "../../../data/books";
import { colors, radii } from "../../../constants/theme";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";
import { useReadingPlans } from "../../../hooks/useReadingPlans";
import { useReadingProgress } from "../../../hooks/useReadingProgress";

export default function BookPlansScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const book = getBookById(bookId);
  const language = getLanguageForBook(book, book.continueReading.languageId);
  const volume = getVolumeForBook(book, language.id, book.continueReading.volumeId);
  const { metadata, metadataError, isMetadataLoading, selectedLanguage, selectedVolume } = useRemoteBookData(
    book.id,
    language.id,
    volume.id,
  );
  const { activePlan, clearPlan, error: plansError, isLoaded: plansLoaded, selectPlan } = useReadingPlans(book.id);
  const { error: progressError, isLoaded: progressLoaded, progress } = useReadingProgress(book.id);
  const displayTitle = metadata?.title ?? book.title;
  const displayLanguageTitle = selectedLanguage?.title ?? language.title;
  const resolvedLanguageId = selectedLanguage?.id ?? language.id;
  const resolvedVolumeId = selectedVolume?.id ?? volume.id;

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
              message="Fetching the published edition details for this book."
            />
          ) : null}
          {!plansLoaded || !progressLoaded ? (
            <LoadingCard title="Loading plans" message="Restoring your selected plan and current position." />
          ) : null}
          {plansError || progressError || metadataError ? (
            <ErrorCard title="Plan progress may be incomplete" message="Stored plan or progress data could not be fully loaded." />
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>{displayLanguageTitle}</Text>
          {activePlan && progress ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radii.md, padding: 18, gap: 8 }}>
              {(() => {
                const planProgress = getPlanProgress(book, progress, activePlan);
                if (!planProgress) {
                  return (
                    <EmptyCard
                      title="Active plan no longer matches"
                      message="The selected plan could not be matched to this book edition."
                    />
                  );
                }

                return (
                  <>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                      Active plan: {planProgress.plan.title}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                      Day {planProgress.currentDay} of {planProgress.plan.totalDays}
                    </Text>
                    <ProgressBar progressPercent={planProgress.progressPercent} />
                    <Pressable
                      onPress={() => {
                        void clearPlan(book.id);
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
          {volume.plans.map((plan) => (
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
                    bookId: book.id,
                    languageId: resolvedLanguageId,
                    volumeId: resolvedVolumeId,
                    planId: plan.id,
                    startedAt: new Date().toISOString(),
                  });
                }}
                style={{
                  alignSelf: "flex-start",
                  borderRadius: radii.pill,
                  backgroundColor:
                    activePlan?.planId === plan.id ? "#173D31" : "#EFE2B6",
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

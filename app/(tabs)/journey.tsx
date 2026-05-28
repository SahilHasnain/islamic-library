import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "../../components/ui";
import { useReadingPlans } from "../../hooks/useReadingPlans";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";

const colors = {
  background: "#F7F1E3",
  surface: "#FFF9EA",
  text: "#173D31",
  textMuted: "#5F6C65",
  accent: "#C9A961",
};

export default function JourneyScreen() {
  const { latestProgressByBook, progressMap, refreshProgress } = useReadingProgress();
  const { activePlanMap, refreshPlans } = useReadingPlans();
  const { catalog } = useRemoteCatalog();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      void refreshProgress();
      void refreshPlans();
    }, [refreshProgress, refreshPlans]),
  );

  const totalPagesRead = Object.values(progressMap).reduce((sum, progress) => sum + progress.page, 0);
  const booksInProgress = Object.keys(latestProgressByBook).length;
  const activePlans = Object.values(activePlanMap).map((plan) => ({
    plan,
    title: catalog?.books.find((book) => book.id === plan.bookId)?.title ?? plan.bookId,
    subtitle: catalog?.books.find((book) => book.id === plan.bookId)?.subtitle,
  }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 5, paddingHorizontal: 20, gap: 18, paddingBottom: 40 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: "800" }}>
            Journey
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23 }}>
            Cross-book progress, reading plans, and consistency across your library.
          </Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
            Reading totals
          </Text>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: "800" }}>
            {totalPagesRead}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23 }}>
            Pages reached across all saved editions in your current library.
          </Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
            Books in progress
          </Text>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: "800" }}>
            {booksInProgress}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23 }}>
            Distinct books with at least one active reading edition.
          </Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
            Active plans
          </Text>
          {activePlans.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23 }}>
              No active plans yet. Choose one from a book to start tracking daily progress.
            </Text>
          ) : (
            activePlans.map(({ plan, title, subtitle }) => (
              <View key={`${plan.bookId}-${plan.languageId}-${plan.volumeId}`} style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                  {title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                  {[subtitle, plan.languageId, plan.volumeId].filter(Boolean).join(" | ")}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                  {plan.planId} | Started {new Date(plan.startedAt).toLocaleDateString()}
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
                      width: "100%",
                      height: "100%",
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

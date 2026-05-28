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
              No active plans yet. Reading plans help you stay consistent with daily goals.
            </Text>
          ) : (
            <View style={{ gap: 16 }}>
              {activePlans.map(({ plan, title, subtitle }) => {
                const progress = latestProgressByBook[plan.bookId];
                const startDate = new Date(plan.startedAt);
                const daysActive = Math.floor(
                  (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)
                );

                return (
                  <View
                    key={`${plan.bookId}-${plan.languageId}-${plan.volumeId}`}
                    style={{
                      backgroundColor: "#F4ECD9",
                      borderRadius: 16,
                      padding: 16,
                      gap: 10,
                    }}
                  >
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                        {daysActive === 0
                          ? "Started today"
                          : daysActive === 1
                            ? "1 day active"
                            : `${daysActive} days active`}
                      </Text>
                      {progress?.page ? (
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                          Page {progress.page}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

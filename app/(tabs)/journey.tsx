import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BOOKS, getEffectiveProgress, getPlanProgress } from "../../data/books";
import { useReadingPlans } from "../../hooks/useReadingPlans";
import { useReadingProgress } from "../../hooks/useReadingProgress";

const colors = {
  background: "#F7F1E3",
  surface: "#FFF9EA",
  text: "#173D31",
  textMuted: "#5F6C65",
  accent: "#C9A961",
};

export default function JourneyScreen() {
  const { progressMap } = useReadingProgress();
  const { activePlanMap } = useReadingPlans();
  const totalPagesRead = BOOKS.reduce((sum, book) => {
    const progress = getEffectiveProgress(book, progressMap[book.id]);
    return sum + progress.page;
  }, 0);
  const activePlans = BOOKS.map((book) => {
    const progress = getEffectiveProgress(book, progressMap[book.id]);
    return {
      book,
      planProgress: getPlanProgress(book, progress, activePlanMap[book.id]),
    };
  }).filter((item) => item.planProgress);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
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
            Pages reached across the current library seed.
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
            activePlans.map(({ book, planProgress }) => (
              <View key={book.id} style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                  {book.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                  {planProgress?.plan.title} | Day {planProgress?.currentDay} of {planProgress?.plan.totalDays}
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
                      width: `${planProgress?.progressPercent ?? 0}%`,
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
    </SafeAreaView>
  );
}

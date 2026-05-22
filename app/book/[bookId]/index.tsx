import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatLastReadLabel,
  getBookById,
  getCurrentSectionForPage,
  getEffectiveProgress,
  getLanguageForBook,
  getPlanProgress,
  getVolumeForBook,
} from "../../../data/books";
import { useReadingPlans } from "../../../hooks/useReadingPlans";
import { useReadingProgress } from "../../../hooks/useReadingProgress";

const colors = {
  background: "#F7F1E3",
  surface: "#FFF9EA",
  accent: "#C9A961",
  text: "#173D31",
  textMuted: "#5F6C65",
};

export default function BookHomeScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const book = getBookById(bookId);
  const { progress } = useReadingProgress(book.id);
  const { activePlan } = useReadingPlans(book.id);
  const effectiveProgress = getEffectiveProgress(book, progress);
  const language = getLanguageForBook(book, effectiveProgress.languageId);
  const volume = getVolumeForBook(book, language.id, effectiveProgress.volumeId);
  const currentSection = getCurrentSectionForPage(
    book,
    language.id,
    volume.id,
    effectiveProgress.page,
  );
  const featuredPlan = volume.plans[0];
  const planProgress = getPlanProgress(book, effectiveProgress, activePlan);

  return (
    <>
      <Stack.Screen
        options={{
          title: book.title,
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
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
              {book.title}
            </Text>
            <Text style={{ color: "#D9E2DC", fontSize: 16, lineHeight: 24 }}>
              {currentSection?.title ?? book.subtitle}
            </Text>
            <Text style={{ color: "#C9D5CF", fontSize: 14, lineHeight: 22 }}>
              {language.title} | Page {effectiveProgress.page} of {volume.totalPages} | {formatLastReadLabel(effectiveProgress.updatedAt)}
            </Text>
            <Link
              href={
                `/reader/${book.id}/${language.id}/${volume.id}/${effectiveProgress.page}` as const
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
              {book.description}
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
              {book.category} | {book.author ?? "Editorial selection"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Link href={`/book/${book.id}/sections` as const} asChild>
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
            <Link href={`/book/${book.id}/plans` as const} asChild>
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
                  Start with a plan that fits your pace.
                </Text>
              </Pressable>
            </Link>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
              Sections
            </Text>
            {volume.sections.slice(0, 3).map((section) => (
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
            {planProgress ? (
              <>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
                  {planProgress.plan.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
                  Day {planProgress.currentDay} of {planProgress.plan.totalDays}
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
                      width: `${planProgress.progressPercent}%`,
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
                  {planProgress.currentItem?.label} | Pages {planProgress.currentItem?.startPage}-{planProgress.currentItem?.endPage}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
                  {featuredPlan.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
                  {featuredPlan.description}
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
                  {featuredPlan.totalDays} days | {featuredPlan.items[0].estimatedMinutes} min on day 1
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

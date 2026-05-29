import { Image } from "expo-image";
import { Link, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "../../components/ui";
import { colors, radii, spacing, typography } from "../../constants/theme";
import type { PublicCatalogBook } from "../../data/types";
import { useBookCompletions } from "../../hooks/useBookCompletions";
import { useReadingPlans } from "../../hooks/useReadingPlans";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";

function CompletedBookCard({
  bookId,
  title,
  subtitle,
  completedDate,
  coverImage,
}: {
  bookId: string;
  title: string;
  subtitle?: string;
  completedDate?: string;
  coverImage?: string;
}) {
  return (
    <Link href={`/book/${bookId}` as const} asChild>
      <Pressable
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.md,
          overflow: "hidden",
          padding: spacing.card,
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Cover Image with Shadow */}
        <View
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          {coverImage ? (
            <Image
              source={{ uri: coverImage }}
              contentFit="cover"
              transition={120}
              style={{
                width: 100,
                height: 140,
                borderRadius: 8,
                backgroundColor: colors.surfaceMuted,
              }}
            />
          ) : (
            <View
              style={{
                width: 100,
                height: 140,
                borderRadius: 8,
                backgroundColor: colors.accentStrong,
              }}
            />
          )}
        </View>

        {/* Book Info */}
        <View style={{ gap: 6, alignItems: "center", width: "100%" }}>
          <Text
            style={{
              color: colors.text,
              fontSize: typography.subtitle,
              fontWeight: "800",
              textAlign: "center",
            }}
            numberOfLines={2}
          >
            {title}
          </Text>
          <View style={{ height: 36, justifyContent: "center" }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: typography.caption,
                lineHeight: 18,
                textAlign: "center",
              }}
              numberOfLines={2}
            >
              {completedDate ? `Completed ${completedDate}` : subtitle ?? "Completed"}
            </Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

export default function JourneyScreen() {
  const { latestProgressByBook, progressMap, refreshProgress } = useReadingProgress();
  const { completedBookIds, completionMap, refreshCompletions } = useBookCompletions();
  const { activePlanMap, refreshPlans } = useReadingPlans();
  const { catalog } = useRemoteCatalog();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      void refreshProgress();
      void refreshPlans();
      void refreshCompletions();
    }, [refreshProgress, refreshPlans, refreshCompletions]),
  );

  const remoteBooks = catalog?.books ?? [];
  const completedBookIdSet = new Set(completedBookIds);
  const completedBooks = remoteBooks.filter((book) => completedBookIdSet.has(book.id));

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

        {completedBooks.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
              Completed books
            </Text>
            <FlatList
              data={completedBooks}
              keyExtractor={(book: PublicCatalogBook) => book.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={{
                gap: 12,
              }}
              contentContainerStyle={{
                gap: 12,
              }}
              renderItem={({ item: book }: { item: PublicCatalogBook }) => {
                const completion = Object.values(completionMap)
                  .filter((entry) => entry.bookId === book.id)
                  .sort(
                    (left, right) =>
                      new Date(right.completedAt).getTime() -
                      new Date(left.completedAt).getTime(),
                  )[0];

                return (
                  <View style={{ flex: 1 }}>
                    <CompletedBookCard
                      bookId={book.id}
                      title={book.title}
                      subtitle={book.subtitle}
                      completedDate={
                        completion
                          ? new Date(completion.completedAt).toLocaleDateString()
                          : undefined
                      }
                      coverImage={book.coverImage}
                    />
                  </View>
                );
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

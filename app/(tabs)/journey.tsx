import { Image } from "expo-image";
import { Link, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "../../components/ui";
import { radii, spacing, typography } from "../../constants/theme";
import type { PublicCatalogBook } from "../../data/types";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useBookCompletions } from "../../hooks/useBookCompletions";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { useRemoteBookData } from "../../hooks/useRemoteBookData";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";

function withCacheBust(url: string, cacheKey: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
}

function CompletedBookCard({
  bookId,
  title,
  subtitle,
  completedDate,
  coverImage,
  languageId,
  volumeId,
}: {
  bookId: string;
  title: string;
  subtitle?: string;
  completedDate?: string;
  coverImage?: string;
  languageId?: string;
  volumeId?: string;
}) {
  const { colors } = useAppTheme();
  const { manifest } = useRemoteBookData(bookId, languageId, volumeId);
  const resolvedCoverImage = manifest?.coverImage
    ? withCacheBust(manifest.coverImage, `${manifest.version}-${languageId}-${volumeId}`)
    : coverImage;

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
          {resolvedCoverImage ? (
            <Image
              source={{ uri: resolvedCoverImage }}
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
  const { colors } = useAppTheme();
  const { latestProgressByBook, progressMap, refreshProgress } = useReadingProgress();
  const { completedBookIds, completionMap, refreshCompletions } = useBookCompletions();
  const { catalog } = useRemoteCatalog();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      void refreshProgress();
      void refreshCompletions();
    }, [refreshProgress, refreshCompletions]),
  );

  const remoteBooks = catalog?.books ?? [];
  const completedBookIdSet = new Set(completedBookIds);
  const completedBooks = remoteBooks.filter((book) => completedBookIdSet.has(book.id));

  const totalPagesRead = Object.values(progressMap).reduce((sum, progress) => sum + progress.page, 0);
  const booksInProgress = Object.keys(latestProgressByBook).length;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 5, paddingHorizontal: 20, gap: 18, paddingBottom: 40 }}
      >
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: "800" }}>
            Journey
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23 }}>
            Cross-book progress and consistency across your library.
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

        {completedBooks.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
              Completed books
            </Text>
            <FlatList
              data={completedBooks}
              showsVerticalScrollIndicator={false}
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
                      languageId={completion?.languageId}
                      volumeId={completion?.volumeId}
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

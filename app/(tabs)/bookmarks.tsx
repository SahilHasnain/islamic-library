import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { EmptyCard, ErrorCard, LoadingCard, PageHeader, Screen, SectionCard } from "../../components/ui";
import { formatLastReadLabel, getBookById, getCurrentSectionForPage } from "../../data/books";
import { useBookmarks } from "../../hooks/useBookmarks";
import { colors } from "../../constants/theme";

export default function BookmarksScreen() {
  const { error, filteredBookmarks, isLoaded, removeBookmark } = useBookmarks();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
        <PageHeader
          title="Bookmarks"
          subtitle="Saved passages across books will be collected here."
        />

        {!isLoaded ? (
          <LoadingCard title="Loading bookmarks" message="Collecting your saved passages across the library." />
        ) : error ? (
          <ErrorCard title="Bookmarks unavailable" message="Saved bookmarks could not be loaded from local storage." />
        ) : filteredBookmarks.length === 0 ? (
          <EmptyCard
            title="No bookmarks yet"
            message="Save a page while reading and it will appear here across your library."
          />
        ) : (
          filteredBookmarks.map((bookmark) => {
            const book = getBookById(bookmark.bookId);
            const section = getCurrentSectionForPage(
              book,
              bookmark.languageId,
              bookmark.volumeId,
              bookmark.page,
            );

            return (
              <Link
                key={bookmark.id}
                href={
                  `/reader/${bookmark.bookId}/${bookmark.languageId}/${bookmark.volumeId}/${bookmark.page}` as const
                }
                asChild
              >
                <Pressable
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 24,
                    padding: 20,
                    gap: 10,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
                    {book.title}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23 }}>
                    {section?.title ?? book.subtitle}
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
                    Page {bookmark.page} | {formatLastReadLabel(bookmark.createdAt)}
                  </Text>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      void removeBookmark(bookmark.id);
                    }}
                    style={{
                      alignSelf: "flex-start",
                      borderRadius: 999,
                      backgroundColor: "#EFE2B6",
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                      Remove
                    </Text>
                  </Pressable>
                </Pressable>
              </Link>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

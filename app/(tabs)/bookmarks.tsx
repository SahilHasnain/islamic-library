import { Link } from "expo-router";
import { Pressable, ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyCard, ErrorCard, LoadingCard, PageHeader, Screen } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useBookmarks } from "../../hooks/useBookmarks";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";

export default function BookmarksScreen() {
  const { error, filteredBookmarks, isLoaded, removeBookmark } = useBookmarks();
  const { catalog } = useRemoteCatalog();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 5, paddingHorizontal: 20, gap: 18, paddingBottom: 40 }}>
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
            const book = catalog?.books.find((entry) => entry.id === bookmark.bookId);

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
                    {book?.title ?? bookmark.bookId}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23 }}>
                    {book?.subtitle ?? `${bookmark.languageId} | ${bookmark.volumeId}`}
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
                    Page {bookmark.page} | Saved
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

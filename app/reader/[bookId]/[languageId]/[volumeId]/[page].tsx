import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorCard } from "../../../../../components/ui";
import {
  getBookById,
  getCurrentSectionForPage,
  getGeneratedPageContent,
  getVolumeForBook,
} from "../../../../../data/books";
import { useRemoteBookData } from "../../../../../hooks/useRemoteBookData";
import { useBookmarks } from "../../../../../hooks/useBookmarks";
import { useReaderPreferences } from "../../../../../hooks/useReaderPreferences";
import { useReadingProgress } from "../../../../../hooks/useReadingProgress";

const themeColors = {
  light: {
    background: "#F6F0E2",
    surface: "#FFF9EA",
    text: "#173D31",
    textMuted: "#5F6C65",
    accent: "#C9A961",
    reader: "#FCF7EB",
    readerBorder: "#E5D8B6",
    button: "#173D31",
    buttonText: "#FFF9EA",
  },
  sepia: {
    background: "#EDE0C8",
    surface: "#F6ECD7",
    text: "#3F3425",
    textMuted: "#6D5D46",
    accent: "#9F7A2F",
    reader: "#F8EFD9",
    readerBorder: "#D8C39A",
    button: "#5B4B33",
    buttonText: "#FFF7E7",
  },
};

export default function ReaderScreen() {
  const { bookId, languageId, volumeId, page } = useLocalSearchParams<{
    bookId: string;
    languageId: string;
    volumeId: string;
    page: string;
  }>();

  const book = getBookById(bookId);
  const volume = getVolumeForBook(book, languageId, volumeId);
  const currentPage = Number(page ?? 1) || 1;
  const {
    catalogBook,
    manifest,
    manifestError,
    isManifestLoading,
    metadata,
    remoteState,
    selectedLanguage,
    selectedVolume,
  } = useRemoteBookData(book.id, languageId, volumeId);
  const { saveProgress } = useReadingProgress(book.id);
  const { addBookmark, getBookmarkForPage, removeBookmark } = useBookmarks(book.id);
  const { theme, cycleTheme } = useReaderPreferences();
  const colors = themeColors[theme];
  const currentSection = getCurrentSectionForPage(book, languageId, volumeId, currentPage);
  const pageContent = getGeneratedPageContent(book, languageId, volumeId, currentPage);
  const totalPages = manifest?.totalPages ?? volume.totalPages;
  const progressPercent = Math.round((currentPage / totalPages) * 100);
  const sectionIndex = currentSection
    ? volume.sections.findIndex((section) => section.id === currentSection.id) + 1
    : undefined;
  const existingBookmark = getBookmarkForPage(book.id, languageId, volumeId, currentPage);
  const currentManifestPage = manifest?.pages?.find((entry) => entry.page === currentPage);

  useEffect(() => {
    void saveProgress({
      bookId: book.id,
      languageId,
      volumeId,
      page: currentPage,
      updatedAt: new Date().toISOString(),
    });
  }, [book.id, currentPage, languageId, saveProgress, volumeId]);

  async function toggleBookmark() {
    if (existingBookmark) {
      await removeBookmark(existingBookmark.id);
      return;
    }

    await addBookmark({
      bookId: book.id,
      languageId,
      volumeId,
      page: currentPage,
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: book.title,
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  void cycleTheme();
                }}
                style={{
                  borderRadius: 999,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>
                  {theme === "light" ? "Sepia" : "Light"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void toggleBookmark();
                }}
                style={{
                  borderRadius: 999,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>
                  {existingBookmark ? "Saved" : "Save"}
                </Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
          {!catalogBook ? (
            <ErrorCard
              title="Reader is using local fallback"
              message="This book is not available in the published catalog, so the reader is using local seeded content only."
            />
          ) : null}
          {catalogBook && (remoteState === "language-missing" || remoteState === "volume-missing") ? (
            <ErrorCard
              title="Published edition unavailable"
              message="The requested language or volume is not present in the published metadata, so the reader is using local fallback content."
            />
          ) : null}
          {catalogBook && (remoteState === "manifest-error" || remoteState === "manifest-missing") ? (
            <ErrorCard
              title="Published reader assets unavailable"
              message="The published manifest could not be resolved for this edition, so the reader is using generated local fallback content."
            />
          ) : null}
          <View
            style={{
              backgroundColor: colors.reader,
              borderRadius: 28,
              padding: 24,
              gap: 22,
              borderWidth: 1,
              borderColor: colors.readerBorder,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {pageContent.kicker}
                </Text>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800" }}>
                  {pageContent.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                  {pageContent.meta.sectionProgress}
                </Text>
                {isManifestLoading ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Loading published manifest...
                  </Text>
                ) : null}
                {manifestError ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Published manifest unavailable. Using local reader fallback.
                  </Text>
                ) : null}
              </View>
              <View
                style={{
                  borderRadius: 16,
                  backgroundColor: "#EFE2B6",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                  {progressPercent}%
                </Text>
              </View>
            </View>

            <View
              style={{
                gap: 16,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 26 }}>
                {pageContent.summary}
              </Text>
              {pageContent.paragraphs.map((paragraph) => (
                <Text
                  key={paragraph}
                  style={{
                    color: colors.text,
                    fontSize: 18,
                    lineHeight: 31,
                  }}
                >
                  {paragraph}
                </Text>
              ))}
            </View>

            <View
              style={{
                borderRadius: 20,
                backgroundColor: "#F1E4BC",
                padding: 18,
                gap: 8,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>
                Reflection
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                {pageContent.reflection}
              </Text>
            </View>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
              Reading context
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
              {metadata?.title ?? book.title} | {selectedLanguage?.title ?? pageContent.meta.languageTitle} | {selectedVolume?.title ?? pageContent.meta.volumeTitle}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
              {currentSection
                ? `Section ${sectionIndex}: ${currentSection.title}`
                : "Current section"}
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
                  width: `${progressPercent}%`,
                  height: "100%",
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                }}
              />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
              Page {currentPage} of {totalPages}
            </Text>
            {currentManifestPage ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                Published page asset: {currentManifestPage.fileName}
              </Text>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            {currentPage > 1 ? (
              <Link
                href={`/reader/${book.id}/${languageId}/${volumeId}/${currentPage - 1}` as const}
                asChild
              >
                <Pressable
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: colors.button,
                  }}
                >
                  <Text style={{ color: colors.buttonText, fontSize: 15, fontWeight: "800" }}>
                    Previous
                  </Text>
                </Pressable>
              </Link>
            ) : (
              <View
                style={{
                  flex: 1,
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: "#E4DDCA",
                }}
              >
                <Text style={{ color: "#8A8E86", fontSize: 15, fontWeight: "800" }}>
                  Previous
                </Text>
              </View>
            )}
            {currentPage < totalPages ? (
              <Link
                href={`/reader/${book.id}/${languageId}/${volumeId}/${currentPage + 1}` as const}
                asChild
              >
                <Pressable
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: colors.button,
                  }}
                >
                  <Text style={{ color: colors.buttonText, fontSize: 15, fontWeight: "800" }}>
                    Next
                  </Text>
                </Pressable>
              </Link>
            ) : (
              <View
                style={{
                  flex: 1,
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: "#E4DDCA",
                }}
              >
                <Text style={{ color: "#8A8E86", fontSize: 15, fontWeight: "800" }}>
                  Next
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

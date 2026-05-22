import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorCard, LoadingCard } from "../../../../../components/ui";
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
  } = useRemoteBookData(bookId, languageId, volumeId);
  const readingBookId = Array.isArray(bookId) ? bookId[0] : bookId ?? "";
  const { saveProgress } = useReadingProgress(readingBookId);
  const { addBookmark, getBookmarkForPage, removeBookmark } = useBookmarks(readingBookId);
  const { theme, cycleTheme } = useReaderPreferences();
  const colors = themeColors[theme];
  const sectionSpan = Math.max(1, Math.ceil((manifest?.totalPages ?? 1) / 6));
  const currentSectionIndex = Math.max(1, Math.ceil(currentPage / sectionSpan));
  const currentSection = {
    title: `Section ${currentSectionIndex}`,
  };
  const pageContent = {
    kicker: `${selectedLanguage?.title ?? languageId} reading edition`,
    title: metadata?.title ?? catalogBook?.title ?? "Published reading view",
    summary: "This page is being served from the published remote catalog for this edition.",
    paragraphs: [
      "The primary reading surface for this book is the published page asset.",
      "If a page image is unavailable, this remote reading view stays usable with generated support text.",
    ],
    reflection: "This reader now depends on the published catalog and manifest, not on seeded local book content.",
    meta: {
      languageTitle: selectedLanguage?.title ?? languageId,
      volumeTitle: selectedVolume?.title ?? volumeId,
      sectionProgress: `Page ${currentPage}`,
    },
  };
  const totalPages = manifest?.totalPages ?? 1;
  const resolvedLanguageId = selectedLanguage?.id ?? languageId;
  const resolvedVolumeId = selectedVolume?.id ?? volumeId;
  const progressPercent = Math.round((currentPage / totalPages) * 100);
  const sectionIndex = currentSectionIndex;
  const existingBookmark = getBookmarkForPage(
    readingBookId,
    resolvedLanguageId,
    resolvedVolumeId,
    currentPage,
  );
  const currentManifestPage = manifest?.pages?.find((entry) => entry.page === currentPage);
  const remotePageUrl = currentManifestPage?.url;
  const shouldUseRemotePage =
    remoteState === "ready" && Boolean(remotePageUrl);
  const [remoteImageState, setRemoteImageState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const shouldDisplayRemoteImage = shouldUseRemotePage && remoteImageState !== "error";

  useEffect(() => {
    void saveProgress({
      bookId: readingBookId,
      languageId: resolvedLanguageId,
      volumeId: resolvedVolumeId,
      page: currentPage,
      updatedAt: new Date().toISOString(),
    });
  }, [currentPage, readingBookId, resolvedLanguageId, resolvedVolumeId, saveProgress]);

  useEffect(() => {
    if (!shouldUseRemotePage) {
      setRemoteImageState("idle");
      return;
    }

    setRemoteImageState("loading");
  }, [currentPage, remotePageUrl, shouldUseRemotePage]);

  async function toggleBookmark() {
    if (existingBookmark) {
      await removeBookmark(existingBookmark.id);
      return;
    }

    await addBookmark({
      bookId: readingBookId,
      languageId: resolvedLanguageId,
      volumeId: resolvedVolumeId,
      page: currentPage,
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: metadata?.title ?? catalogBook?.title ?? "Reader",
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
              title="Book not in published catalog"
              message="This reader requires a published remote catalog entry for the selected book."
            />
          ) : null}
          {catalogBook && (remoteState === "language-missing" || remoteState === "volume-missing") ? (
            <ErrorCard
              title="Published edition unavailable"
              message="The requested language or volume is not present in the published metadata."
            />
          ) : null}
          {catalogBook && (remoteState === "manifest-error" || remoteState === "manifest-missing") ? (
            <ErrorCard
              title="Published reader assets unavailable"
              message="The published manifest could not be resolved for this edition."
            />
          ) : null}
          {shouldUseRemotePage && remoteImageState === "error" ? (
            <ErrorCard
              title="Published page failed to load"
              message="The remote page image could not be loaded, so the reader is showing generated support content instead."
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
                    Published manifest unavailable for this edition.
                  </Text>
                ) : null}
                {shouldUseRemotePage ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Rendering published page asset for this reader view.
                  </Text>
                ) : null}
                {shouldUseRemotePage && remoteImageState === "loading" ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Loading remote page image...
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

            {shouldDisplayRemoteImage ? (
              <View
                style={{
                  gap: 16,
                }}
              >
                {remoteImageState === "loading" ? (
                  <LoadingCard
                    title="Loading page"
                    message="Fetching the published page image for this reading session."
                  />
                ) : null}
                <Image
                  source={{ uri: remotePageUrl }}
                  contentFit="contain"
                  transition={150}
                  onLoad={() => {
                    setRemoteImageState("loaded");
                  }}
                  onError={() => {
                    setRemoteImageState("error");
                  }}
                  style={{
                    width: "100%",
                    aspectRatio: currentManifestPage?.width && currentManifestPage?.height
                      ? currentManifestPage.width / currentManifestPage.height
                      : 0.707,
                    borderRadius: 20,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.readerBorder,
                    opacity: remoteImageState === "loaded" ? 1 : 0.35,
                  }}
                />
                <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 22 }}>
                  {remoteImageState === "loaded"
                    ? "Published page image loaded from the remote manifest."
                    : "Remote page image is still loading. Support text will remain visible if the asset fails."}
                </Text>
              </View>
            ) : (
              <>
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
              </>
            )}
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
              Reading context
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
              {metadata?.title ?? catalogBook?.title ?? "Published book"} | {selectedLanguage?.title ?? pageContent.meta.languageTitle} | {selectedVolume?.title ?? pageContent.meta.volumeTitle}
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
                href={`/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${currentPage - 1}` as const}
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
                href={`/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${currentPage + 1}` as const}
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

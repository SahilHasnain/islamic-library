import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ZoomableReaderImage } from "../../../../../components/zoomable-reader-image";
import { useBookmarks } from "../../../../../hooks/useBookmarks";
import { useReaderPreferences } from "../../../../../hooks/useReaderPreferences";
import { useReadingProgress } from "../../../../../hooks/useReadingProgress";
import { useRemoteBookData } from "../../../../../hooks/useRemoteBookData";
import { useResolvedManifestPageAsset } from "../../../../../hooks/useResolvedManifestPageAsset";
import { prefetchManifestPages } from "../../../../../lib/reader-prefetch";

const themeColors = {
  light: {
    background: "#F6F0E2",
    overlay: "rgba(23, 61, 49, 0.9)",
    overlayLight: "rgba(255, 249, 234, 0.16)",
    overlayMuted: "rgba(255, 249, 234, 0.12)",
    text: "#FFF9EA",
    textMuted: "#C6D4CB",
    textStrong: "#173D31",
    accent: "#C9A961",
    panel: "#FFF9EA",
    panelText: "#173D31",
  },
  sepia: {
    background: "#EDE0C8",
    overlay: "rgba(59, 47, 31, 0.92)",
    overlayLight: "rgba(248, 239, 217, 0.14)",
    overlayMuted: "rgba(248, 239, 217, 0.1)",
    text: "#FFF7E7",
    textMuted: "#DCCBAF",
    textStrong: "#3F3425",
    accent: "#9F7A2F",
    panel: "#F8EFD9",
    panelText: "#3F3425",
  },
};

function ReaderPageSurface({
  manifest,
  pageNum,
  screenWidth,
  screenHeight,
  backgroundColor,
  textColor,
  mutedTextColor,
  remoteState,
  isActivePage,
  onZoomChange,
  onPageLoadStateChange,
}: {
  manifest: ReturnType<typeof useRemoteBookData>["manifest"];
  pageNum: number;
  screenWidth: number;
  screenHeight: number;
  backgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  remoteState: string;
  isActivePage: boolean;
  onZoomChange: (isZoomed: boolean) => void;
  onPageLoadStateChange: (state: "idle" | "loading" | "loaded" | "error") => void;
}) {
  const { asset, isLoading } = useResolvedManifestPageAsset(manifest, pageNum);
  const manifestPage = manifest?.pages?.find((entry) => entry.page === pageNum);
  const imageAspectRatio =
    manifestPage?.width && manifestPage?.height
      ? manifestPage.width / manifestPage.height
      : 0.707;

  useEffect(() => {
    if (!isActivePage) {
      return;
    }

    if (asset?.kind === "missing") {
      onPageLoadStateChange("error");
      return;
    }

    onPageLoadStateChange(isLoading ? "loading" : "loaded");
  }, [asset?.kind, isActivePage, isLoading, onPageLoadStateChange]);

  if (asset?.source && asset.kind !== "missing") {
    return (
      <ZoomableReaderImage
        source={asset.source}
        width={screenWidth}
        height={Math.min(screenHeight, screenWidth / imageAspectRatio)}
        onZoomChange={onZoomChange}
        onError={() => {
          if (isActivePage) {
            onPageLoadStateChange("error");
          }
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: screenWidth,
        height: screenHeight,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        gap: 14,
      }}
    >
      <Text
        style={{
          color: textColor,
          fontSize: 28,
          fontWeight: "800",
          textAlign: "center",
        }}
      >
        Page {pageNum}
      </Text>
      <Text
        style={{
          color: mutedTextColor,
          fontSize: 16,
          lineHeight: 24,
          textAlign: "center",
        }}
      >
        {remoteState === "ready"
          ? "This page is not ready yet."
          : "Preparing this page for reading."}
      </Text>
    </View>
  );
}

export default function ReaderScreen() {
  const router = useRouter();
  const { bookId, languageId, volumeId, page } = useLocalSearchParams<{
    bookId: string;
    languageId: string;
    volumeId: string;
    page: string;
  }>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const {
    catalogBook,
    manifest,
    metadata,
    remoteState,
    selectedLanguage,
    selectedVolume,
  } = useRemoteBookData(bookId, languageId, volumeId);
  const readingBookId = Array.isArray(bookId) ? bookId[0] : bookId ?? "";
  const { saveProgress } = useReadingProgress(readingBookId, languageId, volumeId);
  const { addBookmark, getBookmarkForPage, removeBookmark } = useBookmarks(readingBookId);
  const { theme, cycleTheme } = useReaderPreferences();
  const colors = themeColors[theme];
  const totalPages = manifest?.totalPages ?? 1;
  const resolvedLanguageId = selectedLanguage?.id ?? languageId;
  const resolvedVolumeId = selectedVolume?.id ?? volumeId;
  const clampPage = useCallback(
    (value: number) => Math.min(Math.max(value, 1), totalPages),
    [totalPages],
  );
  const routePage = clampPage(Number(page ?? 1) || 1);
  const [currentPage, setCurrentPage] = useState(routePage);
  const [isZoomed, setIsZoomed] = useState(false);
  const [remoteImageState, setRemoteImageState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const flatListRef = useRef<FlatList<number>>(null);
  const { asset: activePageAsset, isLoading: isActivePageAssetLoading } =
    useResolvedManifestPageAsset(manifest, currentPage);

  const pages = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );
  const remoteSections = selectedVolume?.sections ?? [];
  const sectionSpan = Math.max(1, Math.ceil(totalPages / 6));
  const currentSectionIndex = Math.max(1, Math.ceil(currentPage / sectionSpan));
  const currentSection =
    remoteSections.find(
      (section) => currentPage >= section.startPage && currentPage <= section.endPage,
    ) ?? { title: `Section ${currentSectionIndex}` };
  const progressPercent = Math.round((currentPage / totalPages) * 100);
  const existingBookmark = getBookmarkForPage(
    readingBookId,
    resolvedLanguageId,
    resolvedVolumeId,
    currentPage,
  );
  const currentManifestPage = manifest?.pages?.find((entry) => entry.page === currentPage);
  const remotePageUrl = currentManifestPage?.url;
  const shouldUseRemotePage = remoteState === "ready" && Boolean(remotePageUrl);
  const bookTitle = metadata?.title ?? catalogBook?.title ?? "Reader";
  const activePageDeliveryLabel = isActivePageAssetLoading
    ? "Preparing page for reading"
    : activePageAsset?.kind === "local"
      ? "Ready offline"
      : activePageAsset?.kind === "remote"
        ? "Reading with connection"
        : remoteState === "ready"
          ? "Not available offline yet"
          : "Preparing your page";
  const activePageSupportMessage =
    activePageAsset?.kind === "local"
      ? "This page is cached on this device and can open offline."
      : activePageAsset?.kind === "remote"
        ? "This page is opening with an internet connection and will save as you continue."
        : remoteState === "ready"
          ? "This page has not been cached locally yet. Connect once or download the volume for offline reading."
          : "Please wait while this page is prepared.";
  const editionLine = `${selectedLanguage?.title ?? languageId} • ${selectedVolume?.title ?? volumeId} • ${currentSection.title}`;

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

  useEffect(() => {
    if (!manifest) {
      return;
    }

    const pagesToPrefetch = Array.from(
      new Set([currentPage, currentPage + 1, currentPage + 2, currentPage - 1]),
    );

    void prefetchManifestPages(manifest, pagesToPrefetch);
  }, [currentPage, manifest]);

  useEffect(() => {
    setCurrentPage((previousPage) => {
      if (previousPage === routePage) {
        return previousPage;
      }

      flatListRef.current?.scrollToIndex({
        index: routePage - 1,
        animated: false,
      });
      return routePage;
    });
  }, [routePage]);

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

  const moveToPage = useCallback(
    (nextPage: number) => {
      const safePage = clampPage(nextPage);
      router.replace(
        `/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${safePage}` as const,
      );
    },
    [clampPage, readingBookId, resolvedLanguageId, resolvedVolumeId, router],
  );

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length === 0 || typeof viewableItems[0].item !== "number") {
        return;
      }

      const visiblePage = viewableItems[0].item;
      setCurrentPage((previousPage) => (previousPage === visiblePage ? previousPage : visiblePage));
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const renderPage = useCallback(
    ({ item: pageNum }: { item: number }) => {
      return (
        <View
          style={{
            width: screenWidth,
            height: screenHeight,
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ReaderPageSurface
            manifest={manifest}
            pageNum={pageNum}
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            backgroundColor={colors.background}
            textColor={colors.textStrong}
            mutedTextColor={theme === "light" ? "#5F6C65" : "#6D5D46"}
            remoteState={remoteState}
            isActivePage={pageNum === currentPage}
            onZoomChange={setIsZoomed}
            onPageLoadStateChange={setRemoteImageState}
          />
        </View>
      );
    },
    [colors.background, colors.textStrong, currentPage, manifest, remoteState, screenHeight, screenWidth, theme],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {Platform.OS === "web" ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            gap: 12,
          }}
        >
          <Text style={{ color: colors.textStrong, fontSize: 28, fontWeight: "800" }}>
            Image-based reader is ready
          </Text>
          <Text
            style={{
              color: theme === "light" ? "#5F6C65" : "#6D5D46",
              fontSize: 16,
              lineHeight: 24,
              textAlign: "center",
            }}
          >
            This reader is designed first for Android and iOS.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={pages}
          renderItem={renderPage}
          keyExtractor={(item) => `${readingBookId}-${resolvedLanguageId}-${resolvedVolumeId}-${item}`}
          horizontal
          pagingEnabled
          scrollEnabled={!isZoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={routePage - 1}
          getItemLayout={(_, index) => ({
            length: screenWidth,
            offset: screenWidth * index,
            index,
          })}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          windowSize={3}
          maxToRenderPerBatch={3}
          initialNumToRender={3}
          removeClippedSubviews
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: false,
              });
            }, 100);
          }}
        />
      )}

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.overlay,
          paddingTop: 50,
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.overlayLight,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
            {bookTitle}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: "600" }}>
            {editionLine}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            void cycleTheme();
          }}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.overlayLight,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons
            name={theme === "light" ? "sunny-outline" : "book-outline"}
            size={22}
            color={colors.text}
          />
        </Pressable>
        <Pressable
          onPress={() => {
            void toggleBookmark();
          }}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.overlayLight,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons
            name={existingBookmark ? "bookmark" : "bookmark-outline"}
            size={22}
            color={colors.text}
          />
        </Pressable>
      </View>

      <SafeAreaView
        edges={["bottom"]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.overlay,
        }}
      >
        <View style={{ paddingTop: 16, paddingBottom: 16, paddingHorizontal: 16, gap: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <Pressable
              disabled={currentPage <= 1}
              onPress={() => moveToPage(currentPage - 1)}
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: currentPage <= 1 ? colors.overlayMuted : colors.accent,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed && currentPage > 1 ? 0.8 : 1,
              })}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={currentPage <= 1 ? colors.textMuted : colors.textStrong}
              />
            </Pressable>

            <View style={{ flex: 1, alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                Page {currentPage} of {totalPages}
              </Text>
              <View
                style={{
                  width: "100%",
                  height: 6,
                  backgroundColor: "rgba(255, 249, 234, 0.2)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${progressPercent}%`,
                    backgroundColor: colors.accent,
                    borderRadius: 3,
                  }}
                />
              </View>
            </View>

            <Pressable
              disabled={currentPage >= totalPages}
              onPress={() => moveToPage(currentPage + 1)}
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: currentPage >= totalPages ? colors.overlayMuted : colors.accent,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed && currentPage < totalPages ? 0.8 : 1,
              })}
            >
              <Ionicons
                name="chevron-forward"
                size={24}
                color={currentPage >= totalPages ? colors.textMuted : colors.textStrong}
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

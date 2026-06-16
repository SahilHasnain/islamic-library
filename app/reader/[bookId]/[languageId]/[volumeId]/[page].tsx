import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BookCompletionModal } from "../../../../../components/book-completion-modal";
import { SessionCompletionModal } from "../../../../../components/session-completion-modal";
import { getReaderColors } from "../../../../../constants/theme";
import { ZoomableReaderImage } from "../../../../../components/zoomable-reader-image";
import { useAppTheme } from "../../../../../hooks/useAppTheme";
import { useBookCompletions } from "../../../../../hooks/useBookCompletions";
import { useBookmarks } from "../../../../../hooks/useBookmarks";
import { useReadingProgress } from "../../../../../hooks/useReadingProgress";
import { useRemoteBookData } from "../../../../../hooks/useRemoteBookData";
import { useResolvedManifestPageAsset } from "../../../../../hooks/useResolvedManifestPageAsset";
import { prefetchManifestPages } from "../../../../../lib/reader-prefetch";
import type { PublicBookTocEntry } from "../../../../../data/types";

const BOOK_COMPLETION_FINAL_PAGE_WINDOW = 3;
const BOOK_COMPLETION_FINAL_PAGE_MS = 120000;

function getPrintedPageStartPage(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 1
    ? Math.floor(value)
    : undefined;
}

function getOrderedTocEntries(entries: PublicBookTocEntry[]) {
  return [...entries]
    .filter((entry) => entry.title.trim())
    .sort((left, right) => (left.renderedPage ?? Number.MAX_SAFE_INTEGER) - (right.renderedPage ?? Number.MAX_SAFE_INTEGER));
}

function getTocEntryPage(entry: PublicBookTocEntry) {
  return Math.max(1, Math.floor(entry.renderedPage || entry.printedPage || 1));
}

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
}) {
  const { asset } = useResolvedManifestPageAsset(manifest, pageNum);
  const manifestPage = manifest?.pages?.find((entry) => entry.page === pageNum);
  const imageAspectRatio =
    manifestPage?.width && manifestPage?.height
      ? manifestPage.width / manifestPage.height
      : 0.707;

  if (asset?.source && asset.kind !== "missing") {
    return (
      <ZoomableReaderImage
        source={asset.source}
        width={screenWidth}
        height={Math.min(screenHeight, screenWidth / imageAspectRatio)}
        onZoomChange={onZoomChange}
        onError={() => { }}
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
  const { colors: appColors, resolvedTheme } = useAppTheme();
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
  const { progress, saveProgress } = useReadingProgress(readingBookId, languageId, volumeId);
  const { addBookmark, getBookmarkForPage, removeBookmark } = useBookmarks(readingBookId);
  const colors = getReaderColors(resolvedTheme);
  const requestedPage = Number(page ?? 1) || 1;
  const totalPages = manifest?.totalPages ?? Math.max(requestedPage, 1);
  const resolvedLanguageId = selectedLanguage?.id ?? languageId;
  const resolvedVolumeId = selectedVolume?.id ?? volumeId;
  const { isCompleted, markAsCompleted } = useBookCompletions(
    readingBookId,
    resolvedLanguageId,
    resolvedVolumeId,
  );
  const clampPage = useCallback(
    (value: number) => Math.min(Math.max(value, 1), totalPages),
    [totalPages],
  );
  const initialPage = useMemo(() => {
    return Math.min(Math.max(requestedPage, 1), totalPages);
  }, [requestedPage, totalPages]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [isZoomed, setIsZoomed] = useState(false);
  const [isPageModalVisible, setIsPageModalVisible] = useState(false);
  const [isTocVisible, setIsTocVisible] = useState(false);
  const [showSessionCompletionModal, setShowSessionCompletionModal] = useState(false);
  const [sessionCompletionData, setSessionCompletionData] = useState<{
    pagesRead: number;
    durationMinutes: number;
  } | null>(null);
  const [showBookCompletionModal, setShowBookCompletionModal] = useState(false);
  const flatListRef = useRef<FlatList<number>>(null);
  // Session metrics are computed locally in this screen.
  // - duration: active app time while this screen is mounted
  // - pagesRead: count of unique pages actually viewed (not a page range)
  const sessionAccumulatedMs = useRef(0);
  const sessionTickStartedAt = useRef(Date.now());
  const sessionTimerRunning = useRef(true);
  const sessionPagesViewedRef = useRef<Set<number>>(new Set([initialPage]));
  const sessionMinPage = useRef(initialPage);
  const sessionMaxPage = useRef(initialPage);
  const sessionCompletedRef = useRef(false);
  const finalPagesEnteredAt = useRef<number | null>(null);
  const bookCompletionPromptSuppressedRef = useRef(false);

  const getSessionDurationMs = useCallback(() => {
    return (
      sessionAccumulatedMs.current +
      (sessionTimerRunning.current ? Date.now() - sessionTickStartedAt.current : 0)
    );
  }, []);
  const pages = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );
  const tocEntries = getOrderedTocEntries(selectedVolume?.tocEntries ?? []);
  const printedPageStartPage = getPrintedPageStartPage(selectedVolume?.printedPageStartPage);
  const manifestPages = useMemo(() => manifest?.pages ?? [], [manifest?.pages]);
  const currentManifestPage = manifestPages.find((entry) => entry.page === currentPage);
  const automaticPageLabel = !printedPageStartPage
    ? currentManifestPage?.printedPageLabel?.trim()
    : undefined;
  const automaticLastPageLabel = !printedPageStartPage
    ? [...manifestPages].reverse().find((entry) => entry.printedPageLabel?.trim())?.printedPageLabel?.trim()
    : undefined;
  const automaticPageLookup = useMemo(() => {
    const lookup = new Map<string, number>();

    if (printedPageStartPage) {
      return lookup;
    }

    manifestPages.forEach((entry) => {
      const label = entry.printedPageLabel?.trim();

      if (label) {
        lookup.set(label, entry.page);
      }
    });

    return lookup;
  }, [manifestPages, printedPageStartPage]);
  const printedTotalPages = printedPageStartPage
    ? Math.max(1, totalPages - printedPageStartPage + 1)
    : totalPages;
  const printedCurrentPage = printedPageStartPage
    ? currentPage >= printedPageStartPage
      ? currentPage - printedPageStartPage + 1
      : undefined
    : currentPage;
  const pageInputDisplayValue = automaticPageLabel ?? String(printedCurrentPage ?? currentPage);
  const footerPageLabel = automaticPageLabel
    ? `Page ${automaticPageLabel}${automaticLastPageLabel ? ` of ${automaticLastPageLabel}` : ""}`
    : printedCurrentPage
      ? `Page ${printedCurrentPage} of ${printedTotalPages}`
      : `Front matter ${currentPage} of ${Math.max(1, (printedPageStartPage ?? 1) - 1)}`;
  const currentTocEntry = [...tocEntries]
    .reverse()
    .find((entry) => getTocEntryPage(entry) <= currentPage);
  const progressPercent = Math.round((currentPage / totalPages) * 100);
  const mutedBodyColor = appColors.textMuted;
  const controlSurfaceColor = appColors.primaryButton;
  const pageModalSurfaceColor = colors.secondaryPanel;
  const outlineColor = appColors.border;
  const iconBadgeColor = colors.overlayLight;
  const existingBookmark = getBookmarkForPage(
    readingBookId,
    resolvedLanguageId,
    resolvedVolumeId,
    currentPage,
  );
  const bookTitle = metadata?.title ?? catalogBook?.title ?? "Reader";
  const editionLine = [selectedLanguage?.title ?? languageId, selectedVolume?.title ?? volumeId, currentTocEntry?.title]
    .filter(Boolean)
    .join(" | ");

  const pagesViewed = useMemo(() => {
    return Array.from(new Set([...(progress?.pagesViewed ?? []), currentPage])).sort(
      (left, right) => left - right,
    );
  }, [currentPage, progress?.pagesViewed]);

  useEffect(() => {
    if (!manifest || remoteState !== "ready") {
      return;
    }

    void saveProgress({
      bookId: readingBookId,
      languageId: resolvedLanguageId,
      volumeId: resolvedVolumeId,
      page: currentPage,
      updatedAt: new Date().toISOString(),
      sessionCount: Math.max(1, progress?.sessionCount ?? 0),
      pagesViewed,
    });
  }, [
    currentPage,
    manifest,
    pagesViewed,
    progress?.sessionCount,
    readingBookId,
    remoteState,
    resolvedLanguageId,
    resolvedVolumeId,
    saveProgress,
  ]);

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
    const targetPage = Math.min(Math.max(requestedPage, 1), totalPages);

    setCurrentPage((previousPage) => {
      if (previousPage === targetPage) {
        return previousPage;
      }

      flatListRef.current?.scrollToIndex({
        index: targetPage - 1,
        animated: false,
      });
      return targetPage;
    });
  }, [requestedPage, totalPages]);

  useEffect(() => {
    setPageInput(pageInputDisplayValue);
  }, [pageInputDisplayValue]);

  useEffect(() => {
    sessionMinPage.current = Math.min(sessionMinPage.current, currentPage);
    sessionMaxPage.current = Math.max(sessionMaxPage.current, currentPage);
    sessionPagesViewedRef.current.add(currentPage);
  }, [currentPage]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (!sessionTimerRunning.current) {
          sessionTimerRunning.current = true;
          sessionTickStartedAt.current = Date.now();
        }
        return;
      }

      // Treat anything other than "active" as paused time.
      if (sessionTimerRunning.current) {
        sessionAccumulatedMs.current += Date.now() - sessionTickStartedAt.current;
        sessionTimerRunning.current = false;
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const isNearBookEnd =
      currentPage >= Math.max(1, totalPages - BOOK_COMPLETION_FINAL_PAGE_WINDOW + 1);

    if (
      !isNearBookEnd ||
      isCompleted ||
      showBookCompletionModal ||
      bookCompletionPromptSuppressedRef.current
    ) {
      finalPagesEnteredAt.current = null;
      return;
    }

    finalPagesEnteredAt.current = finalPagesEnteredAt.current ?? Date.now();

    const interval = setInterval(() => {
      const enteredAt = finalPagesEnteredAt.current;
      if (!enteredAt || Date.now() - enteredAt < BOOK_COMPLETION_FINAL_PAGE_MS) {
        return;
      }

      setShowBookCompletionModal(true);
      finalPagesEnteredAt.current = null;
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPage, isCompleted, showBookCompletionModal, totalPages]);

  const handleMarkBookCompleted = useCallback(async () => {
    const durationMinutes = Math.max(1, Math.round(getSessionDurationMs() / 60000));
    await markAsCompleted({
      bookId: readingBookId,
      languageId: resolvedLanguageId,
      volumeId: resolvedVolumeId,
      completedAt: new Date().toISOString(),
      totalPages,
      finalPage: currentPage,
      totalPagesRead: pagesViewed.length,
      totalMinutes: durationMinutes,
    });
    setShowBookCompletionModal(false);
    bookCompletionPromptSuppressedRef.current = true;
  }, [
    currentPage,
    getSessionDurationMs,
    markAsCompleted,
    pagesViewed.length,
    readingBookId,
    resolvedLanguageId,
    resolvedVolumeId,
    totalPages,
  ]);

  const handleKeepReadingBook = useCallback(() => {
    setShowBookCompletionModal(false);
    bookCompletionPromptSuppressedRef.current = true;
  }, []);

  const completeSession = useCallback(async () => {
    if (sessionCompletedRef.current) {
      return false;
    }

    const durationMs = getSessionDurationMs();
    const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
    const pagesRead = sessionPagesViewedRef.current.size;

    // Only consider it a meaningful session if:
    // - At least 2 minutes of reading AND
    // - At least 2 pages read
    const isMeaningfulSession = durationMs >= 120000 && pagesRead >= 2;

    if (isMeaningfulSession) {
      sessionCompletedRef.current = true;

      setSessionCompletionData({
        pagesRead,
        durationMinutes,
      });
      setShowSessionCompletionModal(true);
      return true;
    }

    // For short sessions, just exit without modal
    return false;
  }, [getSessionDurationMs]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showBookCompletionModal) {
        handleKeepReadingBook();
        return true;
      }

      if (showSessionCompletionModal) {
        setShowSessionCompletionModal(false);
        setSessionCompletionData(null);
        return true;
      }

      void completeSession().then((showingModal) => {
        if (!showingModal) {
          router.back();
        }
      });
      return true;
    });

    return () => backHandler.remove();
  }, [
    completeSession,
    handleKeepReadingBook,
    router,
    showBookCompletionModal,
    showSessionCompletionModal,
  ]);

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
      setCurrentPage(safePage);
      flatListRef.current?.scrollToIndex({
        index: safePage - 1,
        animated: true,
      });
    },
    [clampPage],
  );

  const submitPageInput = useCallback(() => {
    const trimmedInput = pageInput.trim();
    const parsedPage = Number(pageInput.replace(/[^0-9]/g, ""));
    const targetPage =
      automaticPageLookup.get(trimmedInput) ??
      (Number.isFinite(parsedPage) && printedPageStartPage
        ? printedPageStartPage + parsedPage - 1
        : parsedPage);

    moveToPage(Number.isFinite(targetPage) ? targetPage : currentPage);
    setIsPageModalVisible(false);
  }, [automaticPageLookup, currentPage, moveToPage, pageInput, printedPageStartPage]);

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
            paddingTop: 70,
          }}
        >
          <ReaderPageSurface
            manifest={manifest}
            pageNum={pageNum}
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            backgroundColor={colors.background}
            textColor={colors.textStrong}
            mutedTextColor={mutedBodyColor}
            remoteState={remoteState}
            isActivePage={pageNum === currentPage}
            onZoomChange={setIsZoomed}
          />
        </View>
      );
    },
    [colors.background, colors.textStrong, currentPage, manifest, mutedBodyColor, remoteState, screenHeight, screenWidth],
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
                color: mutedBodyColor,
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
          initialScrollIndex={initialPage - 1}
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
          onPress={() => {
            void completeSession().then((showingModal) => {
              if (!showingModal) {
                router.back();
              }
            });
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

        {__DEV__ && (
          <Pressable
            onPress={() => {
              setSessionCompletionData({ pagesRead: 7, durationMinutes: 12 });
              setShowSessionCompletionModal(true);
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
            <Ionicons name="checkmark-done" size={20} color={colors.text} />
          </Pressable>
        )}

        {__DEV__ && (
          <Pressable
            onPress={() => {
              setShowBookCompletionModal(true);
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
            <Ionicons name="ribbon" size={20} color={colors.text} />
          </Pressable>
        )}
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
              onPress={() => setIsPageModalVisible(true)}
              style={({ pressed }) => ({
                minWidth: 72,
                height: 48,
                borderRadius: 24,
                paddingHorizontal: 18,
                backgroundColor: controlSurfaceColor,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>Go</Text>
            </Pressable>

            <View style={{ flex: 1, alignItems: "center", gap: 8, transform: [{ translateX: 14 }] }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                {footerPageLabel}
              </Text>
              <View
                style={{
                  width: "100%",
                  height: 6,
                  backgroundColor: colors.overlayMuted,
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
              onPress={() => setIsTocVisible(true)}
              style={({ pressed }) => ({
                minWidth: 72,
                height: 48,
                borderRadius: 24,
                paddingHorizontal: 18,
                backgroundColor: colors.overlayLight,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>TOC</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <Modal
        visible={isPageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPageModalVisible(false)}
      >
        <Pressable
          onPress={() => setIsPageModalVisible(false)}
          style={{
            flex: 1,
            backgroundColor: appColors.scrim,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Pressable
            onPress={() => { }}
            style={{
              width: "100%",
              maxWidth: 360,
              borderRadius: 24,
              backgroundColor: colors.panel,
              padding: 20,
              gap: 16,
            }}
          >
            <Text style={{ color: colors.panelText, fontSize: 18, fontWeight: "800" }}>
              Go to page
            </Text>
            <TextInput
              autoFocus
              value={pageInput}
              onChangeText={(value) => setPageInput(value.replace(/[^0-9]/g, ""))}
              onSubmitEditing={submitPageInput}
              keyboardType="number-pad"
              placeholder={`Enter page 1-${automaticLastPageLabel ?? printedTotalPages}`}
              placeholderTextColor={appColors.textSubtle}
              style={{
                height: 48,
                borderRadius: 16,
                paddingHorizontal: 16,
                backgroundColor: pageModalSurfaceColor,
                color: colors.panelText,
                fontSize: 16,
                fontWeight: "600",
              }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable
                onPress={() => setIsPageModalVisible(false)}
                style={({ pressed }) => ({
                  height: 44,
                  borderRadius: 22,
                  paddingHorizontal: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pageModalSurfaceColor,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: colors.panelText, fontSize: 14, fontWeight: "600" }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submitPageInput}
                style={({ pressed }) => ({
                  height: 44,
                  borderRadius: 22,
                  paddingHorizontal: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: controlSurfaceColor,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                  Go
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isTocVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsTocVisible(false)}
      >
        <Pressable
          onPress={() => setIsTocVisible(false)}
          style={{
            flex: 1,
            backgroundColor: appColors.scrim,
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => { }}
            style={{
              maxHeight: "72%",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: colors.panel,
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 28,
              gap: 14,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.panelText, fontSize: 20, fontWeight: "800" }}>
                  Table of Contents
                </Text>
                <Text style={{ color: appColors.textMuted, fontSize: 13, marginTop: 4 }}>
                  {tocEntries.length ? `${tocEntries.length} entries` : "TOC not available for this book."}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsTocVisible(false)}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: pageModalSurfaceColor,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Ionicons name="close" size={22} color={colors.panelText} />
              </Pressable>
            </View>

            {tocEntries.length ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                {tocEntries.map((entry, index) => {
                  const entryPage = getTocEntryPage(entry);
                  const isActive = entryPage <= currentPage && (!tocEntries[index + 1] || getTocEntryPage(tocEntries[index + 1]) > currentPage);
                  return (
                    <Pressable
                      key={`${entry.title}-${index}`}
                      onPress={() => {
                        moveToPage(entryPage);
                        setIsTocVisible(false);
                      }}
                      style={({ pressed }) => ({
                        borderRadius: 16,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        marginLeft: Math.min(Math.max((entry.level ?? 1) - 1, 0), 3) * 12,
                        backgroundColor: isActive ? controlSurfaceColor : pageModalSurfaceColor,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ color: isActive ? colors.text : colors.panelText, fontSize: 15, fontWeight: "700" }}>
                        {entry.title}
                      </Text>
                      <Text style={{ color: isActive ? colors.text : appColors.textMuted, fontSize: 12, marginTop: 4 }}>
                        {entry.printedPage ? `Printed page ${entry.printedPage}` : `Reader page ${entryPage}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ borderRadius: 18, backgroundColor: pageModalSurfaceColor, padding: 16, gap: 8 }}>
                <Text style={{ color: colors.panelText, fontSize: 16, fontWeight: "800" }}>
                  TOC not available
                </Text>
                <Text style={{ color: appColors.textMuted, fontSize: 14, lineHeight: 20 }}>
                  This book does not have table of contents metadata yet. Use Go to jump to a known page.
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <BookCompletionModal
        visible={showBookCompletionModal}
        bookTitle={bookTitle}
        totalPages={totalPages}
        finalPage={currentPage}
        scrimColor={appColors.scrim}
        panelColor={colors.panel}
        panelTextColor={colors.panelText}
        mutedTextColor={appColors.textMuted}
        primaryActionColor={colors.accent}
        primaryActionTextColor={colors.textStrong}
        secondaryActionColor={pageModalSurfaceColor}
        outlineColor={outlineColor}
        iconBadgeColor={iconBadgeColor}
        successColor={appColors.success}
        onMarkCompleted={() => {
          void handleMarkBookCompleted();
        }}
        onKeepReading={handleKeepReadingBook}
      />

      {showSessionCompletionModal && sessionCompletionData && (
        <SessionCompletionModal
           visible={showSessionCompletionModal}
           scrimColor={appColors.scrim}
           panelColor={colors.panel}
           panelTextColor={colors.panelText}
           mutedTextColor={appColors.textMuted}
           encouragementColor={appColors.textSubtle}
           statsLabelColor={appColors.textSubtle}
           primaryActionColor={colors.accent}
           primaryActionTextColor={colors.textStrong}
           secondaryActionColor={pageModalSurfaceColor}
           outlineColor={outlineColor}
           iconBadgeColor={iconBadgeColor}
           successColor={appColors.success}
           pagesRead={sessionCompletionData.pagesRead}
           durationMinutes={sessionCompletionData.durationMinutes}
           onContinue={() => {
             setShowSessionCompletionModal(false);
             setSessionCompletionData(null);
           }}
           onGoHome={() => {
             setShowSessionCompletionModal(false);
             setSessionCompletionData(null);
             router.replace("/(tabs)/library");
           }}
         />
      )}
    </View>
  );
}

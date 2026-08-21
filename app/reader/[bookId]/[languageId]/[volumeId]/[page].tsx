import { Ionicons } from "@expo/vector-icons";
import * as Brightness from "expo-brightness";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BookCompletionModal } from "../../../../../components/book-completion-modal";
import { getReaderColors } from "../../../../../constants/theme";
import { ZoomableReaderImage } from "../../../../../components/zoomable-reader-image";
import { useAppTheme } from "../../../../../hooks/useAppTheme";
import { useBookCompletions } from "../../../../../hooks/useBookCompletions";
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

function toTitleCase(value: string) {
  return value
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === "-") {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
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
  onPress,
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
  onPress?: () => void;
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
        onPress={onPress}
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
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [brightness, setBrightness] = useState(0.5);
  const [showBookCompletionModal, setShowBookCompletionModal] = useState(false);
  const flatListRef = useRef<FlatList<number>>(null);
  const progressTrackRef = useRef<View>(null);
  const tocScrollRef = useRef<ScrollView>(null);
  const activeTocIndexRef = useRef(0);
  const tocRowYOffsetsRef = useRef<number[]>([]);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const [brightnessTrackWidth, setBrightnessTrackWidth] = useState(0);
  const originalBrightnessRef = useRef<number | null>(null);
  // Session duration is tracked locally in this screen (active app time while mounted)
  // and used for book completion stats.
  const sessionAccumulatedMs = useRef(0);
  const sessionTickStartedAt = useRef(Date.now());
  const sessionTimerRunning = useRef(true);
  const finalPagesEnteredAt = useRef<number | null>(null);
  const bookCompletionPromptSuppressedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    let isMounted = true;

    void Brightness.getBrightnessAsync()
      .then((currentBrightness) => {
        if (isMounted) {
          originalBrightnessRef.current = currentBrightness;
          setBrightness(currentBrightness);
        }
      })
      .catch(() => {
        // Brightness access can be unavailable on some devices.
      });

    return () => {
      isMounted = false;

      if (originalBrightnessRef.current !== null) {
        void Brightness.setBrightnessAsync(originalBrightnessRef.current).catch(() => {
          // Keep leaving the reader resilient if brightness restoration fails.
        });
      }
    };
  }, []);

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
  const bookTitle = metadata?.title ?? catalogBook?.title ?? "Reader";
  const editionLine = currentTocEntry?.title ?? selectedVolume?.title ?? volumeId;

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

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showBookCompletionModal) {
        handleKeepReadingBook();
        return true;
      }

      router.back();
      return true;
    });

    return () => backHandler.remove();
  }, [handleKeepReadingBook, router, showBookCompletionModal]);

  useEffect(() => {
    if (!isTocVisible || tocEntries.length === 0) {
      return;
    }

    const scrollHandle = setTimeout(() => {
      const targetOffset = tocRowYOffsetsRef.current[activeTocIndexRef.current] ?? 0;
      tocScrollRef.current?.scrollTo({
        y: Math.max(0, targetOffset - 8),
        animated: false,
      });
    }, 120);

    return () => clearTimeout(scrollHandle);
  }, [isTocVisible, tocEntries.length]);

  const moveToPage = useCallback(
    (nextPage: number, animated = true) => {
      const safePage = clampPage(nextPage);
      setCurrentPage(safePage);
      flatListRef.current?.scrollToIndex({
        index: safePage - 1,
        animated,
      });
    },
    [clampPage],
  );

  const updatePageFromProgressGesture = useCallback(
    (locationX: number) => {
      if (progressTrackWidth <= 0) {
        return;
      }

      const fraction = Math.min(Math.max(locationX / progressTrackWidth, 0), 1);
      const targetPage = clampPage(Math.round(fraction * totalPages));
      moveToPage(targetPage, false);
    },
    [clampPage, moveToPage, progressTrackWidth, totalPages],
  );

  const updateBrightnessFromGesture = useCallback(
    (locationX: number) => {
      if (brightnessTrackWidth <= 0 || Platform.OS === "web") {
        return;
      }

      const nextBrightness = Math.min(Math.max(locationX / brightnessTrackWidth, 0.05), 1);
      setBrightness(nextBrightness);
      void Brightness.setBrightnessAsync(nextBrightness).catch(() => {
        // Keep the reader usable if the platform rejects a brightness update.
      });
    },
    [brightnessTrackWidth],
  );

  const progressPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          updatePageFromProgressGesture(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          updatePageFromProgressGesture(event.nativeEvent.locationX);
        },
      }),
    [updatePageFromProgressGesture],
  );

  const brightnessPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          updateBrightnessFromGesture(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          updateBrightnessFromGesture(event.nativeEvent.locationX);
        },
      }),
    [updateBrightnessFromGesture],
  );

  const exitFocusMode = useCallback(() => {
    setIsFocusMode(false);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    StatusBar.setHidden(isFocusMode, "fade");

    return () => {
      StatusBar.setHidden(false, "fade");
    };
  }, [isFocusMode]);
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
            onPress={isFocusMode ? exitFocusMode : undefined}
            onZoomChange={setIsZoomed}
          />
        </View>
      );
    },
    [colors.background, colors.textStrong, currentPage, exitFocusMode, isFocusMode, manifest, mutedBodyColor, remoteState, screenHeight, screenWidth],
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

      {!isFocusMode && (
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
           backgroundColor: colors.overlay,
           height: 142,
           paddingTop: 50,
           paddingHorizontal: 16,
           gap: 6,
         }}
       >
         <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={() => {
              router.back();
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
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}
              numberOfLines={1}
            >
              {bookTitle}
            </Text>
            <Text
              style={{ color: colors.textMuted, fontSize: 15, fontWeight: "600" }}
              numberOfLines={1}
            >
              {editionLine}
            </Text>
          </View>

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

        {Platform.OS !== "web" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="sunny-outline" size={16} color={colors.text} />
            <View
              onLayout={(event) => setBrightnessTrackWidth(event.nativeEvent.layout.width)}
              {...brightnessPanResponder.panHandlers}
              style={{ flex: 1, paddingVertical: 10, justifyContent: "center" }}
            >
              <View style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)" }}>
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${brightness * 100}%`,
                    backgroundColor: colors.text,
                    opacity: 0.85,
                    borderRadius: 2,
                  }}
                />
                <View
                  style={{
                    position: "absolute",
                    top: -5,
                    left: `${brightness * 100}%`,
                    width: 14,
                    height: 14,
                    marginLeft: -7,
                    borderRadius: 7,
                    backgroundColor: colors.text,
                  }}
                />
              </View>
            </View>
          </View>
        )}
      </View>
      )}

      {!isFocusMode && (
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

            <View style={{ flex: 1, alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                {footerPageLabel}
              </Text>
              <View
                ref={progressTrackRef}
                onLayout={(event) => {
                  const { width } = event.nativeEvent.layout;
                  if (width !== progressTrackWidth) {
                    setProgressTrackWidth(width);
                  }
                }}
                {...progressPanResponder.panHandlers}
                style={{
                  width: "78%",
                  paddingVertical: 10,
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    height: 6,
                    backgroundColor: colors.overlayMuted,
                    borderRadius: 3,
                    overflow: "visible",
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${progressPercent}%`,
                      backgroundColor: colors.accent,
                      borderRadius: 3,
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      top: -5,
                      left: `${progressPercent}%`,
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: colors.accent,
                      borderWidth: 2,
                      borderColor: colors.text,
                      marginLeft: -8,
                    }}
                  />
                </View>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              {Platform.OS !== "web" && (
                <Pressable
                  onPress={() => setIsFocusMode(true)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: controlSurfaceColor,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Ionicons name="eye-off-outline" size={22} color={colors.text} />
                </Pressable>
              )}

              <Pressable
                onPress={() => setIsTocVisible(true)}
                hitSlop={8}
                style={({ pressed }) => ({
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: controlSurfaceColor,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Ionicons name="list-outline" size={22} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
      )}

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
          style={{ flex: 1, backgroundColor: appColors.scrim, justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: "68%",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: colors.panel,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 28,
            }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.overlayLight }} />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.panelText, fontSize: 21, fontWeight: "800" }}>
                  Table of Contents
                </Text>
                <Text style={{ color: appColors.textMuted, fontSize: 13, marginTop: 3 }} numberOfLines={1}>
                  {tocEntries.length ? `${tocEntries.length} entries · tap to jump` : bookTitle}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsTocVisible(false)}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 6 })}
              >
                <Ionicons name="close" size={23} color={colors.panelText} />
              </Pressable>
            </View>

            {tocEntries.length ? (
              <ScrollView
                ref={tocScrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: 14, paddingBottom: 8 }}
              >
                {tocEntries.map((entry, index) => {
                  const entryPage = getTocEntryPage(entry);
                  const hasPage = typeof entry.printedPage === "number" || typeof entry.renderedPage === "number";
                  const isActive = entryPage <= currentPage && (!tocEntries[index + 1] || getTocEntryPage(tocEntries[index + 1]) > currentPage);

                  if (isActive) {
                    activeTocIndexRef.current = index;
                  }

                  return (
                    <Pressable
                      key={`${entry.title}-${index}`}
                      onPress={() => {
                        moveToPage(entryPage);
                        setIsTocVisible(false);
                      }}
                      onLayout={(event) => {
                        tocRowYOffsetsRef.current[index] = event.nativeEvent.layout.y;
                      }}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "flex-start",
                        flexWrap: "nowrap",
                        paddingVertical: 12,
                        paddingLeft: 4,
                        paddingRight: 6,
                        opacity: pressed ? 0.55 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 3,
                          height: 16,
                          borderRadius: 2,
                          marginTop: 3,
                          marginRight: 10,
                          backgroundColor: isActive ? colors.accent : "transparent",
                        }}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            color: isActive ? colors.accent : colors.panelText,
                            fontSize: 14,
                            fontWeight: "500",
                            lineHeight: 21,
                            textTransform: "capitalize",
                          }}
                        >
                          {toTitleCase(entry.title)}
                        </Text>
                      </View>
                      <View style={{ width: 50, paddingTop: 4, alignItems: "flex-end" }}>
                        <Text
                          style={{
                            color: isActive ? colors.accent : appColors.textMuted,
                            fontSize: 11.5,
                            fontWeight: "500",
                            textAlign: "right",
                          }}
                          numberOfLines={1}
                        >
                          {hasPage ? `p. ${entryPage}` : "—"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: outlineColor, paddingTop: 18, gap: 8 }}>
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
    </View>
  );
}

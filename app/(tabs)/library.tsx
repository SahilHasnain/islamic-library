import { Image } from "expo-image";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CardTitle,
  ErrorCard,
  HeroCard,
  LoadingCard,
  MetaText,
  Screen
} from "../../components/ui";
import { colors, radii, spacing, typography } from "../../constants/theme";
import type { PublicCatalogBook } from "../../data/types";
import { useBookCompletions } from "../../hooks/useBookCompletions";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { useRemoteBookData } from "../../hooks/useRemoteBookData";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";
import { useVolumeDownload } from "../../hooks/useVolumeDownload";

function getContinueLine(page?: number) {
  return page ? `Page ${page}` : "Not started yet";
}

function normalizeCategoryLabel(category?: string) {
  const trimmed = category?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Uncategorized";
}

function getCategoryDisplayLabel({
  category,
  categoryLabel,
}: {
  category?: string;
  categoryLabel?: string;
}) {
  const curatedLabel = categoryLabel?.trim();
  if (curatedLabel) {
    return curatedLabel;
  }

  return normalizeCategoryLabel(category);
}

function getDownloadButtonLabel({
  canDownload,
  isDownloading,
  isFullyDownloaded,
  progressPercent,
}: {
  canDownload: boolean;
  isDownloading: boolean;
  isFullyDownloaded: boolean;
  progressPercent: number;
}) {
  if (isDownloading) {
    return progressPercent > 0 ? `Saving... ${progressPercent}%` : "Saving...";
  }

  if (isFullyDownloaded) {
    return "Remove Download";
  }

  if (!canDownload) {
    return "";
  }

  return "Save Offline";
}

function FeaturedBookHero({
  bookId,
  title,
  subtitle,
  page,
  languageId,
  volumeId,
  coverImage,
}: {
  bookId: string;
  title: string;
  subtitle?: string;
  page?: number;
  languageId?: string;
  volumeId?: string;
  coverImage?: string;
}) {
  const { manifest, metadata, selectedLanguage, selectedVolume } = useRemoteBookData(
    bookId,
    languageId,
    volumeId,
  );
  const { canDownload, downloadAll, isDownloading, isFullyDownloaded, progressPercent, removeDownload } =
    useVolumeDownload(manifest);

  const downloadButtonLabel = getDownloadButtonLabel({
    canDownload,
    isDownloading,
    isFullyDownloaded,
    progressPercent,
  });
  const readerLanguageId =
    selectedLanguage?.id ?? languageId ?? metadata?.languages[0]?.id ?? "english";
  const readerVolumeId =
    selectedVolume?.id ??
    volumeId ??
    selectedLanguage?.volumes[0]?.id ??
    metadata?.languages[0]?.volumes[0]?.id ??
    "volume1";
  const readerPage = page ?? 1;

  return (
    <HeroCard>
      <Text
        style={{
          color: colors.textOnDark,
          fontSize: typography.label,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Continue Reading
      </Text>

      <View style={{ flexDirection: "row", gap: 16 }}>
        {/* Cover Thumbnail */}
        <View
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          {coverImage ? (
            <Image
              source={{ uri: coverImage }}
              contentFit="cover"
              transition={120}
              style={{
                width: 90,
                height: 126,
                borderRadius: 8,
                backgroundColor: colors.surfaceMuted,
              }}
            />
          ) : (
            <View
              style={{
                width: 90,
                height: 126,
                borderRadius: 8,
                backgroundColor: colors.accent,
              }}
            />
          )}
        </View>

        {/* Book Info */}
        <View style={{ flex: 1, gap: spacing.gapMd, justifyContent: "center" }}>
          <View style={{ gap: 8 }}>
            <Text
              style={{
                color: colors.textOnDark,
                fontSize: typography.title,
                fontWeight: "800",
              }}
              numberOfLines={2}
            >
              {title}
            </Text>
            <Text
              style={{
                color: colors.textOnDarkMuted,
                fontSize: typography.body,
                lineHeight: 22,
              }}
              numberOfLines={1}
            >
              {subtitle ?? "Reading edition"}
            </Text>
            <Text
              style={{
                color: colors.textOnDarkSubtle,
                fontSize: typography.bodySmall,
                lineHeight: 22,
              }}
            >
              {getContinueLine(page)}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Link
          href={`/reader/${bookId}/${readerLanguageId}/${readerVolumeId}/${readerPage}` as const}
          asChild
        >
          <Pressable
            style={{
              borderRadius: radii.pill,
              backgroundColor: colors.accent,
              paddingHorizontal: 20,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: typography.bodySmall,
                fontWeight: "800",
              }}
            >
              {page ? "Resume Reading" : "Start Reading"}
            </Text>
          </Pressable>
        </Link>

        <Link href={`/book/${bookId}` as const} asChild>
          <Pressable
            style={{
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.textOnDarkMuted,
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                color: colors.textOnDark,
                fontSize: typography.control,
                fontWeight: "800",
              }}
            >
              View Book
            </Text>
          </Pressable>
        </Link>

        {canDownload ? (
          <Pressable
            onPress={() => {
              void (isFullyDownloaded ? removeDownload() : downloadAll());
            }}
            style={{
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.textOnDarkMuted,
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                color: colors.textOnDark,
                fontSize: typography.control,
                fontWeight: "800",
              }}
            >
              {downloadButtonLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </HeroCard>
  );
}

function LibraryBookCard({
  bookId,
  title,
  subtitle,
  category,
  page,
  languageId,
  volumeId,
  coverImage,
}: {
  bookId: string;
  title: string;
  subtitle?: string;
  category?: string;
  page?: number;
  languageId?: string;
  volumeId?: string;
  coverImage?: string;
}) {
  const { metadata, selectedLanguage, selectedVolume } = useRemoteBookData(
    bookId,
    languageId,
    volumeId,
  );

  const readerLanguageId =
    selectedLanguage?.id ?? languageId ?? metadata?.languages[0]?.id ?? "english";
  const readerVolumeId =
    selectedVolume?.id ??
    volumeId ??
    selectedLanguage?.volumes[0]?.id ??
    metadata?.languages[0]?.volumes[0]?.id ??
    "volume1";
  const readerPage = page ?? 1;

  const totalLanguages = metadata?.languages?.length ?? 0;
  const totalVolumes = selectedLanguage?.volumes?.length ?? 0;
  const hasMultipleLanguages = totalLanguages > 1;
  const hasMultipleVolumes = totalVolumes > 1;

  const buildEnhancedSubtitle = () => {
    const parts: string[] = [];

    if (hasMultipleLanguages && selectedLanguage) {
      const langTitle = selectedLanguage.nativeTitle || selectedLanguage.title;
      parts.push(`${langTitle} (${totalLanguages} languages)`);
    } else if (selectedLanguage) {
      parts.push(selectedLanguage.nativeTitle || selectedLanguage.title);
    }

    if (hasMultipleVolumes && selectedVolume) {
      const volumeLabel = selectedVolume.subtitle?.trim() || selectedVolume.title;
      parts.push(`${volumeLabel} of ${totalVolumes}`);
    }

    if (parts.length > 0) {
      return parts.join(" • ");
    }

    return subtitle ?? "Ready for reading";
  };

  const enhancedSubtitle = buildEnhancedSubtitle();

  return (
    <View
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
            {enhancedSubtitle}
          </Text>
        </View>
      </View>

      {/* Action Button */}
      <Link href={`/book/${bookId}` as const} asChild>
        <Pressable
          style={{
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: colors.accent,
            paddingHorizontal: 20,
            paddingVertical: 10,
            width: "100%",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.text, fontSize: typography.control, fontWeight: "800" }}>
            View
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}

function InProgressCard({
  bookId,
  title,
  subtitle,
  page,
  languageId,
  volumeId,
}: {
  bookId: string;
  title: string;
  subtitle?: string;
  page?: number;
  languageId?: string;
  volumeId?: string;
}) {
  const { metadata, selectedLanguage, selectedVolume } = useRemoteBookData(
    bookId,
    languageId,
    volumeId,
  );
  const readerLanguageId =
    selectedLanguage?.id ?? languageId ?? metadata?.languages[0]?.id ?? "english";
  const readerVolumeId =
    selectedVolume?.id ??
    volumeId ??
    selectedLanguage?.volumes[0]?.id ??
    metadata?.languages[0]?.volumes[0]?.id ??
    "volume1";
  const readerPage = page ?? 1;

  return (
    <Link
      href={`/reader/${bookId}/${readerLanguageId}/${readerVolumeId}/${readerPage}` as const}
      asChild
    >
      <Pressable
        style={{
          backgroundColor: colors.surfaceMuted,
          borderRadius: radii.md,
          padding: spacing.card,
          gap: 6,
          width: 260,
        }}
      >
        <Text
          style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          style={{ color: colors.textMuted, fontSize: typography.bodySmall, lineHeight: 22 }}
          numberOfLines={2}
        >
          {subtitle ?? "Continue from your saved reading position"}
        </Text>
        <MetaText>{getContinueLine(page)}</MetaText>
      </Pressable>
    </Link>
  );
}

export default function LibraryScreen() {
  const { error, isLoaded, latestProgressByBook, refreshProgress } = useReadingProgress();
  const { completedBookIds, completionMap, refreshCompletions } = useBookCompletions();
  const {
    catalog,
    error: catalogError,
    hasRemoteCatalog,
    isConfigured: isCatalogConfigured,
    isLoading: isCatalogLoading,
  } = useRemoteCatalog();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"alpha" | "recent">("recent");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showLanguageMenu, setShowLanguageMenu] = useState<boolean>(false);
  const [bookMetadataMap, setBookMetadataMap] = useState<Record<string, { languages: string[] }>>({});

  useFocusEffect(
    useCallback(() => {
      void refreshProgress();
      void refreshCompletions();
    }, [refreshCompletions, refreshProgress]),
  );

  const remoteBooks = catalog?.books ?? [];
  const completedBookIdSet = new Set(completedBookIds);
  const completedBooks = remoteBooks.filter((book) => completedBookIdSet.has(book.id));
  const inProgressBooks = remoteBooks.filter(
    (book) => latestProgressByBook[book.id] && !completedBookIdSet.has(book.id),
  );
  const featuredBook = inProgressBooks[0] ?? remoteBooks[0];
  const featuredProgress = featuredBook ? latestProgressByBook[featuredBook.id] : undefined;
  const additionalInProgressBooks = featuredBook
    ? inProgressBooks.filter((book) => book.id !== featuredBook.id)
    : [];

  // Load metadata for all books to get language information
  useEffect(() => {
    const loadAllMetadata = async () => {
      const metadataPromises = remoteBooks.map(async (book) => {
        if (!book.metadataUrl) return null;
        try {
          const response = await fetch(book.metadataUrl);
          const metadata = await response.json();
          return {
            bookId: book.id,
            languages: metadata.languages?.map((lang: { id: string; title: string }) => lang.title) || [],
          };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(metadataPromises);
      const metadataMap: Record<string, { languages: string[] }> = {};
      results.forEach((result) => {
        if (result) {
          metadataMap[result.bookId] = { languages: result.languages };
        }
      });
      setBookMetadataMap(metadataMap);
    };

    if (remoteBooks.length > 0) {
      void loadAllMetadata();
    }
  }, [remoteBooks]);

  // Extract unique categories
  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    remoteBooks.forEach((book) => {
      const category = getCategoryDisplayLabel({
        category: book.category,
        categoryLabel: book.categoryLabel,
      });
      categories.add(category);
    });
    return Array.from(categories).sort();
  }, [remoteBooks]);

  // Extract unique languages from loaded metadata
  const uniqueLanguages = useMemo(() => {
    const languages = new Set<string>();
    Object.values(bookMetadataMap).forEach((metadata) => {
      metadata.languages.forEach((lang) => languages.add(lang));
    });
    return Array.from(languages).sort();
  }, [bookMetadataMap]);

  // Filter and sort books
  const filteredAndSortedBooks = useMemo(() => {
    let books = remoteBooks;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      books = books.filter((book) => {
        return (
          book.title.toLowerCase().includes(query) ||
          book.subtitle?.toLowerCase().includes(query) ||
          book.author?.toLowerCase().includes(query) ||
          getCategoryDisplayLabel({
            category: book.category,
            categoryLabel: book.categoryLabel,
          })
            .toLowerCase()
            .includes(query)
        );
      });
    }

    // Category filter
    if (selectedCategory !== "all") {
      books = books.filter((book) => {
        const bookCategory = getCategoryDisplayLabel({
          category: book.category,
          categoryLabel: book.categoryLabel,
        });
        return bookCategory === selectedCategory;
      });
    }

    // Language filter
    if (selectedLanguage !== "all") {
      books = books.filter((book) => {
        const metadata = bookMetadataMap[book.id];
        return metadata?.languages.includes(selectedLanguage);
      });
    }

    // Sort
    if (sortBy === "alpha") {
      books = [...books].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "recent") {
      // Sort by most recently read
      books = [...books].sort((a, b) => {
        const aProgress = latestProgressByBook[a.id];
        const bProgress = latestProgressByBook[b.id];
        if (!aProgress && !bProgress) return 0;
        if (!aProgress) return 1;
        if (!bProgress) return -1;
        return new Date(bProgress.updatedAt).getTime() - new Date(aProgress.updatedAt).getTime();
      });
    }

    return books;
  }, [
    remoteBooks,
    searchQuery,
    selectedCategory,
    selectedLanguage,
    sortBy,
    latestProgressByBook,
    bookMetadataMap,
  ]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 5,
          paddingHorizontal: spacing.page,
          gap: spacing.gap3xl,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Language menu overlay - close menu when tapping outside */}
        {showLanguageMenu ? (
          <Pressable
            onPress={() => setShowLanguageMenu(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
          />
        ) : null}

        {!isLoaded ? (
          <LoadingCard
            title="Loading library"
            message="Restoring your reading progress and continue-reading state."
          />
        ) : null}
        {error ? (
          <ErrorCard
            title="Progress unavailable"
            message="Saved reading progress could not be restored for this session."
          />
        ) : null}
        {isCatalogLoading ? (
          <LoadingCard title="Loading library" message="Bringing your books into view." />
        ) : null}
        {catalogError ? (
          <ErrorCard
            title="Library unavailable"
            message="The library could not be loaded right now."
          />
        ) : null}
        {!isCatalogConfigured ? (
          <ErrorCard
            title="Library unavailable"
            message="The library is not available in this build."
          />
        ) : null}
        {isCatalogConfigured && !isCatalogLoading && !catalogError && !hasRemoteCatalog ? (
          <ErrorCard title="No books yet" message="The library does not contain any books yet." />
        ) : null}

        {featuredBook ? (
          <FeaturedBookHero
            bookId={featuredBook.id}
            title={featuredBook.title}
            subtitle={featuredBook.subtitle}
            page={featuredProgress?.page}
            languageId={featuredProgress?.languageId}
            volumeId={featuredProgress?.volumeId}
            coverImage={featuredBook.coverImage}
          />
        ) : null}


        {additionalInProgressBooks.length > 0 ? (
          <View style={{ gap: 12 }}>
            <View style={{ paddingHorizontal: spacing.page }}>
              <CardTitle>In progress</CardTitle>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingLeft: spacing.page, paddingRight: spacing.page }}
              snapToInterval={260 + 12}
              decelerationRate="fast"
            >
              {additionalInProgressBooks.map((book) => {
                const progress = latestProgressByBook[book.id];
                return (
                  <InProgressCard
                    key={book.id}
                    bookId={book.id}
                    title={book.title}
                    subtitle={book.subtitle}
                    page={progress?.page}
                    languageId={progress?.languageId}
                    volumeId={progress?.volumeId}
                  />
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ gap: 14, paddingHorizontal: spacing.page }}>
          {/* Search Bar */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              paddingHorizontal: 18,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: colors.surfaceMuted,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>🔍</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search books..."
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: typography.body,
                padding: 0,
              }}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <Text style={{ color: colors.textMuted, fontSize: typography.body }}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Filters and Sort */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <MetaText>{filteredAndSortedBooks.length} books</MetaText>
            <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>•</Text>
            <Pressable
              onPress={() => {
                setSortBy(sortBy === "alpha" ? "recent" : "alpha");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <MetaText>{sortBy === "alpha" ? "A-Z" : "Recent"}</MetaText>
              <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>▾</Text>
            </Pressable>
            {uniqueLanguages.length > 0 ? (
              <>
                <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>•</Text>
                <View style={{ position: "relative" }}>
                  <Pressable
                    onPress={() => setShowLanguageMenu(!showLanguageMenu)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <MetaText>{selectedLanguage === "all" ? "All" : selectedLanguage}</MetaText>
                    <Text style={{ color: colors.textMuted, fontSize: typography.caption }}>▾</Text>
                  </Pressable>
                  {showLanguageMenu ? (
                    <View
                      style={{
                        position: "absolute",
                        top: 24,
                        right: 0,
                        backgroundColor: colors.surface,
                        borderRadius: radii.md,
                        paddingVertical: 8,
                        minWidth: 120,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 4,
                        zIndex: 1000,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          setSelectedLanguage("all");
                          setShowLanguageMenu(false);
                        }}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          backgroundColor:
                            selectedLanguage === "all" ? colors.surfaceMuted : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: typography.bodySmall,
                            fontWeight: selectedLanguage === "all" ? "800" : "400",
                          }}
                        >
                          All Languages
                        </Text>
                      </Pressable>
                      {uniqueLanguages.map((lang) => (
                        <Pressable
                          key={lang}
                          onPress={() => {
                            setSelectedLanguage(lang);
                            setShowLanguageMenu(false);
                          }}
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            backgroundColor:
                              selectedLanguage === lang ? colors.surfaceMuted : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              color: colors.text,
                              fontSize: typography.bodySmall,
                              fontWeight: selectedLanguage === lang ? "800" : "400",
                            }}
                          >
                            {lang}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingLeft: spacing.page, paddingRight: spacing.page }}
        >
          <Pressable
            onPress={() => setSelectedCategory("all")}
            style={{
              borderRadius: radii.pill,
              backgroundColor: selectedCategory === "all" ? colors.accent : colors.surfaceMuted,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                color: selectedCategory === "all" ? colors.text : colors.textMuted,
                fontSize: typography.control,
                fontWeight: "800",
              }}
            >
              All
            </Text>
          </Pressable>
          {uniqueCategories.map((category) => {
            return (
              <Pressable
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={{
                  borderRadius: radii.pill,
                  backgroundColor:
                    selectedCategory === category ? colors.accent : colors.surfaceMuted,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{
                    color: selectedCategory === category ? colors.text : colors.textMuted,
                    fontSize: typography.control,
                    fontWeight: "800",
                  }}
                >
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ gap: spacing.gapXl }}>
          <FlatList
            data={filteredAndSortedBooks}
            keyExtractor={(book: PublicCatalogBook) => book.id}
            numColumns={2}
            scrollEnabled={false}
            columnWrapperStyle={{
              gap: 12,
              paddingHorizontal: spacing.page,
            }}
            contentContainerStyle={{
              gap: 12,
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: spacing.gapXl }}>
                <MetaText>No books found in this category.</MetaText>
              </View>
            }
            renderItem={({ item: book }: { item: PublicCatalogBook }) => (
              <View style={{ flex: 1 }}>
                <LibraryBookCard
                  bookId={book.id}
                  title={book.title}
                  subtitle={book.subtitle}
                  category={getCategoryDisplayLabel({
                    category: book.category,
                    categoryLabel: book.categoryLabel,
                  })}
                  page={latestProgressByBook[book.id]?.page}
                  languageId={latestProgressByBook[book.id]?.languageId}
                  volumeId={latestProgressByBook[book.id]?.volumeId}
                  coverImage={book.coverImage}
                />
              </View>
            )}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

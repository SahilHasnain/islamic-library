import { Image } from "expo-image";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BodyText,
  CardTitle,
  CoverBlock,
  ErrorCard,
  HeroCard,
  LoadingCard,
  MetaText,
  PageHeader,
  Screen,
  SectionCard
} from "../../components/ui";
import { colors, radii, spacing, typography } from "../../constants/theme";
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
}: {
  bookId: string;
  title: string;
  subtitle?: string;
  page?: number;
  languageId?: string;
  volumeId?: string;
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

      <View style={{ gap: spacing.gapMd }}>
        <Text
          style={{
            color: colors.textOnDark,
            fontSize: typography.sectionTitle,
            fontWeight: "800",
          }}
        >
          {title}
        </Text>
        <BodyText color={colors.textOnDarkMuted}>{subtitle ?? "Reading edition"}</BodyText>
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
        padding: spacing.card,
        gap: spacing.gapMd,
      }}
    >
      <Link
        href={`/reader/${bookId}/${readerLanguageId}/${readerVolumeId}/${readerPage}` as const}
        asChild
      >
        <Pressable>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            {coverImage ? (
              <Image
                source={{ uri: coverImage }}
                contentFit="cover"
                transition={120}
                style={{
                  width: 54,
                  height: 72,
                  backgroundColor: colors.surfaceMuted,
                }}
              />
            ) : (
              <CoverBlock color={colors.accentStrong} />
            )}
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: typography.title, fontWeight: "800" }}>
                {title}
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typography.bodySmall,
                  lineHeight: 22,
                }}
              >
                {enhancedSubtitle}
              </Text>
              <MetaText>
                {category ?? "Library"} | {getContinueLine(page)}
              </MetaText>
            </View>
          </View>
        </Pressable>
      </Link>

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Link href={`/book/${bookId}` as const} asChild>
          <Pressable
            style={{
              alignSelf: "flex-start",
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.textMuted,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typography.control, fontWeight: "800" }}>
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
              alignSelf: "flex-start",
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.accent,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typography.control, fontWeight: "800" }}>
              {downloadButtonLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
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

  // Filter books by selected category
  const filteredBooks = useMemo(() => {
    if (selectedCategory === "all") {
      return remoteBooks;
    }
    return remoteBooks.filter((book) => {
      const bookCategory = getCategoryDisplayLabel({
        category: book.category,
        categoryLabel: book.categoryLabel,
      });
      return bookCategory === selectedCategory;
    });
  }, [remoteBooks, selectedCategory]);

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
        <PageHeader
          title="Library"
          subtitle="Continue with steadiness. Let the library keep the next step ready for you."
        />

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
          />
        ) : null}

        <SectionCard backgroundColor={colors.surfaceMuted} gap={spacing.gapXl}>
          <CardTitle>Today&apos;s gentle target</CardTitle>
          <BodyText color={colors.text}>
            {featuredBook
              ? `Read 2 pages from ${featuredBook.title}. The goal is continuity, not speed.`
              : "Choose one book and read for 5 steady minutes."}
          </BodyText>
          {featuredBook ? (
            <Link
              href={`/reader/${featuredBook.id}/${featuredProgress?.languageId ?? "english"}/${featuredProgress?.volumeId ?? "volume1"}/${featuredProgress?.page ?? 1}` as const}
              asChild
            >
              <Pressable
                style={{
                  alignSelf: "flex-start",
                  borderRadius: radii.pill,
                  borderWidth: 1.5,
                  borderColor: colors.accent,
                  paddingHorizontal: 18,
                  paddingVertical: 11,
                }}
              >
                <Text style={{ color: colors.text, fontSize: typography.body, fontWeight: "800" }}>
                  Read for 5 minutes
                </Text>
              </Pressable>
            </Link>
          ) : null}
        </SectionCard>

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

        <View style={{ gap: 12 }}>
          <View style={{ paddingHorizontal: spacing.page }}>
            <CardTitle>Browse by category</CardTitle>
          </View>
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
                All ({remoteBooks.length})
              </Text>
            </Pressable>
            {uniqueCategories.map((category) => {
              const count = remoteBooks.filter((book) => {
                const bookCategory = getCategoryDisplayLabel({
                  category: book.category,
                  categoryLabel: book.categoryLabel,
                });
                return bookCategory === category;
              }).length;
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
                    {category} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <SectionCard backgroundColor={colors.surfaceMuted} gap={spacing.gapXl}>
          <CardTitle>
            {selectedCategory === "all"
              ? "All books"
              : `${selectedCategory} (${filteredBooks.length})`}
          </CardTitle>
          <BodyText>
            {selectedCategory === "all"
              ? "Move at your own pace. Each title should open into a calm, guided reading flow."
              : `Browse ${filteredBooks.length} ${selectedCategory.toLowerCase()} ${filteredBooks.length === 1 ? "book" : "books"}.`}
          </BodyText>
          {filteredBooks.length > 0 ? (
            filteredBooks.map((book) => (
              <LibraryBookCard
                key={book.id}
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
            ))
          ) : (
            <MetaText>No books found in this category.</MetaText>
          )}
        </SectionCard>

        {completedBooks.length > 0 ? (
          <SectionCard backgroundColor={colors.surfaceMuted} gap={spacing.gapXl}>
            <CardTitle>Completed books</CardTitle>
            {completedBooks.map((book) => {
              const completion = Object.values(completionMap)
                .filter((entry) => entry.bookId === book.id)
                .sort(
                  (left, right) =>
                    new Date(right.completedAt).getTime() -
                    new Date(left.completedAt).getTime(),
                )[0];

              return (
                <LibraryBookCard
                  key={book.id}
                  bookId={book.id}
                  title={book.title}
                  subtitle={book.subtitle ?? "Completed"}
                  category={
                    completion
                      ? `Completed ${new Date(completion.completedAt).toLocaleDateString()}`
                      : "Completed"
                  }
                  page={completion?.finalPage}
                  languageId={completion?.languageId}
                  volumeId={completion?.volumeId}
                  coverImage={book.coverImage}
                />
              );
            })}
          </SectionCard>
        ) : null}

        <SectionCard>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: typography.subtitle,
              lineHeight: 28,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            Begin with calm. Continue with steadiness. Let the app remove friction so the reading
            itself remains the focus.
          </Text>
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

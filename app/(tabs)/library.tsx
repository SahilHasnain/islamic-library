import { Image } from "expo-image";
import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BodyText,
  CardTitle,
  Chip,
  CoverBlock,
  ErrorCard,
  HeroCard,
  LoadingCard,
  MetaText,
  PageHeader,
  Screen,
  SectionCard,
} from "../../components/ui";
import { colors, radii, spacing, typography } from "../../constants/theme";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { useRemoteBookData } from "../../hooks/useRemoteBookData";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";
import { useVolumeDownload } from "../../hooks/useVolumeDownload";

function getContinueLine(page?: number) {
  return page ? `Page ${page}` : "Not started yet";
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
                  borderRadius: 16,
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
                {subtitle ?? "Ready for reading"}
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
        }}
      >
        <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
          {title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typography.bodySmall, lineHeight: 22 }}>
          {subtitle ?? "Continue from your saved reading position"}
        </Text>
        <MetaText>{getContinueLine(page)}</MetaText>
      </Pressable>
    </Link>
  );
}

export default function LibraryScreen() {
  const { error, isLoaded, progressMap } = useReadingProgress();
  const {
    catalog,
    error: catalogError,
    hasRemoteCatalog,
    isConfigured: isCatalogConfigured,
    isLoading: isCatalogLoading,
  } = useRemoteCatalog();
  const insets = useSafeAreaInsets();

  const remoteBooks = catalog?.books ?? [];
  const inProgressBooks = remoteBooks.filter((book) => progressMap[book.id]);
  const featuredBook = inProgressBooks[0] ?? remoteBooks[0];
  const featuredProgress = featuredBook ? progressMap[featuredBook.id] : undefined;
  const additionalInProgressBooks = featuredBook
    ? inProgressBooks.filter((book) => book.id !== featuredBook.id)
    : [];
  const categoryLabels =
    remoteBooks.length > 0
      ? Array.from(new Set(remoteBooks.map((book) => book.category).filter(Boolean)))
      : [];
  const safeCategoryLabels = categoryLabels.filter(
    (category): category is string => Boolean(category),
  );

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
          <SectionCard>
            <CardTitle>In progress</CardTitle>
            <View style={{ gap: 12 }}>
              {additionalInProgressBooks.map((book) => {
                const progress = progressMap[book.id];
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
            </View>
          </SectionCard>
        ) : null}

        <SectionCard>
          <CardTitle>Featured categories</CardTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {safeCategoryLabels.map((category) => (
              <Chip key={category} label={category} />
            ))}
            {safeCategoryLabels.length === 0 ? <MetaText>No categories yet.</MetaText> : null}
          </View>
        </SectionCard>

        <SectionCard backgroundColor={colors.surfaceMuted} gap={spacing.gapXl}>
          <CardTitle>Library collection</CardTitle>
          <BodyText>
            Move at your own pace. Each title should open into a calm, guided reading flow.
          </BodyText>
          {remoteBooks.length > 0 ? (
            remoteBooks.map((book) => (
              <LibraryBookCard
                key={book.id}
                bookId={book.id}
                title={book.title}
                subtitle={book.subtitle}
                category={book.category}
                page={progressMap[book.id]?.page}
                languageId={progressMap[book.id]?.languageId}
                volumeId={progressMap[book.id]?.volumeId}
                coverImage={book.coverImage}
              />
            ))
          ) : (
            <MetaText>No books found.</MetaText>
          )}
        </SectionCard>

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

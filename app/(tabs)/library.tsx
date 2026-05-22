import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

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
import { useRemoteBookData } from "../../hooks/useRemoteBookData";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { useVolumeDownload } from "../../hooks/useVolumeDownload";

function getContinueLine(page?: number) {
  return page ? `Page ${page}` : "Not started yet";
}

function getDownloadStatusLabel({
  canDownload,
  isDownloading,
  isFullyDownloaded,
  isPartiallyDownloaded,
}: {
  canDownload: boolean;
  isDownloading: boolean;
  isFullyDownloaded: boolean;
  isPartiallyDownloaded: boolean;
}) {
  if (!canDownload) {
    return "Unavailable offline";
  }

  if (isDownloading) {
    return "Downloading";
  }

  if (isFullyDownloaded) {
    return "Ready offline";
  }

  if (isPartiallyDownloaded) {
    return "Partially offline";
  }

  return "Available online";
}

function FeaturedBookHero({
  bookId,
  title,
  subtitle,
  page,
}: {
  bookId: string;
  title: string;
  subtitle?: string;
  page?: number;
}) {
  const { manifest } = useRemoteBookData(bookId);
  const {
    canDownload,
    downloadAll,
    isDownloading,
    isFullyDownloaded,
    isPartiallyDownloaded,
    progressPercent,
    removeDownload,
  } = useVolumeDownload(manifest);

  const downloadStatusLabel = getDownloadStatusLabel({
    canDownload,
    isDownloading,
    isFullyDownloaded,
    isPartiallyDownloaded,
  });

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
      <View style={{ gap: spacing.gapLg }}>
        <View style={{ gap: spacing.gapSm }}>
          <Text
            style={{
              color: colors.textOnDark,
              fontSize: typography.sectionTitle,
              fontWeight: "800",
            }}
          >
            {title}
          </Text>
          <BodyText color={colors.textOnDarkMuted}>{subtitle ?? "Published book"}</BodyText>
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

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                color: colors.textOnDarkMuted,
                fontSize: typography.control,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Reading state
            </Text>
            <Text
              style={{
                color: colors.textOnDark,
                fontSize: typography.bodySmall,
                fontWeight: "700",
              }}
            >
              {page ? "In progress" : "Ready to begin"}
            </Text>
            <Text
              style={{
                color: colors.textOnDarkSubtle,
                fontSize: typography.control,
                fontWeight: "700",
              }}
            >
              {downloadStatusLabel}
              {isDownloading ? ` • ${progressPercent}%` : ""}
            </Text>
          </View>

          <Link href={`/book/${bookId}` as const} asChild>
            <Pressable
              style={{
                borderRadius: radii.pill,
                backgroundColor: colors.accent,
                paddingHorizontal: 18,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: typography.bodySmall,
                  fontWeight: "800",
                }}
              >
                {page ? "Resume Reading" : "Open Book"}
              </Text>
            </Pressable>
          </Link>
        </View>

        {canDownload ? (
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => {
                void (isFullyDownloaded ? removeDownload() : downloadAll());
              }}
              style={{
                alignSelf: "flex-start",
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: colors.textOnDarkMuted,
                paddingHorizontal: 16,
                paddingVertical: 11,
              }}
            >
              <Text
                style={{
                  color: colors.textOnDark,
                  fontSize: typography.control,
                  fontWeight: "800",
                }}
              >
                {isDownloading
                  ? `Downloading ${progressPercent}%`
                  : isFullyDownloaded
                    ? "Remove download"
                    : "Download offline"}
              </Text>
            </Pressable>
          </View>
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
}: {
  bookId: string;
  title: string;
  subtitle?: string;
  category?: string;
  page?: number;
}) {
  const { manifest } = useRemoteBookData(bookId);
  const {
    canDownload,
    downloadAll,
    isDownloading,
    isFullyDownloaded,
    isPartiallyDownloaded,
    progressPercent,
    removeDownload,
  } = useVolumeDownload(manifest);

  const downloadStatusLabel = getDownloadStatusLabel({
    canDownload,
    isDownloading,
    isFullyDownloaded,
    isPartiallyDownloaded,
  });

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        padding: spacing.card,
        gap: spacing.gapMd,
      }}
    >
      <Link href={`/book/${bookId}` as const} asChild>
        <Pressable>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <CoverBlock color={colors.accentStrong} />
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
                {subtitle ?? "Published from the remote catalog"}
              </Text>
              <MetaText>
                {category ?? "Library"} | {getContinueLine(page)}
              </MetaText>
              <MetaText>
                {downloadStatusLabel}
                {isDownloading ? ` • ${progressPercent}%` : ""}
              </MetaText>
            </View>
          </View>
        </Pressable>
      </Link>

      {canDownload ? (
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
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
              {isDownloading
                ? `Downloading ${progressPercent}%`
                : isFullyDownloaded
                  ? "Remove download"
                  : "Download offline"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
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

  const remoteBooks = catalog?.books ?? [];
  const inProgressBooks = remoteBooks.filter((book) => progressMap[book.id]);
  const featuredBook = inProgressBooks[0] ?? remoteBooks[0];
  const featuredProgress = featuredBook ? progressMap[featuredBook.id] : undefined;
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
          padding: spacing.page,
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
          <LoadingCard
            title="Loading remote catalog"
            message="Fetching the published library catalog for this app."
          />
        ) : null}
        {catalogError ? (
          <ErrorCard
            title="Remote catalog unavailable"
            message="The app could not load the published catalog."
          />
        ) : null}
        {!isCatalogConfigured ? (
          <ErrorCard
            title="Catalog URL not configured"
            message="Set EXPO_PUBLIC_LIBRARY_CATALOG_URL to load the published remote catalog."
          />
        ) : null}
        {isCatalogConfigured && !isCatalogLoading && !catalogError && !hasRemoteCatalog ? (
          <ErrorCard
            title="Published catalog is empty"
            message="The remote catalog is configured, but it does not contain any published books yet."
          />
        ) : null}

        {featuredBook ? (
          <FeaturedBookHero
            bookId={featuredBook.id}
            title={featuredBook.title}
            subtitle={featuredBook.subtitle}
            page={featuredProgress?.page}
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
            <Link href={`/book/${featuredBook.id}` as const} asChild>
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

        <SectionCard>
          <CardTitle>In progress</CardTitle>
          <View style={{ gap: 12 }}>
            {inProgressBooks.map((book) => {
              const progress = progressMap[book.id];
              return (
                <Link key={book.id} href={`/book/${book.id}` as const} asChild>
                  <Pressable
                    style={{
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radii.md,
                      padding: spacing.card,
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
                      {book.title}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: typography.bodySmall, lineHeight: 22 }}>
                      {book.subtitle ?? "Continue from your saved reading position"}
                    </Text>
                    <MetaText>{getContinueLine(progress?.page)}</MetaText>
                  </Pressable>
                </Link>
              );
            })}
            {inProgressBooks.length === 0 ? (
              <BodyText>No saved reading progress yet. Begin with one book and continue gently.</BodyText>
            ) : null}
          </View>
        </SectionCard>

        <SectionCard>
          <CardTitle>Featured categories</CardTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {safeCategoryLabels.map((category) => (
              <Chip key={category} label={category} />
            ))}
            {safeCategoryLabels.length === 0 ? <MetaText>No categories published yet.</MetaText> : null}
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
              />
            ))
          ) : (
            <MetaText>No published remote books found.</MetaText>
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
            Begin with calm. Continue with steadiness. Let the app remove friction so the reading itself remains the focus.
          </Text>
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

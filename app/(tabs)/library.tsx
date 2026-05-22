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
import {
  BOOKS,
  formatLastReadLabel,
  getCurrentSectionForPage,
  getEffectiveProgress,
} from "../../data/books";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";
import { useReadingProgress } from "../../hooks/useReadingProgress";

export default function LibraryScreen() {
  const { error, isLoaded, progressMap } = useReadingProgress();
  const {
    catalog,
    catalogUrl,
    error: catalogError,
    hasRemoteCatalog,
    isConfigured: isCatalogConfigured,
    isLoading: isCatalogLoading,
    source: catalogSource,
  } = useRemoteCatalog();
  const featuredBook = BOOKS.find((book) => book.featured) ?? BOOKS[0];
  const featuredProgress = getEffectiveProgress(featuredBook, progressMap[featuredBook.id]);
  const continueSection = getCurrentSectionForPage(
    featuredBook,
    featuredProgress.languageId,
    featuredProgress.volumeId,
    featuredProgress.page,
  );
  const inProgressBooks = BOOKS.filter((book) => !book.featured);
  const remoteBooks = catalog?.books ?? [];
  const categoryLabels =
    remoteBooks.length > 0
      ? Array.from(new Set(remoteBooks.map((book) => book.category).filter(Boolean)))
      : Array.from(new Set(BOOKS.map((book) => book.category)));
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
          subtitle="A calm Islamic reading library built around steady progress and guided reading."
        />

        {!isLoaded ? <LoadingCard title="Loading library" message="Restoring your reading progress and continue-reading state." /> : null}
        {error ? <ErrorCard title="Progress fallback active" message="Saved progress could not be loaded, so the app is using its default reading positions." /> : null}
        {isCatalogLoading ? (
          <LoadingCard
            title="Loading remote catalog"
            message="Fetching the published library catalog for this app."
          />
        ) : null}
        {catalogError ? (
          <ErrorCard
            title="Remote catalog unavailable"
            message="The app could not load the published catalog, so the local seeded library is being shown instead."
          />
        ) : null}
        {!isCatalogConfigured ? (
          <ErrorCard
            title="Catalog URL not configured"
            message="Set EXPO_PUBLIC_LIBRARY_CATALOG_URL to switch this app from seeded books to the published remote catalog."
          />
        ) : null}
        {isCatalogConfigured && !isCatalogLoading && !catalogError && !hasRemoteCatalog ? (
          <ErrorCard
            title="Published catalog is empty"
            message="The remote catalog is configured, but it does not contain any published books yet."
          />
        ) : null}

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
          <Text style={{ color: colors.textOnDark, fontSize: typography.sectionTitle, fontWeight: "800" }}>
            {featuredBook.title}
          </Text>
          <BodyText color={colors.textOnDarkMuted}>
            {continueSection?.title ?? featuredBook.subtitle}
          </BodyText>
          <Text style={{ color: colors.textOnDarkSubtle, fontSize: typography.label, lineHeight: 22 }}>
            Page {featuredProgress.page} | {formatLastReadLabel(featuredProgress.updatedAt)}
          </Text>
          <Link
            href={
              `/reader/${featuredBook.id}/${featuredProgress.languageId}/${featuredProgress.volumeId}/${featuredProgress.page}` as const
            }
            asChild
          >
            <Pressable
              style={{
                alignSelf: "flex-start",
                borderRadius: radii.pill,
                backgroundColor: colors.accent,
                paddingHorizontal: 18,
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: colors.text, fontSize: typography.bodySmall, fontWeight: "800" }}>
                Resume Book
              </Text>
            </Pressable>
          </Link>
        </HeroCard>

        <SectionCard>
          <CardTitle>In progress</CardTitle>
          <View style={{ gap: 12 }}>
            {inProgressBooks.map((book) => {
              const progress = getEffectiveProgress(book, progressMap[book.id]);
              const section = getCurrentSectionForPage(
                book,
                progress.languageId,
                progress.volumeId,
                progress.page,
              );
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
                      {section?.title ?? book.subtitle}
                    </Text>
                    <MetaText>
                      Page {progress.page} | {formatLastReadLabel(progress.updatedAt)}
                    </MetaText>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard>
          <CardTitle>Featured categories</CardTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {safeCategoryLabels.map((category) => (
              <Chip key={category} label={category} />
            ))}
          </View>
        </SectionCard>

        <SectionCard backgroundColor={colors.surfaceMuted} gap={spacing.gapXl}>
          <CardTitle>
            Library collection {catalogSource === "remote" ? "(published catalog)" : "(local fallback)"}
          </CardTitle>
          {remoteBooks.length > 0
            ? remoteBooks.map((book) => {
                const localBook = BOOKS.find((candidate) => candidate.id === book.id);
                const href = localBook ? (`/book/${book.id}` as const) : undefined;
                const supportLabel = localBook
                  ? "Openable in app"
                  : "Published remotely, app route fallback unavailable";
                const card = (
                  <Pressable
                    disabled={!href}
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radii.md,
                      padding: spacing.card,
                      gap: spacing.gapMd,
                      opacity: href ? 1 : 0.78,
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                      <CoverBlock color={localBook?.coverTint ?? colors.accentStrong} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={{ color: colors.text, fontSize: typography.title, fontWeight: "800" }}>
                          {book.title}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: typography.bodySmall, lineHeight: 22 }}>
                          {book.subtitle ?? "Published from the remote catalog"}
                        </Text>
                        <MetaText>
                          {book.category ?? "Library"} | {supportLabel}
                        </MetaText>
                      </View>
                    </View>
                  </Pressable>
                );

                if (!href) {
                  return <View key={book.id}>{card}</View>;
                }

                return (
                  <Link key={book.id} href={href} asChild>
                    {card}
                  </Link>
                );
              })
            : BOOKS.map((book) => (
                <Link key={book.id} href={`/book/${book.id}` as const} asChild>
                  <Pressable
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radii.md,
                      padding: spacing.card,
                      gap: spacing.gapMd,
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                      <CoverBlock color={book.coverTint} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={{ color: colors.text, fontSize: typography.title, fontWeight: "800" }}>
                          {book.title}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: typography.bodySmall, lineHeight: 22 }}>
                          {book.subtitle}
                        </Text>
                        <MetaText>
                          {book.category} | {book.languages.length} language{book.languages.length > 1 ? "s" : ""}
                        </MetaText>
                      </View>
                    </View>
                  </Pressable>
                </Link>
              ))}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

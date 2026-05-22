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
  const remoteBooks = catalog?.books ?? [];
  const featuredBook = remoteBooks[0];
  const featuredProgress = featuredBook ? progressMap[featuredBook.id] : undefined;
  const inProgressBooks = remoteBooks.filter((book) => progressMap[book.id]);
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
              {featuredBook.subtitle ?? "Published book"}
            </BodyText>
            <Text style={{ color: colors.textOnDarkSubtle, fontSize: typography.label, lineHeight: 22 }}>
              Page {featuredProgress?.page ?? 1}
            </Text>
            <Link href={`/book/${featuredBook.id}` as const} asChild>
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
                  Open Book
                </Text>
              </Pressable>
            </Link>
          </HeroCard>
        ) : null}

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
                      {book.subtitle ?? "Continue from your saved remote position"}
                    </Text>
                    <MetaText>
                      Page {progress?.page ?? 1}
                    </MetaText>
                  </Pressable>
                </Link>
              );
            })}
            {inProgressBooks.length === 0 ? (
              <MetaText>No saved remote reading progress yet.</MetaText>
            ) : null}
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
            Library collection {catalogSource === "remote" ? "(published catalog)" : "(remote unavailable)"}
          </CardTitle>
          {remoteBooks.length > 0 ? (
            remoteBooks.map((book) => {
              const href = `/book/${book.id}` as const;
              const supportLabel = "Published remotely, remote-first book route";
              const card = (
                <Pressable
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radii.md,
                    padding: spacing.card,
                    gap: spacing.gapMd,
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                    <CoverBlock color={colors.accentStrong} />
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

              return (
                <Link key={book.id} href={href} asChild>
                  {card}
                </Link>
              );
            })
          ) : (
            <MetaText>No published remote books found.</MetaText>
          )}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

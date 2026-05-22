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
import { useReadingProgress } from "../../hooks/useReadingProgress";

export default function LibraryScreen() {
  const { error, isLoaded, progressMap } = useReadingProgress();
  const featuredBook = BOOKS.find((book) => book.featured) ?? BOOKS[0];
  const featuredProgress = getEffectiveProgress(featuredBook, progressMap[featuredBook.id]);
  const continueSection = getCurrentSectionForPage(
    featuredBook,
    featuredProgress.languageId,
    featuredProgress.volumeId,
    featuredProgress.page,
  );
  const inProgressBooks = BOOKS.filter((book) => !book.featured);

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
            {Array.from(new Set(BOOKS.map((book) => book.category))).map((category) => (
              <Chip key={category} label={category} />
            ))}
          </View>
        </SectionCard>

        <SectionCard backgroundColor={colors.surfaceMuted} gap={spacing.gapXl}>
          <CardTitle>Library collection</CardTitle>
          {BOOKS.map((book) => (
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

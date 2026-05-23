import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorCard, LoadingCard } from "../../../components/ui";
import type { PublicBookSection } from "../../../data/types";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";
import { useReadingProgress } from "../../../hooks/useReadingProgress";

const colors = {
  background: "#F7F1E3",
  surface: "#FFF9EA",
  text: "#173D31",
  textMuted: "#5F6C65",
  accent: "#C9A961",
};

function buildSections(totalPages: number): PublicBookSection[] {
  const total = Math.max(totalPages, 1);
  const sectionCount = Math.min(6, Math.max(3, Math.ceil(total / 40)));
  const sectionSpan = Math.max(1, Math.ceil(total / sectionCount));

  return Array.from({ length: sectionCount }, (_, index) => {
    const startPage = index * sectionSpan + 1;
    const endPage = index === sectionCount - 1 ? total : Math.min(total, (index + 1) * sectionSpan);

    return {
      id: `section-${index + 1}`,
      title: `Section ${index + 1}`,
      startPage,
      endPage,
      estimatedMinutes: Math.max(10, (endPage - startPage + 1) * 2),
    };
  });
}

function getOrderedSections(sections: PublicBookSection[]) {
  return [...sections].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.startPage - right.startPage;
  });
}

function getSectionEntryPage(section: PublicBookSection) {
  return section.entryPage ?? section.startPage;
}

function getSectionKindLabel(section: PublicBookSection) {
  switch (section.kind) {
    case "front-matter":
      return "Opening";
    case "chapter":
      return "Chapter";
    case "litany":
      return "Litany";
    case "dua":
      return "Dua";
    case "reflection":
      return "Reflection";
    case "appendix":
      return "Appendix";
    default:
      return null;
  }
}

export default function BookSectionsScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const readingBookId = Array.isArray(bookId) ? bookId[0] : bookId ?? "";
  const { progress } = useReadingProgress(readingBookId);
  const {
    metadata,
    metadataError,
    isMetadataLoading,
    manifest,
    selectedLanguage,
    selectedVolume,
  } = useRemoteBookData(readingBookId, progress?.languageId, progress?.volumeId);
  const totalPages = manifest?.totalPages ?? 1;
  const hasAuthoredSections = Boolean(selectedVolume?.sections?.length);
  const sections = getOrderedSections(
    hasAuthoredSections ? selectedVolume?.sections ?? [] : buildSections(totalPages),
  );
  const displayTitle = metadata?.title ?? "Published book";
  const displayLanguageTitle = selectedLanguage?.title ?? progress?.languageId ?? "Edition";
  const resolvedLanguageId = selectedLanguage?.id ?? progress?.languageId ?? "english";
  const resolvedVolumeId = selectedVolume?.id ?? progress?.volumeId ?? "volume1";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Sections",
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800" }}>
            {displayTitle}
          </Text>
          {isMetadataLoading ? (
            <LoadingCard
              title="Loading book metadata"
              message="Preparing the reading sections for this book."
            />
          ) : null}
          {metadataError ? (
            <ErrorCard
              title="Published metadata unavailable"
              message="The sections for this book could not be loaded."
            />
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>
            {displayLanguageTitle}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
            Move through the book in calm, manageable portions. Choose the section that matches
            your current pace.
          </Text>
          {!hasAuthoredSections ? (
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              Guided sections are still being prepared for this book.
            </Text>
          ) : null}
          {sections.map((section) => (
            <Link
              key={section.id}
              href={`/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${getSectionEntryPage(section)}` as const}
              asChild
            >
              <Pressable
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 22,
                  padding: 18,
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                  {section.title}
                </Text>
                {section.subtitle ? (
                  <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
                    {section.subtitle}
                  </Text>
                ) : null}
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>
                  Pages {section.startPage}-{section.endPage}
                </Text>
                {section.description ? (
                  <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21 }}>
                    {section.description}
                  </Text>
                ) : null}
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {[getSectionKindLabel(section), `${section.estimatedMinutes} min`]
                    .filter(Boolean)
                    .join(" | ")}
                </Text>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

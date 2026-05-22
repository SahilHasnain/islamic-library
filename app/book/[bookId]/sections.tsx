import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorCard, LoadingCard } from "../../../components/ui";
import { getBookById, getLanguageForBook, getVolumeForBook } from "../../../data/books";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";

const colors = {
  background: "#F7F1E3",
  surface: "#FFF9EA",
  text: "#173D31",
  textMuted: "#5F6C65",
  accent: "#C9A961",
};

export default function BookSectionsScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const book = getBookById(bookId);
  const language = getLanguageForBook(book, book.continueReading.languageId);
  const volume = getVolumeForBook(book, language.id, book.continueReading.volumeId);
  const { metadata, metadataError, isMetadataLoading, selectedLanguage, selectedVolume } =
    useRemoteBookData(
    book.id,
    language.id,
    volume.id,
  );
  const displayTitle = metadata?.title ?? book.title;
  const displayLanguageTitle = selectedLanguage?.title ?? language.title;
  const resolvedLanguageId = selectedLanguage?.id ?? language.id;
  const resolvedVolumeId = selectedVolume?.id ?? volume.id;

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
              message="Fetching the published edition details for this book."
            />
          ) : null}
          {metadataError ? (
            <ErrorCard
              title="Using local section data"
              message="Published metadata could not be loaded for this book."
            />
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>{displayLanguageTitle}</Text>
          {volume.sections.map((section) => (
            <Link
              key={section.id}
              href={`/reader/${book.id}/${resolvedLanguageId}/${resolvedVolumeId}/${section.startPage}` as const}
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
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>
                  Pages {section.startPage}-{section.endPage}
                </Text>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {section.estimatedMinutes} min
                </Text>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

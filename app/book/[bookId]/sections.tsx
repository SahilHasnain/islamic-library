import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getBookById, getLanguageForBook, getVolumeForBook } from "../../../data/books";

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
            {book.title}
          </Text>
          {volume.sections.map((section) => (
            <Link
              key={section.id}
              href={`/reader/${book.id}/${language.id}/${volume.id}/${section.startPage}` as const}
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

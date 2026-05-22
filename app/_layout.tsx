import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="book/[bookId]/index" options={{ headerShown: true }} />
      <Stack.Screen name="book/[bookId]/sections" options={{ headerShown: true }} />
      <Stack.Screen name="book/[bookId]/plans" options={{ headerShown: true }} />
      <Stack.Screen
        name="reader/[bookId]/[languageId]/[volumeId]/[page]"
        options={{ headerShown: true }}
      />
    </Stack>
  );
}

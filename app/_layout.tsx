import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/[bookId]/index" options={{ headerShown: true }} />
        <Stack.Screen name="book/[bookId]/sections" options={{ headerShown: true }} />
        <Stack.Screen name="book/[bookId]/plans" options={{ headerShown: true }} />
        <Stack.Screen
          name="reader/[bookId]/[languageId]/[volumeId]/[page]"
          options={{ headerShown: false }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

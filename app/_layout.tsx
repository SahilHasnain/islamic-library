import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppThemeProvider, useAppTheme } from "../hooks/useAppTheme";

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <ThemedRootLayout />
    </AppThemeProvider>
  );
}

function ThemedRootLayout() {
  const { colors, resolvedTheme } = useAppTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
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

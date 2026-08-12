import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CardTitle,
  ErrorCard,
  LoadingCard,
  MetaText,
  PageHeader,
  Screen,
  SectionCard,
} from "../../components/ui";
import { radii, spacing, typography } from "../../constants/theme";
import type { AppThemePreference } from "../../data/types";
import { useAppTheme } from "../../hooks/useAppTheme";

function getThemeLabel(theme: AppThemePreference) {
  if (theme === "system") {
    return "System";
  }

  return theme === "dark" ? "Dark" : "Light";
}

function ThemeOptionButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: radii.pill,
        backgroundColor: selected ? colors.primaryButton : colors.surfaceMuted,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Text
        style={{
          color: selected ? colors.primaryButtonText : colors.text,
          fontSize: typography.caption,
          fontWeight: "800",
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors, error: themeError, isLoaded: themeLoaded, resolvedTheme, themePreference, setThemePreference } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 5,
          paddingHorizontal: spacing.page,
          gap: spacing.gap2xl,
          paddingBottom: 40,
        }}
      >
        <PageHeader title="Settings" subtitle="Customize your reading experience." />

        {!themeLoaded ? (
          <LoadingCard
            title="Loading settings"
            message="Getting your preferences ready."
          />
        ) : null}

        {themeError ? (
          <ErrorCard
            title="Couldn't load some settings"
            message="Some of your preferences couldn't be loaded. Using defaults for now."
          />
        ) : null}

        <SectionCard>
          <CardTitle>Appearance</CardTitle>
          <View style={{ gap: spacing.gapSm }}>
            <MetaText>Current appearance</MetaText>
            <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
              {getThemeLabel(themePreference)}
              {themePreference === "system" ? ` (${getThemeLabel(resolvedTheme)})` : ""}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.gapSm }}>
            <ThemeOptionButton
              label="System"
              selected={themePreference === "system"}
              onPress={() => {
                void setThemePreference("system");
              }}
            />
            <ThemeOptionButton
              label="Light"
              selected={themePreference === "light"}
              onPress={() => {
                void setThemePreference("light");
              }}
            />
            <ThemeOptionButton
              label="Dark"
              selected={themePreference === "dark"}
              onPress={() => {
                void setThemePreference("dark");
              }}
            />
          </View>
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Platform, Pressable, ScrollView, Text, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CardTitle,
  EmptyCard,
  ErrorCard,
  LoadingCard,
  MetaText,
  PageHeader,
  Screen,
  SectionCard,
} from "../../components/ui";
import { colors, radii, spacing, typography } from "../../constants/theme";
import { useBookmarks } from "../../hooks/useBookmarks";
import { useReaderPreferences } from "../../hooks/useReaderPreferences";
import { useReadingPlans } from "../../hooks/useReadingPlans";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { useRemoteCatalog } from "../../hooks/useRemoteCatalog";

function CustomToast({ message, visible }: { message: string; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 20,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [visible, message, opacity, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        bottom: 100,
        left: 20,
        right: 20,
        backgroundColor: colors.primaryButton,
        borderRadius: radii.md,
        padding: 16,
        opacity,
        transform: [{ translateY }],
        zIndex: 1000,
      }}
    >
      <Text style={{ color: colors.primaryButtonText, fontSize: typography.body, textAlign: "center" }}>
        {message}
      </Text>
    </Animated.View>
  );
}

function ActionButton({
  label,
  onPress,
  variant = "soft",
}: {
  label: string;
  onPress: () => void;
  variant?: "soft" | "primary";
}) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      style={{
        alignSelf: "flex-start",
        borderRadius: radii.pill,
        backgroundColor: isPrimary ? colors.primaryButton : colors.surfaceSoft,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          color: isPrimary ? colors.primaryButtonText : colors.text,
          fontSize: typography.caption,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function getThemeLabel(theme: "light" | "sepia" | "night") {
  if (theme === "light") {
    return "Light";
  }

  if (theme === "sepia") {
    return "Sepia";
  }

  return "Night";
}

function getNextThemeLabel(theme: "light" | "sepia" | "night") {
  if (theme === "light") {
    return "Sepia";
  }

  if (theme === "sepia") {
    return "Night";
  }

  return "Light";
}

export default function SettingsScreen() {
  const { catalog } = useRemoteCatalog();
  const {
    clearBookmarks,
    error: bookmarksError,
    isLoaded: bookmarksLoaded,
    bookmarks,
  } = useBookmarks();
  const {
    activePlanMap,
    clearAllPlans,
    error: plansError,
    isLoaded: plansLoaded,
  } = useReadingPlans();
  const {
    cycleTheme,
    error: preferencesError,
    isLoaded: preferencesLoaded,
    theme,
  } = useReaderPreferences();
  const {
    error: progressError,
    isLoaded: progressLoaded,
    latestProgressByBook,
    progressMap,
    resetProgress,
  } = useReadingProgress();
  const insets = useSafeAreaInsets();
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const activePlanCount = Object.keys(activePlanMap).length;
  const progressCount = Object.keys(latestProgressByBook).length;
  const editionProgressCount = Object.keys(progressMap).length;
  const storageIsLoading =
    !bookmarksLoaded || !plansLoaded || !preferencesLoaded || !progressLoaded;

  const displayToast = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      setToastMessage(message);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    }
  };

  return (
    <Screen>
      <CustomToast message={toastMessage} visible={showToast} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 5,
          paddingHorizontal: spacing.page,
          gap: spacing.gap2xl,
          paddingBottom: 40,
        }}
      >
        <PageHeader
          title="Settings"
          subtitle="Customize your reading experience and manage your library."
        />

        {storageIsLoading ? (
          <LoadingCard
            title="Loading settings"
            message="Getting your preferences and reading data ready."
          />
        ) : null}

        {preferencesError || bookmarksError || plansError || progressError ? (
          <ErrorCard
            title="Couldn't load some settings"
            message="Some of your preferences couldn't be loaded. Using defaults for now."
          />
        ) : null}

        <SectionCard>
          <CardTitle>Reading theme</CardTitle>
          <View style={{ gap: spacing.gapSm }}>
            <MetaText>Current theme</MetaText>
            <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
              {getThemeLabel(theme)}
            </Text>
          </View>
          <ActionButton
            label={`Switch to ${getNextThemeLabel(theme)}`}
            onPress={() => {
              void cycleTheme();
            }}
            variant="primary"
          />
        </SectionCard>

        <SectionCard>
          <CardTitle>Your library</CardTitle>
          <View style={{ gap: spacing.gapMd }}>
            <View style={{ gap: spacing.gapXs }}>
              <MetaText>Books you&apos;re reading</MetaText>
              <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
                {progressCount} of {catalog?.books.length ?? 0}
              </Text>
            </View>
            <View style={{ gap: spacing.gapXs }}>
              <MetaText>Saved reading editions</MetaText>
              <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
                {editionProgressCount}
              </Text>
            </View>
            <View style={{ gap: spacing.gapXs }}>
              <MetaText>Saved bookmarks</MetaText>
              <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
                {bookmarks.length}
              </Text>
            </View>
            <View style={{ gap: spacing.gapXs }}>
              <MetaText>Active reading plans</MetaText>
              <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
                {activePlanCount}
              </Text>
            </View>
          </View>
        </SectionCard>

        <Pressable
          onPress={() => setShowDangerZone(!showDangerZone)}
          style={{
            backgroundColor: colors.surfaceMuted,
            borderRadius: radii.lg,
            padding: spacing.page,
            gap: spacing.gapLg,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Manage your data</CardTitle>
            <Text style={{ color: colors.textMuted, fontSize: typography.title }}>
              {showDangerZone ? "−" : "+"}
            </Text>
          </View>

          {showDangerZone ? (
            <View style={{ gap: spacing.gapMd }}>
              <Text style={{ color: colors.textMuted, fontSize: typography.bodySmall, lineHeight: 22 }}>
                These actions will permanently delete your data from this device.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.gapMd }}>
                <ActionButton
                  label="Clear reading progress"
                  onPress={() => {
                    Alert.alert(
                      "Clear reading progress?",
                      "This will remove all your reading progress from every saved edition. This cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Clear",
                          style: "destructive",
                          onPress: () => {
                            void resetProgress();
                            displayToast("Reading progress cleared");
                          },
                        },
                      ]
                    );
                  }}
                />
                <ActionButton
                  label="Clear bookmarks"
                  onPress={() => {
                    Alert.alert(
                      "Clear all bookmarks?",
                      "This will remove all saved bookmarks from your library. This cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Clear",
                          style: "destructive",
                          onPress: () => {
                            void clearBookmarks();
                            displayToast("Bookmarks cleared");
                          },
                        },
                      ]
                    );
                  }}
                />
                <ActionButton
                  label="Clear reading plans"
                  onPress={() => {
                    Alert.alert(
                      "Clear all reading plans?",
                      "This will remove all active reading plans. This cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Clear",
                          style: "destructive",
                          onPress: () => {
                            void clearAllPlans();
                            displayToast("Reading plans cleared");
                          },
                        },
                      ]
                    );
                  }}
                />
              </View>
            </View>
          ) : null}
        </Pressable>

        {(catalog?.books.length ?? 0) === 0 ? (
          <EmptyCard
            title="No books available"
            message="Your library is empty right now. Books will appear here when they're added."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

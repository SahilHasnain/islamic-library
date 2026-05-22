import { Pressable, ScrollView, Text, View } from "react-native";

import {
  BodyText,
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
import { BOOKS } from "../../data/books";
import { useBookmarks } from "../../hooks/useBookmarks";
import { useReadingPlans } from "../../hooks/useReadingPlans";
import { useReaderPreferences } from "../../hooks/useReaderPreferences";
import { useReadingProgress } from "../../hooks/useReadingProgress";

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

export default function SettingsScreen() {
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
    progressMap,
    resetProgress,
  } = useReadingProgress();

  const activePlanCount = Object.keys(activePlanMap).length;
  const progressCount = Object.keys(progressMap).length;
  const storageIsLoading =
    !bookmarksLoaded || !plansLoaded || !preferencesLoaded || !progressLoaded;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.page,
          gap: spacing.gap2xl,
          paddingBottom: 40,
        }}
      >
        <PageHeader
          title="Settings"
          subtitle="Reader preferences, local data, and app-level controls for your library."
        />

        {storageIsLoading ? (
          <LoadingCard
            title="Loading settings"
            message="Restoring preferences, saved plans, bookmarks, and reading progress."
          />
        ) : null}

        {preferencesError || bookmarksError || plansError || progressError ? (
          <ErrorCard
            title="Some settings are using fallback state"
            message="One or more local settings collections could not be loaded from storage."
          />
        ) : null}

        <SectionCard>
          <CardTitle>Reader preferences</CardTitle>
          <BodyText>
            The current reader theme applies to the in-app reading surface and will stay
            active across sessions.
          </BodyText>
          <View style={{ gap: spacing.gapSm }}>
            <MetaText>Current theme</MetaText>
            <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
              {theme === "light" ? "Light reader" : "Sepia reader"}
            </Text>
          </View>
          <ActionButton
            label={theme === "light" ? "Switch to Sepia" : "Switch to Light"}
            onPress={() => {
              void cycleTheme();
            }}
            variant="primary"
          />
        </SectionCard>

        <SectionCard>
          <CardTitle>Library data</CardTitle>
          <View style={{ gap: spacing.gapMd }}>
            <View style={{ gap: spacing.gapXs }}>
              <MetaText>Tracked books</MetaText>
              <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
                {progressCount} of {BOOKS.length}
              </Text>
            </View>
            <View style={{ gap: spacing.gapXs }}>
              <MetaText>Bookmarks saved</MetaText>
              <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
                {bookmarks.length}
              </Text>
            </View>
            <View style={{ gap: spacing.gapXs }}>
              <MetaText>Active plans</MetaText>
              <Text style={{ color: colors.text, fontSize: typography.subtitle, fontWeight: "800" }}>
                {activePlanCount}
              </Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard backgroundColor={colors.surfaceMuted}>
          <CardTitle>Local data tools</CardTitle>
          <BodyText color={colors.text}>
            These controls manage device-local app state only. They do not affect the seeded
            book catalog.
          </BodyText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.gapMd }}>
            <ActionButton
              label="Reset progress"
              onPress={() => {
                void resetProgress();
              }}
            />
            <ActionButton
              label="Clear bookmarks"
              onPress={() => {
                void clearBookmarks();
              }}
            />
            <ActionButton
              label="Clear active plans"
              onPress={() => {
                void clearAllPlans();
              }}
            />
          </View>
        </SectionCard>

        <SectionCard>
          <CardTitle>App scope</CardTitle>
          <BodyText>
            This version of the app is currently offline-first, storage-backed, and focused
            on guided reading flows rather than account sync.
          </BodyText>
          <View style={{ gap: spacing.gapSm }}>
            {[
              "Offline-first reading state",
              "Book, plan, and bookmark management on device",
              "Shared theme layer and reusable UI primitives",
            ].map((item) => (
              <Text
                key={item}
                style={{
                  color: colors.textMuted,
                  fontSize: typography.body,
                  lineHeight: 23,
                }}
              >
                - {item}
              </Text>
            ))}
          </View>
        </SectionCard>

        {BOOKS.length === 0 ? (
          <EmptyCard
            title="No books configured"
            message="The app shell is present, but the library catalog has not been seeded yet."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { radii, typography } from "../constants/theme";
import { useAppTheme } from "../hooks/useAppTheme";

type ConnectivityBannerTone = "offline" | "online";

type ConnectivityBannerProps = {
  tone: ConnectivityBannerTone;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

export function ConnectivityBanner({
  tone,
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: ConnectivityBannerProps) {
  const { colors } = useAppTheme();
  const isOffline = tone === "offline";
  const borderColor = isOffline ? colors.accent : colors.success;
  const iconColor = isOffline ? colors.accentStrong : colors.success;

  return (
    <View
      accessibilityRole="alert"
      style={{
        width: "100%",
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 12,
        elevation: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Ionicons
          name={isOffline ? "cloud-offline-outline" : "checkmark-circle-outline"}
          size={20}
          color={iconColor}
          style={{ marginTop: 1 }}
        />

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: typography.bodySmall, fontWeight: "800" }}>
            {title}
          </Text>
          {message ? (
            <Text style={{ color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 }}>
              {message}
            </Text>
          ) : null}
        </View>

        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss connectivity notice"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 2 })}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            borderRadius: radii.pill,
            backgroundColor: isOffline ? colors.accent : colors.success,
            paddingHorizontal: 16,
            paddingVertical: 9,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontSize: typography.control, fontWeight: "800" }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

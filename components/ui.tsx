import type { PropsWithChildren, ReactNode } from "react";
import { Text, View } from "react-native";

import { lineHeights, radii, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../hooks/useAppTheme";

export function Screen({
  children,
  backgroundColor,
}: PropsWithChildren<{ backgroundColor?: string }>) {
  const { colors } = useAppTheme();

  return <View style={{ flex: 1, backgroundColor: backgroundColor ?? colors.background }}>{children}</View>;
}

export function SectionCard({
  children,
  backgroundColor,
  gap = spacing.gapLg,
}: PropsWithChildren<{ backgroundColor?: string; gap?: number }>) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: backgroundColor ?? colors.surface,
        borderRadius: radii.lg,
        padding: spacing.page,
        gap,
      }}
    >
      {children}
    </View>
  );
}

export function HeroCard({
  children,
  backgroundColor,
}: PropsWithChildren<{ backgroundColor?: string }>) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: backgroundColor ?? colors.hero,
        borderRadius: radii.xl,
        padding: spacing.hero,
        gap: spacing.gapLg,
      }}
    >
      {children}
    </View>
  );
}

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={{ gap: spacing.gapSm }}>
      <Text style={{ color: colors.text, fontSize: typography.hero, fontWeight: "800" }}>
        {title}
      </Text>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typography.body,
          lineHeight: lineHeights.body,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

export function CardTitle({ children }: PropsWithChildren) {
  const { colors } = useAppTheme();

  return (
    <Text style={{ color: colors.text, fontSize: typography.cardTitle, fontWeight: "800" }}>
      {children}
    </Text>
  );
}

export function MetaText({
  children,
  color,
}: PropsWithChildren<{ color?: string }>) {
  const { colors } = useAppTheme();

  return (
    <Text
      style={{
        color: color ?? colors.accent,
        fontSize: typography.caption,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </Text>
  );
}

export function BodyText({
  children,
  color,
}: PropsWithChildren<{ color?: string }>) {
  const { colors } = useAppTheme();

  return (
    <Text style={{ color: color ?? colors.textMuted, fontSize: typography.body, lineHeight: lineHeights.bodyWide }}>
      {children}
    </Text>
  );
}

export function ProgressBar({
  progressPercent,
  fillColor,
  trackColor,
}: {
  progressPercent: number;
  fillColor?: string;
  trackColor?: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        height: 8,
        borderRadius: radii.pill,
        backgroundColor: trackColor ?? colors.progressTrack,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${progressPercent}%`,
          height: "100%",
          borderRadius: radii.pill,
          backgroundColor: fillColor ?? colors.accent,
        }}
      />
    </View>
  );
}

export function Chip({
  label,
  backgroundColor,
  color,
}: {
  label: string;
  backgroundColor?: string;
  color?: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: backgroundColor ?? colors.surfaceMuted,
        borderRadius: radii.pill,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: color ?? colors.text, fontSize: typography.label, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function CoverBlock({
  color,
  children,
}: {
  color: string;
  children?: ReactNode;
}) {
  return (
    <View
      style={{
        width: 54,
        height: 72,
        borderRadius: 16,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

export function LoadingCard({
  title = "Loading",
  message = "Preparing your reading state...",
}: {
  title?: string;
  message?: string;
}) {
  const { colors } = useAppTheme();

  return (
    <SectionCard backgroundColor={colors.surfaceMuted} gap={spacing.gapSm}>
      <CardTitle>{title}</CardTitle>
      <BodyText>{message}</BodyText>
    </SectionCard>
  );
}

export function EmptyCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <SectionCard>
      <CardTitle>{title}</CardTitle>
      <BodyText>{message}</BodyText>
    </SectionCard>
  );
}

export function ErrorCard({
  title = "Something went wrong",
  message = "This part of the app could not be loaded from local storage.",
}: {
  title?: string;
  message?: string;
}) {
  const { colors } = useAppTheme();

  return (
    <SectionCard backgroundColor={colors.surfaceSoft}>
      <CardTitle>{title}</CardTitle>
      <BodyText color={colors.text}>{message}</BodyText>
    </SectionCard>
  );
}

import type { PropsWithChildren, ReactNode } from "react";
import { Text, View } from "react-native";

import { colors, lineHeights, radii, spacing, typography } from "../constants/theme";

export function Screen({
  children,
  backgroundColor = colors.background,
}: PropsWithChildren<{ backgroundColor?: string }>) {
  return <View style={{ flex: 1, backgroundColor }}>{children}</View>;
}

export function SectionCard({
  children,
  backgroundColor = colors.surface,
  gap = spacing.gapLg,
}: PropsWithChildren<{ backgroundColor?: string; gap?: number }>) {
  return (
    <View
      style={{
        backgroundColor,
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
  backgroundColor = colors.hero,
}: PropsWithChildren<{ backgroundColor?: string }>) {
  return (
    <View
      style={{
        backgroundColor,
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
  return (
    <Text style={{ color: colors.text, fontSize: typography.cardTitle, fontWeight: "800" }}>
      {children}
    </Text>
  );
}

export function MetaText({
  children,
  color = colors.accent,
}: PropsWithChildren<{ color?: string }>) {
  return (
    <Text
      style={{
        color,
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
  color = colors.textMuted,
}: PropsWithChildren<{ color?: string }>) {
  return (
    <Text style={{ color, fontSize: typography.body, lineHeight: lineHeights.bodyWide }}>
      {children}
    </Text>
  );
}

export function ProgressBar({
  progressPercent,
  fillColor = colors.accent,
  trackColor = colors.progressTrack,
}: {
  progressPercent: number;
  fillColor?: string;
  trackColor?: string;
}) {
  return (
    <View
      style={{
        height: 8,
        borderRadius: radii.pill,
        backgroundColor: trackColor,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${progressPercent}%`,
          height: "100%",
          borderRadius: radii.pill,
          backgroundColor: fillColor,
        }}
      />
    </View>
  );
}

export function Chip({
  label,
  backgroundColor = colors.surfaceMuted,
  color = colors.text,
}: {
  label: string;
  backgroundColor?: string;
  color?: string;
}) {
  return (
    <View
      style={{
        backgroundColor,
        borderRadius: radii.pill,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color, fontSize: typography.label, fontWeight: "700" }}>{label}</Text>
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
  return (
    <SectionCard backgroundColor={colors.surfaceSoft}>
      <CardTitle>{title}</CardTitle>
      <BodyText color={colors.text}>{message}</BodyText>
    </SectionCard>
  );
}

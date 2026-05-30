export const appThemes = {
  light: {
    background: "#F7F1E3",
    backgroundWarm: "#F6F0E2",
    surface: "#FFF9EA",
    surfaceMuted: "#F2E8CC",
    surfaceSoft: "#EFE2B6",
    surfaceElevated: "#F4ECD9",
    reader: "#FCF7EB",
    readerBorder: "#E5D8B6",
    progressTrack: "#E8DDC0",
    disabledSurface: "#E4DDCA",
    disabledText: "#8A8E86",
    text: "#173D31",
    textMuted: "#5F6C65",
    textSubtle: "#6B7A72",
    textOnDark: "#FFF9EA",
    textOnDarkMuted: "#D9E2DC",
    textOnDarkSubtle: "#C9D5CF",
    accent: "#C9A961",
    accentStrong: "#9F7A2F",
    primaryButton: "#173D31",
    primaryButtonText: "#FFF9EA",
    hero: "#173D31",
    border: "#E5D9B8",
    tabBar: "#FFF9EA",
    tabBarBorder: "#E5D9B8",
    tabBarActiveTint: "#173D31",
    tabBarInactiveTint: "#7A837D",
    scrim: "rgba(0, 0, 0, 0.7)",
    overlay: "rgba(23, 61, 49, 0.9)",
    overlayLight: "rgba(255, 249, 234, 0.16)",
    overlayMuted: "rgba(255, 249, 234, 0.12)",
    success: "#5B9A71",
  },
  dark: {
    background: "#101815",
    backgroundWarm: "#13201C",
    surface: "#16211D",
    surfaceMuted: "#1E2C27",
    surfaceSoft: "#243730",
    surfaceElevated: "#21302B",
    reader: "#0F1714",
    readerBorder: "#2B3A34",
    progressTrack: "#2A3B34",
    disabledSurface: "#22302B",
    disabledText: "#7F9088",
    text: "#EAF1ED",
    textMuted: "#A9B7B0",
    textSubtle: "#8FA19A",
    textOnDark: "#F2F6F3",
    textOnDarkMuted: "#C3D0CA",
    textOnDarkSubtle: "#A8B6AF",
    accent: "#88A879",
    accentStrong: "#A8C69A",
    primaryButton: "#284239",
    primaryButtonText: "#F2F6F3",
    hero: "#13201C",
    border: "#263831",
    tabBar: "#13201C",
    tabBarBorder: "#22312B",
    tabBarActiveTint: "#EAF1ED",
    tabBarInactiveTint: "#7F9088",
    scrim: "rgba(0, 0, 0, 0.78)",
    overlay: "rgba(6, 10, 9, 0.94)",
    overlayLight: "rgba(219, 228, 223, 0.12)",
    overlayMuted: "rgba(219, 228, 223, 0.08)",
    success: "#6FBE8E",
  },
} as const;

export const colors = appThemes.light;

export type AppThemeVariant = keyof typeof appThemes;
export type AppColors = (typeof appThemes)[AppThemeVariant];

export function getReaderColors(theme: AppThemeVariant) {
  const palette = appThemes[theme];

  return {
    background: palette.reader,
    overlay: palette.overlay,
    overlayLight: palette.overlayLight,
    overlayMuted: palette.overlayMuted,
    text: palette.textOnDark,
    textMuted: theme === "dark" ? palette.textMuted : palette.textOnDarkMuted,
    textStrong: palette.text,
    accent: palette.accent,
    panel: palette.surface,
    panelText: palette.text,
    secondaryPanel: palette.surfaceElevated,
  };
}

export const typography = {
  hero: 36,
  sectionTitle: 30,
  cardTitle: 22,
  title: 20,
  subtitle: 18,
  body: 16,
  bodySmall: 15,
  label: 14,
  caption: 13,
  control: 12,
} as const;

export const radii = {
  xl: 28,
  lg: 24,
  md: 22,
  sm: 20,
  pill: 999,
} as const;

export const spacing = {
  page: 20,
  section: 20,
  card: 18,
  hero: 24,
  gapXs: 6,
  gapSm: 8,
  gapMd: 10,
  gapLg: 12,
  gapXl: 14,
  gap2xl: 18,
  gap3xl: 20,
} as const;

export const lineHeights = {
  body: 23,
  bodyWide: 24,
  reading: 31,
  relaxed: 22,
  roomy: 26,
} as const;

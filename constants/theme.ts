export const colors = {
  background: "#F7F1E3",
  backgroundWarm: "#F6F0E2",
  surface: "#FFF9EA",
  surfaceMuted: "#F2E8CC",
  surfaceSoft: "#EFE2B6",
  reader: "#FCF7EB",
  readerBorder: "#E5D8B6",
  progressTrack: "#E8DDC0",
  disabledSurface: "#E4DDCA",
  disabledText: "#8A8E86",
  text: "#173D31",
  textMuted: "#5F6C65",
  textOnDark: "#FFF9EA",
  textOnDarkMuted: "#D9E2DC",
  textOnDarkSubtle: "#C9D5CF",
  accent: "#C9A961",
  accentStrong: "#9F7A2F",
  primaryButton: "#173D31",
  primaryButtonText: "#FFF9EA",
  hero: "#173D31",
} as const;

export const readerThemes = {
  light: {
    background: "#F6F0E2",
    surface: "#FFF9EA",
    text: "#173D31",
    textMuted: "#5F6C65",
    accent: "#C9A961",
    reader: "#FCF7EB",
    readerBorder: "#E5D8B6",
    button: "#173D31",
    buttonText: "#FFF9EA",
    softSurface: "#EFE2B6",
    progressTrack: "#E8DDC0",
    disabledSurface: "#E4DDCA",
    disabledText: "#8A8E86",
  },
  sepia: {
    background: "#EDE0C8",
    surface: "#F6ECD7",
    text: "#3F3425",
    textMuted: "#6D5D46",
    accent: "#9F7A2F",
    reader: "#F8EFD9",
    readerBorder: "#D8C39A",
    button: "#5B4B33",
    buttonText: "#FFF7E7",
    softSurface: "#E7D3A5",
    progressTrack: "#D9C49A",
    disabledSurface: "#D7CCB4",
    disabledText: "#7D725F",
  },
} as const;

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

import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorCard, LoadingCard } from "../../../components/ui";
import type { PublicBookSection } from "../../../data/types";
import { useAppTheme } from "../../../hooks/useAppTheme";
import { useRemoteBookData } from "../../../hooks/useRemoteBookData";
import { useReadingProgress } from "../../../hooks/useReadingProgress";

function buildSections(totalPages: number): PublicBookSection[] {
  const total = Math.max(totalPages, 1);
  const sectionCount = Math.min(6, Math.max(3, Math.ceil(total / 40)));
  const sectionSpan = Math.max(1, Math.ceil(total / sectionCount));

  return Array.from({ length: sectionCount }, (_, index) => {
    const startPage = index * sectionSpan + 1;
    const endPage = index === sectionCount - 1 ? total : Math.min(total, (index + 1) * sectionSpan);

    return {
      id: `section-${index + 1}`,
      title: `Section ${index + 1}`,
      startPage,
      endPage,
      estimatedMinutes: Math.max(10, (endPage - startPage + 1) * 2),
    };
  });
}

function getOrderedSections(sections: PublicBookSection[]) {
  return [...sections].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.startPage - right.startPage;
  });
}

function getSectionEntryPage(section: PublicBookSection) {
  return section.entryPage ?? section.startPage;
}

function getSectionKindLabel(section: PublicBookSection) {
  switch (section.kind) {
    case "front-matter":
      return "Opening";
    case "chapter":
      return "Chapter";
    case "litany":
      return "Litany";
    case "dua":
      return "Dua";
    case "reflection":
      return "Reflection";
    case "appendix":
      return "Appendix";
    default:
      return null;
  }
}

export default function BookSectionsScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { bookId, languageId: routeLanguageId, volumeId: routeVolumeId } = useLocalSearchParams<{
    bookId: string;
    languageId?: string;
    volumeId?: string;
  }>();
  const readingBookId = Array.isArray(bookId) ? bookId[0] : bookId ?? "";
  const preferredLanguageId = Array.isArray(routeLanguageId) ? routeLanguageId[0] : routeLanguageId;
  const preferredVolumeId = Array.isArray(routeVolumeId) ? routeVolumeId[0] : routeVolumeId;
  const { progress } = useReadingProgress(readingBookId);
  const {
    metadata,
    metadataError,
    isMetadataLoading,
    manifest,
    selectedLanguage,
    selectedVolume,
  } = useRemoteBookData(
    readingBookId,
    preferredLanguageId ?? progress?.languageId,
    preferredVolumeId ?? progress?.volumeId,
  );
  const totalPages = manifest?.totalPages ?? 1;
  const hasAuthoredSections = Boolean(selectedVolume?.sections?.length);
  const sections = getOrderedSections(
    hasAuthoredSections ? selectedVolume?.sections ?? [] : buildSections(totalPages),
  );
  const displayTitle = metadata?.title ?? "Published book";
  const displayLanguageTitle = selectedLanguage?.title ?? preferredLanguageId ?? progress?.languageId ?? "Edition";
  const displayVolumeTitle = selectedVolume?.subtitle ?? selectedVolume?.title;
  const resolvedLanguageId = selectedLanguage?.id ?? preferredLanguageId ?? progress?.languageId ?? "english";
  const resolvedVolumeId = selectedVolume?.id ?? preferredVolumeId ?? progress?.volumeId ?? "volume1";

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, gap: 16, paddingBottom: 40 }}>
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800" }}>
            {displayTitle}
          </Text>
          {isMetadataLoading ? (
            <LoadingCard
              title="Loading book metadata"
              message="Preparing the reading sections for this book."
            />
          ) : null}
          {metadataError ? (
            <ErrorCard
              title="Published metadata unavailable"
              message="The sections for this book could not be loaded."
            />
          ) : null}

          {/* Language and Volume in one row */}
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", opacity: 0.8 }}>
                Edition
              </Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>
                {displayLanguageTitle}
              </Text>
            </View>
            {displayVolumeTitle ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", opacity: 0.8 }}>
                  Volume
                </Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>
                  {displayVolumeTitle}
                </Text>
              </View>
            ) : null}
          </View>

          {!hasAuthoredSections ? (
            <View
              style={{
                backgroundColor: colors.surfaceElevated,
                borderRadius: 12,
                padding: 12,
                borderLeftWidth: 3,
                borderLeftColor: colors.accent,
              }}
            >
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
                Guided sections are being prepared
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                You can still browse all sections and read freely.
              </Text>
            </View>
          ) : null}
           {sections.map((section, index) => (
             <Link
               key={section.id}
               href={`/reader/${readingBookId}/${resolvedLanguageId}/${resolvedVolumeId}/${getSectionEntryPage(section)}` as const}
               asChild
             >
               <Pressable
                 style={{
                   backgroundColor: colors.surface,
                   borderRadius: 24,
                   padding: 20,
                   gap: 14,
                 }}
               >
                 {/* Header with Section Number Badge */}
                 <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                   <View
                     style={{
                       backgroundColor: colors.accent,
                       borderRadius: 999,
                       width: 44,
                       height: 44,
                       justifyContent: "center",
                       alignItems: "center",
                       flexShrink: 0,
                     }}
                   >
                     <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                       {index + 1}
                     </Text>
                   </View>
                   <View style={{ flex: 1, gap: 4 }}>
                     <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                       {section.title}
                     </Text>
                     {section.subtitle ? (
                       <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                         {section.subtitle}
                       </Text>
                     ) : null}
                   </View>
                 </View>

                 {/* Description if available */}
                 {section.description ? (
                   <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                     {section.description}
                   </Text>
                 ) : null}

                 {/* Metadata Grid */}
                 <View style={{ gap: 10 }}>
                   <View
                     style={{
                        backgroundColor: colors.surfaceElevated,
                       borderRadius: 12,
                       padding: 12,
                       flexDirection: "row",
                       alignItems: "center",
                       gap: 10,
                     }}
                   >
                     <Text style={{ fontSize: 16 }}>📄</Text>
                     <View style={{ flex: 1 }}>
                       <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", opacity: 0.8 }}>
                         Pages
                       </Text>
                       <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>
                         {section.startPage}–{section.endPage}
                       </Text>
                     </View>
                   </View>

                   <View
                     style={{
                        backgroundColor: colors.surfaceElevated,
                       borderRadius: 12,
                       padding: 12,
                       flexDirection: "row",
                       alignItems: "center",
                       gap: 10,
                     }}
                   >
                     <Text style={{ fontSize: 16 }}>⏱️</Text>
                     <View style={{ flex: 1 }}>
                       <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", opacity: 0.8 }}>
                         Estimated Time
                       </Text>
                       <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>
                         {section.estimatedMinutes} minutes
                       </Text>
                     </View>
                   </View>

                   {getSectionKindLabel(section) ? (
                     <View
                       style={{
                          backgroundColor: colors.surfaceElevated,
                         borderRadius: 12,
                         padding: 12,
                         flexDirection: "row",
                         alignItems: "center",
                         gap: 10,
                       }}
                     >
                       <Text style={{ fontSize: 16 }}>📌</Text>
                       <View style={{ flex: 1 }}>
                         <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", opacity: 0.8 }}>
                           Type
                         </Text>
                         <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>
                           {getSectionKindLabel(section)}
                         </Text>
                       </View>
                     </View>
                   ) : null}
                 </View>
               </Pressable>
             </Link>
           ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

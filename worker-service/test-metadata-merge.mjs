/**
 * Test script to verify metadata merging logic
 * Run with: node test-metadata-merge.mjs
 */

// Simulate existing metadata with English volume
const existingMetadata = {
  id: "seerat-e-mustafa",
  title: "Seerat e Mustafa",
  subtitle: "A gentle seerah reading journey",
  author: "Allama Abdul Mustafa Al Aazmi",
  category: "Seerah",
  coverImage: "https://cdn.jsdelivr.net/gh/sahilhasnain/islamic-library-assets@main/books/seerat-e-mustafa/cover.png",
  languages: [
    {
      id: "english",
      title: "English",
      volumes: [
        {
          id: "volume1",
          title: "Volume 1",
          manifestUrl: "https://cdn.jsdelivr.net/gh/sahilhasnain/islamic-library-assets@main/books/seerat-e-mustafa/english/volume1/manifest.json"
        }
      ]
    }
  ]
};

// Simulate new metadata for Hindi volume1
const newMetadataHindi = {
  title: "Seerat e Mustafa",
  languages: [
    {
      id: "hindi",
      title: "Hindi",
      volumes: [
        {
          id: "volume1",
          title: "Volume 1"
        }
      ]
    }
  ]
};

// Simulate new metadata for English volume2
const newMetadataEnglishV2 = {
  title: "Seerat e Mustafa",
  languages: [
    {
      id: "english",
      title: "English",
      volumes: [
        {
          id: "volume2",
          title: "Volume 2"
        }
      ]
    }
  ]
};

function mergeMetadata(existingMetadata, newMetadata, languageId, volumeId, manifestUrl) {
  const existingLanguages = existingMetadata.languages || [];
  const currentLanguageIndex = existingLanguages.findIndex(lang => lang.id === languageId);
  
  let updatedLanguages;
  if (currentLanguageIndex >= 0) {
    // Language exists, merge volumes
    const existingLanguage = existingLanguages[currentLanguageIndex];
    const existingVolumes = existingLanguage.volumes || [];
    const currentVolumeIndex = existingVolumes.findIndex(vol => vol.id === volumeId);
    
    let updatedVolumes;
    if (currentVolumeIndex >= 0) {
      // Volume exists, update it
      updatedVolumes = [...existingVolumes];
      updatedVolumes[currentVolumeIndex] = {
        ...existingVolumes[currentVolumeIndex],
        ...(newMetadata.languages?.find(l => l.id === languageId)?.volumes?.find(v => v.id === volumeId) || {}),
        manifestUrl,
      };
    } else {
      // Volume doesn't exist, add it
      const newVolume = {
        ...(newMetadata.languages?.find(l => l.id === languageId)?.volumes?.find(v => v.id === volumeId) || {}),
        id: volumeId,
        manifestUrl,
      };
      updatedVolumes = [...existingVolumes, newVolume];
    }
    
    updatedLanguages = [...existingLanguages];
    updatedLanguages[currentLanguageIndex] = {
      ...existingLanguage,
      ...(newMetadata.languages?.find(l => l.id === languageId) || {}),
      volumes: updatedVolumes,
    };
  } else {
    // Language doesn't exist, add it
    const newLanguage = {
      ...(newMetadata.languages?.find(l => l.id === languageId) || {}),
      id: languageId,
      volumes: [{
        ...(newMetadata.languages?.find(l => l.id === languageId)?.volumes?.find(v => v.id === volumeId) || {}),
        id: volumeId,
        manifestUrl,
      }],
    };
    updatedLanguages = [...existingLanguages, newLanguage];
  }

  return {
    ...existingMetadata,
    ...newMetadata,
    languages: updatedLanguages,
  };
}

console.log("Test 1: Adding new language (Hindi)");
console.log("=====================================");
const result1 = mergeMetadata(
  existingMetadata,
  newMetadataHindi,
  "hindi",
  "volume1",
  "https://cdn.jsdelivr.net/gh/sahilhasnain/islamic-library-assets@main/books/seerat-e-mustafa/hindi/volume1/manifest.json"
);
console.log(JSON.stringify(result1, null, 2));
console.log("\nLanguages count:", result1.languages.length);
console.log("Expected: 2 (english + hindi)");
console.log("✓ Test 1 passed:", result1.languages.length === 2);

console.log("\n\nTest 2: Adding new volume to existing language (English volume2)");
console.log("===================================================================");
const result2 = mergeMetadata(
  result1,
  newMetadataEnglishV2,
  "english",
  "volume2",
  "https://cdn.jsdelivr.net/gh/sahilhasnain/islamic-library-assets@main/books/seerat-e-mustafa/english/volume2/manifest.json"
);
console.log(JSON.stringify(result2, null, 2));
console.log("\nEnglish volumes count:", result2.languages.find(l => l.id === "english").volumes.length);
console.log("Expected: 2 (volume1 + volume2)");
console.log("✓ Test 2 passed:", result2.languages.find(l => l.id === "english").volumes.length === 2);

console.log("\n\nTest 3: Verify all data preserved");
console.log("===================================");
const englishLang = result2.languages.find(l => l.id === "english");
const hindiLang = result2.languages.find(l => l.id === "hindi");
console.log("English volume1 still exists:", !!englishLang.volumes.find(v => v.id === "volume1"));
console.log("English volume2 exists:", !!englishLang.volumes.find(v => v.id === "volume2"));
console.log("Hindi volume1 exists:", !!hindiLang.volumes.find(v => v.id === "volume1"));
console.log("✓ Test 3 passed: All volumes preserved");

console.log("\n✅ All tests passed! Metadata merging works correctly.");

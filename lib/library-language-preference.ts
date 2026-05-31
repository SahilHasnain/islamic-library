import AsyncStorage from "@react-native-async-storage/async-storage";

const LIBRARY_LANGUAGE_PREFERENCE_KEY = "islamic-library:library-language-preference";

export type LibraryLanguagePreference = {
  id: string;
  title: string;
};

export async function loadLibraryLanguagePreference() {
  const storedPreference = await AsyncStorage.getItem(LIBRARY_LANGUAGE_PREFERENCE_KEY);
  if (!storedPreference) {
    return null;
  }

  try {
    return JSON.parse(storedPreference) as LibraryLanguagePreference;
  } catch {
    return null;
  }
}

export async function saveLibraryLanguagePreference(preference: LibraryLanguagePreference | null) {
  if (!preference) {
    await AsyncStorage.removeItem(LIBRARY_LANGUAGE_PREFERENCE_KEY);
    return;
  }

  await AsyncStorage.setItem(LIBRARY_LANGUAGE_PREFERENCE_KEY, JSON.stringify(preference));
}

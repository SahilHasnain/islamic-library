import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Bookmark } from "../data/types";

const STORAGE_KEY = "islamic-library:bookmarks";

export function useBookmarks(bookId?: string) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadBookmarks() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) {
          return;
        }

        setBookmarks(stored ? (JSON.parse(stored) as Bookmark[]) : []);
        setError(null);
        setIsLoaded(true);
      } catch {
        if (isMounted) {
          setBookmarks([]);
          setError("bookmarks-load-failed");
          setIsLoaded(true);
        }
      }
    }

    void loadBookmarks();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredBookmarks = useMemo(() => {
    if (!bookId) {
      return bookmarks;
    }

    return bookmarks.filter((bookmark) => bookmark.bookId === bookId);
  }, [bookId, bookmarks]);

  const persist = useCallback(async (nextBookmarks: Bookmark[]) => {
    setBookmarks(nextBookmarks);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextBookmarks));
    } catch {
      // Keep in-memory bookmarks if persistence fails.
    }
  }, []);

  const addBookmark = useCallback(
    async (bookmark: Omit<Bookmark, "id" | "createdAt">) => {
      const nextBookmark: Bookmark = {
        ...bookmark,
        id: `${bookmark.bookId}-${bookmark.languageId}-${bookmark.volumeId}-${bookmark.page}`,
        createdAt: new Date().toISOString(),
      };

      const exists = bookmarks.some((item) => item.id === nextBookmark.id);
      if (exists) {
        return;
      }

      const nextBookmarks = [nextBookmark, ...bookmarks].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      await persist(nextBookmarks);
    },
    [bookmarks, persist],
  );

  const removeBookmark = useCallback(
    async (bookmarkId: string) => {
      const nextBookmarks = bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
      await persist(nextBookmarks);
    },
    [bookmarks, persist],
  );

  const clearBookmarks = useCallback(async () => {
    await persist([]);
  }, [persist]);

  const getBookmarkForPage = useCallback(
    (targetBookId: string, languageId: string, volumeId: string, page: number) => {
      return bookmarks.find(
        (bookmark) =>
          bookmark.bookId === targetBookId &&
          bookmark.languageId === languageId &&
          bookmark.volumeId === volumeId &&
          bookmark.page === page,
      );
    },
    [bookmarks],
  );

  return {
    error,
    isLoaded,
    bookmarks,
    filteredBookmarks,
    addBookmark,
    clearBookmarks,
    removeBookmark,
    getBookmarkForPage,
  };
}

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";

export default function SearchScreen() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      router.replace({ pathname: "/library", params: { search: "1" } });
    }, [router]),
  );

  return null;
}

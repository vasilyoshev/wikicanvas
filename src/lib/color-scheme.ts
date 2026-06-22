import { useEffect } from "react";
import { Platform, useColorScheme } from "react-native";
import { colorScheme as nwColorScheme } from "nativewind";

import { useThemeStore } from "@/src/stores/theme-store";

type ResolvedColorScheme = "light" | "dark";

/**
 * Resolve the active light/dark scheme from the stored preference + OS, WITHOUT the
 * hydrate / NativeWind side effects of `useAppColorScheme`. Safe to call from any
 * component (e.g. the article reader) that just needs to follow the app theme.
 */
export function useResolvedColorScheme(): ResolvedColorScheme {
  const preference = useThemeStore((s) => s.preference);
  const systemColorScheme: ResolvedColorScheme = useColorScheme() === "dark" ? "dark" : "light";
  return preference === "system" ? systemColorScheme : preference;
}

export function useAppColorScheme(): ResolvedColorScheme {
  const preference = useThemeStore((s) => s.preference);
  const hydrate = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    // Swallow storage-read failures so a rejected hydrate isn't an unhandled rejection.
    void hydrate().catch(() => {});
  }, [hydrate]);

  const resolved = useResolvedColorScheme();

  // Native takes `preference` so "system" clears the Appearance override that
  // would otherwise pin useColorScheme above to the previous explicit choice.
  // Web takes `resolved` because NativeWind's web path drops html.dark for
  // "system" instead of mirroring the OS.
  useEffect(() => {
    nwColorScheme.set(Platform.OS === "web" ? resolved : preference);
  }, [preference, resolved]);

  return resolved;
}

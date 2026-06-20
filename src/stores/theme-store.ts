import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "wikicanvas:theme";

interface ThemeStore {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  hydrate: () => Promise<void>;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export const useThemeStore = create<ThemeStore>((set) => ({
  preference: "system",
  setPreference: (preference) => {
    set({ preference });
    void AsyncStorage.setItem(STORAGE_KEY, preference).catch(() => {});
  },
  hydrate: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isThemePreference(stored)) {
      set({ preference: stored });
    }
  },
}));

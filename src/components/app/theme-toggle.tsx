import { Button } from "@/src/components/react-native-reusables/button";
import { Icon, type MaterialIconName } from "@/src/components/react-native-reusables/icon";
import { useThemeStore } from "@/src/stores/theme-store";

type Preference = "system" | "light" | "dark";

// Tapping cycles system → light → dark → system. "System" follows the OS; light/dark
// pin the choice (and persist via the theme store), matching Wikipedia's Appearance panel.
const NEXT: Record<Preference, Preference> = { system: "light", light: "dark", dark: "system" };
const ICON: Record<Preference, MaterialIconName> = {
  system: "brightness-auto",
  light: "light-mode",
  dark: "dark-mode",
};
const LABEL: Record<Preference, string> = {
  system: "Theme: system (tap for light)",
  light: "Theme: light (tap for dark)",
  dark: "Theme: dark (tap for system)",
};

export function ThemeToggle() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <Button
      testID="theme-toggle"
      variant="secondary"
      size="icon"
      accessibilityLabel={LABEL[preference]}
      onPress={() => setPreference(NEXT[preference])}
    >
      <Icon name={ICON[preference]} />
    </Button>
  );
}

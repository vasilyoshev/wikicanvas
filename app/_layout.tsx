import "../global.css";
import "react-native-reanimated";
import "@/src/i18n";

import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppErrorBoundary } from "@/src/components/app/app-error-boundary";
import { SkiaLoader } from "@/src/components/app/skia-loader";
import { useScrollPersistence } from "@/src/features/canvas/scroll-persistence";
import { useAppColorScheme } from "@/src/lib/color-scheme";
import { AppProviders } from "@/src/providers/app-providers";
import { NAV_THEME, THEME_VARIABLES } from "@/lib/theme";

export default function RootLayout() {
  const colorScheme = useAppColorScheme();
  // Load saved per-node scroll offsets early so nodes can restore on first mount.
  useScrollPersistence();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Boundary wraps the providers so a provider/setup render crash is caught too. */}
      <AppErrorBoundary>
        <AppProviders>
          <ThemeProvider value={NAV_THEME[colorScheme]}>
            <View className="flex-1 bg-background" style={THEME_VARIABLES[colorScheme]}>
              <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
              {/* Load CanvasKit (WASM) on web before any Skia canvas/thumbnail renders. */}
              <SkiaLoader>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(app)" />
                  <Stack.Screen name="(auth)" />
                </Stack>
              </SkiaLoader>
              <PortalHost />
            </View>
          </ThemeProvider>
        </AppProviders>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}

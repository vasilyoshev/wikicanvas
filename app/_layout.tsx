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
import { useAppColorScheme } from "@/src/lib/color-scheme";
import { AppProviders } from "@/src/providers/app-providers";
import { NAV_THEME, THEME_VARIABLES } from "@/lib/theme";

export default function RootLayout() {
  const colorScheme = useAppColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProviders>
        <ThemeProvider value={NAV_THEME[colorScheme]}>
          <View className="flex-1 bg-background" style={THEME_VARIABLES[colorScheme]}>
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
            <AppErrorBoundary>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(app)" />
                <Stack.Screen name="(auth)" />
              </Stack>
            </AppErrorBoundary>
            <PortalHost />
          </View>
        </ThemeProvider>
      </AppProviders>
    </GestureHandlerRootView>
  );
}

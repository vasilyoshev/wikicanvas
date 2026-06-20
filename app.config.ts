import type { ExpoConfig } from "expo/config";

const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "";
const requiredReleaseEnv = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

function validateReleaseBuildEnv() {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile !== "preview" && profile !== "production") {
    return;
  }

  const missing = requiredReleaseEnv.filter((name) => !process.env[name]);
  if (!missing.length) {
    return;
  }

  throw new Error(
    `Missing required public environment values for the ${profile} EAS build: ${missing.join(
      ", ",
    )}.`,
  );
}

validateReleaseBuildEnv();

const config: ExpoConfig = {
  owner: "vasil.yoshev",
  name: "WikiCanvas",
  slug: "wikicanvas",
  version: "0.1.0",
  orientation: "default",
  icon: "./assets/icon.png",
  scheme: "wikicanvas",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#f4eff7",
  },
  ios: {
    supportsTablet: true,
    buildNumber: "1",
    bundleIdentifier: "org.vasilyoshev.wikicanvas",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f4eff7",
    },
    edgeToEdgeEnabled: true,
    package: "org.vasilyoshev.wikicanvas",
    versionCode: 1,
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-router", "expo-localization", "expo-web-browser", "expo-secure-store"],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: easProjectId,
    },
  },
};

export default config;

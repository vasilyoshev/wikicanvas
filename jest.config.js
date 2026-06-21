const expoPreset = require("jest-expo/jest-preset");

module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  moduleNameMapper: {
    // Force the web (IndexedDB) local-store entry in Jest so index.test.ts
    // resolves index.ts rather than index.native.ts (RN haste resolver would
    // otherwise prefer the .native extension because defaultPlatform is 'ios').
    "^@/src/lib/local-store/index$": "<rootDir>/src/lib/local-store/index.ts",
    // Force web implementation so ArticleHtml.test.tsx exercises the iframe +
    // shouldAcceptMessage guard, not the native WebView (which requires a native
    // binary and cannot run in Jest).
    "^(\\./|@/src/features/wikipedia/)ArticleHtml$":
      "<rootDir>/src/features/wikipedia/ArticleHtml.tsx",
    "^@/(.*)$": "<rootDir>/$1",
    // @expo/vector-icons requires expo-asset + expo-font (not available in Jest).
    // The manual mock in __mocks__/@expo/vector-icons/ renders a plain RN Text
    // so component tests that import Icon can run without a full Expo font stack.
    "^@expo/vector-icons/MaterialIcons$": "<rootDir>/__mocks__/@expo/vector-icons/MaterialIcons.js",
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/dist-e2e/",
    "/test/integration/",
    "/test/e2e/",
  ],
  // jest-expo's default leaves @rn-primitives untransformed; our UI primitives
  // depend on it, so widen the allowlist to transform it too.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace("native-base))", "native-base|@rn-primitives))"),
  ),
  // Coverage is scoped to the .ts logic surface. .tsx screens/components are
  // covered by e2e (not ratcheted); types/barrel/i18n modules are excluded.
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/types.ts",
    "!src/**/*.d.ts",
    "!src/i18n/**",
    "!src/lib/local-store/indexeddb-store.ts",
    "!src/lib/local-store/sqlite-store.ts",
    "!src/lib/local-store/index.ts",
    "!src/lib/local-store/index.native.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["json-summary", "text-summary", "lcov"],
};

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enErrors from "./locales/en/errors.json";
import enNavigation from "./locales/en/navigation.json";

export const supportedLanguages = ["en", "bg"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "auth", "errors", "navigation"],
  interpolation: { escapeValue: false },
  resources: {
    en: {
      common: enCommon,
      auth: enAuth,
      errors: enErrors,
      navigation: enNavigation,
    },
    // bg is registered lazily via ensureLanguageBundle().
  },
});

const loadedBundles = new Set<SupportedLanguage>(["en"]);

export async function ensureLanguageBundle(lang: SupportedLanguage): Promise<void> {
  if (loadedBundles.has(lang)) return;

  if (lang === "bg") {
    const { bgResources } = await import("./locales/bg");
    for (const ns of Object.keys(bgResources)) {
      if (!i18n.hasResourceBundle("bg", ns)) {
        i18n.addResourceBundle("bg", ns, bgResources[ns], true, true);
      }
    }
  }

  loadedBundles.add(lang);
}

export default i18n;

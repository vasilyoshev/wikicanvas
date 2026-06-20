import bgCommon from "./common.json";
import bgAuth from "./auth.json";
import bgErrors from "./errors.json";
import bgNavigation from "./navigation.json";

export const bgResources: Record<string, Record<string, unknown>> = {
  common: bgCommon,
  auth: bgAuth,
  errors: bgErrors,
  navigation: bgNavigation,
};

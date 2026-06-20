import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enErrors from "./locales/en/errors.json";
import enNavigation from "./locales/en/navigation.json";
import bgCommon from "./locales/bg/common.json";
import bgAuth from "./locales/bg/auth.json";
import bgErrors from "./locales/bg/errors.json";
import bgNavigation from "./locales/bg/navigation.json";

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object"
      ? flattenKeys(value as Record<string, unknown>, path)
      : [path];
  });
}

describe("locale parity", () => {
  const pairs: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["common", enCommon, bgCommon],
    ["auth", enAuth, bgAuth],
    ["errors", enErrors, bgErrors],
    ["navigation", enNavigation, bgNavigation],
  ];

  it.each(pairs)("%s has identical key sets across en and bg", (_ns, en, bg) => {
    expect(flattenKeys(bg).sort()).toEqual(flattenKeys(en).sort());
  });

  it("common namespace contains the required keys", () => {
    const keys = flattenKeys(enCommon);
    for (const required of [
      "loading",
      "cancel",
      "done",
      "delete",
      "edit",
      "rename",
      "or",
      "retry",
      "sourceCode",
    ]) {
      expect(keys).toContain(required);
    }
  });
});

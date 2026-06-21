// Namespace prefixes that never spawn a node (canonical names + common aliases),
// lower-cased for case-insensitive matching. Includes talk variants.
const NON_MAIN_NAMESPACES = new Set<string>([
  "file",
  "image", // File alias
  "special",
  "help",
  "talk",
  "category",
  "category talk",
  "wikipedia",
  "wp", // Wikipedia alias
  "project", // Wikipedia alias
  "portal",
  "template",
  "template talk",
  "user",
  "user talk",
  "media",
  "help talk",
  "portal talk",
  "file talk",
  "image talk",
]);

/** Percent-decode, drop Parsoid './' prefix, '_'->space, strip #fragment, trim. */
export function normalizeTitle(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("./")) {
    value = value.slice(2);
  }
  const hashIndex = value.indexOf("#");
  if (hashIndex !== -1) {
    value = value.slice(0, hashIndex);
  }
  value = value.replace(/_/g, " ");
  try {
    value = decodeURIComponent(value);
  } catch {
    // Leave malformed percent sequences untouched.
  }
  return value.trim();
}

/** True if the title's prefix is a known non-main (File:/Special:/Talk:/… + aliases). */
export function isNonMainNamespace(title: string): boolean {
  const colonIndex = title.indexOf(":");
  if (colonIndex <= 0) {
    return false;
  }
  const prefix = title.slice(0, colonIndex).trim().toLowerCase();
  return NON_MAIN_NAMESPACES.has(prefix);
}

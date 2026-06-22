// src/features/canvas/AddArticleSearch.tsx
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";

import { Icon } from "@/src/components/react-native-reusables/icon";
import { Input } from "@/src/components/react-native-reusables/input";
import { Text } from "@/src/components/react-native-reusables/text";
import { searchTitles } from "@/src/features/wikipedia/client";
import { parseArticleInput } from "@/src/features/wikipedia/links";
import type { SearchResult } from "@/src/features/wikipedia/types";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * True only for an actual pasted URL. `parseArticleInput` also resolves a plain title
 * (so it can never be used to detect a paste — every query would look "pasted" and
 * suppress live search). We gate the direct-open shortcut on URL shape so typed words
 * autosuggest like the New-session search does.
 */
function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("//") || /\.wikipedia\.org\//i.test(value);
}

export interface AddArticleSearchProps {
  /** Current session language (drives both search and pasted-input default). */
  lang: string;
  /** Called with the chosen article; the parent decides spawn-vs-focus. */
  onPick: (choice: { lang: string; title: string }) => void;
}

/**
 * Search-as-you-type box for dropping a new root window into the session.
 * Also accepts a pasted Wikipedia article URL/plain title via parseArticleInput.
 * Does NOT call decideSpawn — the parent checks existing nodes and selects-or-creates.
 */
export function AddArticleSearch({ lang, onPick }: AddArticleSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  // Whether the suggestion dropdown is showing. Opens on input; closes on select, blur
  // (click-outside), or Escape.
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<View>(null);
  useEffect(() => () => clearTimeout(blurTimer.current ?? undefined), []);

  // Web: close on a real click-outside and on Escape. (onBlur/onKeyPress are unreliable
  // here — react-native-web's TextInput doesn't surface Escape, and a canvas click may
  // not blur the input — so listen at the document instead.)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onPointerDown = (event: Event) => {
      const node = containerRef.current as unknown as HTMLElement | null;
      const target = event.target;
      if (node && target instanceof globalThis.Node && !node.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuery("");
        setResults([]);
        setOpen(false);
      }
    };
    // Capture phase for both: react-native-web's TextInput can stop key/pointer events
    // from bubbling to the document, which would otherwise swallow Escape.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const trimmed = query.trim();
  // Only a pasted URL offers the direct-open shortcut; plain text falls through to search.
  const pasted = trimmed && looksLikeUrl(trimmed) ? parseArticleInput(trimmed, lang) : null;

  // Selecting an item opens the node, then clears the box and closes the dropdown.
  const pick = (choice: { lang: string; title: string }) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onPick(choice);
  };

  // Pressing Enter opens exactly what was typed (plain title or URL), matching New-session.
  const submitRaw = () => {
    const parsed = parseArticleInput(query, lang);
    if (parsed) pick({ lang: parsed.lang, title: parsed.title });
  };

  const clearInput = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  // Delay closing on blur so a tap on a suggestion (which blurs the input first) still
  // registers its press before the dropdown unmounts. (Native click-outside path.)
  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    // A pasted URL shortcut suppresses the live search; short queries don't search.
    if (!trimmed || pasted || trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    // Debounce so a network search isn't fired on every keystroke (matches NewSessionSearch).
    const handle = setTimeout(() => {
      searchTitles(lang, trimmed)
        .then((res) => {
          if (!cancelled) setResults(res);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmed, pasted, lang]);

  const showDropdown = open && (pasted != null || results.length > 0);

  return (
    <View ref={containerRef} className="w-full">
      <View className="relative">
        <Input
          testID="add-article-input"
          placeholder="Search Wikipedia or paste a link…"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onSubmitEditing={submitRaw}
          returnKeyType="go"
          autoCapitalize="none"
          autoCorrect={false}
          className={query.length > 0 ? "pr-9" : undefined}
        />
        {query.length > 0 ? (
          <Pressable
            testID="add-article-clear"
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={clearInput}
            className="absolute bottom-0 right-1 top-0 justify-center px-2"
          >
            <Icon name="close" className="size-4 text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
      {showDropdown ? (
        <View className="mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {pasted ? (
            <Pressable
              testID="add-article-direct"
              accessibilityRole="button"
              className="px-3 py-2 active:bg-accent"
              onPress={() => pick({ lang: pasted.lang, title: pasted.title })}
            >
              <Text className="font-medium">{`Open “${pasted.title}”`}</Text>
            </Pressable>
          ) : (
            <ScrollView className="max-h-80" keyboardShouldPersistTaps="handled">
              {results.map((result) => (
                <Pressable
                  key={`${result.lang}:${result.title}`}
                  accessibilityRole="button"
                  className="gap-0.5 border-b border-border px-3 py-2 active:bg-accent"
                  onPress={() => pick({ lang: result.lang, title: result.title })}
                >
                  <Text className="font-medium">{result.title}</Text>
                  {result.description ? (
                    <Text variant="muted" className="text-xs" numberOfLines={1}>
                      {result.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

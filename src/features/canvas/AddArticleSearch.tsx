// src/features/canvas/AddArticleSearch.tsx
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Input } from "@/src/components/react-native-reusables/input";
import { Text } from "@/src/components/react-native-reusables/text";
import { searchTitles } from "@/src/features/wikipedia/client";
import { parseArticleInput } from "@/src/features/wikipedia/links";
import type { SearchResult } from "@/src/features/wikipedia/types";

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

  const trimmed = query.trim();
  const pasted = trimmed ? parseArticleInput(trimmed, lang) : null;

  useEffect(() => {
    // A pasted URL/title shortcut suppresses the live search.
    if (!trimmed || pasted) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void searchTitles(lang, trimmed).then((res) => {
      if (!cancelled) setResults(res);
    });
    return () => {
      cancelled = true;
    };
  }, [trimmed, pasted, lang]);

  return (
    <View className="w-full">
      <Input
        testID="add-article-input"
        placeholder="Search Wikipedia or paste a link…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {pasted ? (
        <Pressable
          testID="add-article-direct"
          accessibilityRole="button"
          className="px-3 py-2"
          onPress={() => onPick({ lang: pasted.lang, title: pasted.title })}
        >
          <Text>{`Open “${pasted.title}”`}</Text>
        </Pressable>
      ) : (
        results.map((result) => (
          <Pressable
            key={`${result.lang}:${result.title}`}
            accessibilityRole="button"
            className="px-3 py-2"
            onPress={() => onPick({ lang: result.lang, title: result.title })}
          >
            <Text>{result.title}</Text>
            {result.description ? (
              <Text className="text-xs text-muted-foreground">{result.description}</Text>
            ) : null}
          </Pressable>
        ))
      )}
    </View>
  );
}

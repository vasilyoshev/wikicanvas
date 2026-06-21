// src/features/sessions/NewSessionSearch.tsx
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

import { Button } from "@/src/components/react-native-reusables/button";
import { Input } from "@/src/components/react-native-reusables/input";
import { Text } from "@/src/components/react-native-reusables/text";
import { searchTitles } from "@/src/features/wikipedia/client";
import { parseArticleInput } from "@/src/features/wikipedia/links";
import type { SearchResult } from "@/src/features/wikipedia/types";

const DEFAULT_LANG = "en";
const DEBOUNCE_MS = 250;

interface NewSessionSearchProps {
  visible: boolean;
  onCancel: () => void;
  onPick: (pick: { lang: string; title: string }) => void;
}

export function NewSessionSearch({ visible, onCancel, onPick }: NewSessionSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      searchTitles(DEFAULT_LANG, q)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const submitRaw = () => {
    const parsed = parseArticleInput(query, DEFAULT_LANG);
    if (parsed) onPick(parsed);
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-start bg-black/50 p-6 pt-24">
        <View className="w-full max-w-md gap-3 rounded-xl bg-card p-4">
          <Text className="font-semibold">Start a new session</Text>
          <Input
            testID="new-session-search-input"
            autoFocus
            placeholder="Search Wikipedia or paste an article URL"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submitRaw}
            returnKeyType="go"
          />
          <ScrollView className="max-h-80">
            {results.map((result, index) => (
              <Pressable
                key={`${result.lang}:${result.title}`}
                testID={`new-session-result-${index}`}
                accessibilityRole="button"
                className="gap-0.5 border-b border-border px-1 py-2"
                onPress={() => onPick({ lang: result.lang, title: result.title })}
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
          <Button testID="new-session-cancel" variant="secondary" onPress={onCancel}>
            <Text>Cancel</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}

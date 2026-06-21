import * as React from "react";
import { View } from "react-native";

import ArticleWindow from "@/src/features/wikipedia/ArticleWindow";
import { getArticle } from "@/src/features/wikipedia/client";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";
import { Text } from "@/src/components/react-native-reusables/text";

export default function ArticlePreviewScreen() {
  const [article, setArticle] = React.useState<ArticleResult | null>(null);
  const [lastMessage, setLastMessage] = React.useState<string>("");

  React.useEffect(() => {
    let active = true;
    getArticle("en", "Physics")
      .then((result) => {
        if (active) setArticle(result);
      })
      .catch(() => {
        if (active) setLastMessage("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const handleMessage = React.useCallback((message: InterceptorMessage, sourceNodeId: string) => {
    if (message.type === "wikilink") {
      setLastMessage(`wikilink:${message.lang}:${message.title}`);
    } else if (message.type === "external") {
      setLastMessage(`external:${message.href}`);
    } else {
      setLastMessage(`fragment:${message.fragment}`);
    }
    void sourceNodeId;
  }, []);

  return (
    <View className="flex-1 bg-background p-4">
      <Text testID="last-message" className="mb-2 text-xs">
        {lastMessage}
      </Text>
      <View style={{ flex: 1, maxWidth: 420 }}>
        {article ? (
          <ArticleWindow article={article} nodeId="preview" fullscreen onMessage={handleMessage} />
        ) : (
          <Text>Loading…</Text>
        )}
      </View>
    </View>
  );
}

import * as React from "react";
import { Linking, Pressable, View } from "react-native";

import ArticleHtml from "@/src/features/wikipedia/ArticleHtml";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";
import { Text } from "@/src/components/react-native-reusables/text";
import { Button } from "@/src/components/react-native-reusables/button";
import { Icon } from "@/src/components/react-native-reusables/icon";

export interface ArticleWindowProps {
  article: ArticleResult;
  nodeId: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onClose?: () => void;
  onMessage: (message: InterceptorMessage, sourceNodeId: string) => void;
}

export default function ArticleWindow({
  article,
  nodeId,
  fullscreen = false,
  onToggleFullscreen,
  onClose,
  onMessage,
}: ArticleWindowProps) {
  const openSource = React.useCallback(() => {
    void Linking.openURL(article.sourceUrl);
  }, [article.sourceUrl]);

  return (
    <View className="flex-1 overflow-hidden rounded-lg border border-border bg-background">
      {/* Header chrome — always visible */}
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        {/* Wikipedia "W" mark — sole attribution in card mode, also present in fullscreen */}
        <Pressable
          testID="article-window-source"
          accessibilityRole="link"
          accessibilityLabel="View on Wikipedia"
          onPress={openSource}
          className="size-6 items-center justify-center rounded bg-muted"
        >
          <Text className="text-xs font-bold">W</Text>
        </Pressable>

        <Text numberOfLines={1} className="flex-1 text-sm font-semibold">
          {article.canonicalTitle}
        </Text>

        {onToggleFullscreen != null ? (
          <Button
            testID="article-window-fullscreen"
            variant="ghost"
            size="icon"
            accessibilityLabel="Toggle fullscreen"
            onPress={onToggleFullscreen}
          >
            <Icon name="fullscreen" />
          </Button>
        ) : null}

        {onClose != null ? (
          <Button
            testID="article-window-close"
            variant="ghost"
            size="icon"
            accessibilityLabel="Close window"
            onPress={onClose}
          >
            <Icon name="close" />
          </Button>
        ) : null}
      </View>

      {/* Article body */}
      <View className="flex-1">
        <ArticleHtml
          html={article.html}
          lang={article.lang}
          nodeId={nodeId}
          title={article.canonicalTitle}
          onMessage={onMessage}
        />
      </View>

      {/* Attribution footer — fullscreen mode only */}
      {fullscreen ? (
        <View
          testID="article-window-attribution"
          className="flex-row border-t border-border px-3 py-2"
        >
          <Text className="text-xs text-muted-foreground">
            {"Content from Wikipedia, licensed " + (article.license || "CC BY-SA 4.0") + " · "}
          </Text>
          <Pressable accessibilityRole="link" onPress={openSource}>
            <Text className="text-xs text-primary">View original</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

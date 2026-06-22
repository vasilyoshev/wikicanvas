import * as React from "react";
import { memo } from "react";
import { Linking, Pressable, View } from "react-native";

import ArticleHtml from "@/src/features/wikipedia/ArticleHtml";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";
import { Text } from "@/src/components/react-native-reusables/text";
import { Button } from "@/src/components/react-native-reusables/button";
import { Icon } from "@/src/components/react-native-reusables/icon";
import { useResolvedColorScheme } from "@/src/lib/color-scheme";

export interface ArticleWindowProps {
  article: ArticleResult;
  nodeId: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onClose?: () => void;
  /** Saved scroll offset (px) restored when the article mounts. */
  initialScrollY?: number;
  /** Reports the article's scroll position so the host can persist it. */
  onScroll?: (scrollY: number) => void;
  onMessage: (message: InterceptorMessage, sourceNodeId: string) => void;
}

function ArticleWindowImpl({
  article,
  nodeId,
  fullscreen = false,
  onToggleFullscreen,
  onClose,
  initialScrollY,
  onScroll,
  onMessage,
}: ArticleWindowProps) {
  const theme = useResolvedColorScheme();
  const openSource = React.useCallback(() => {
    void Linking.openURL(article.sourceUrl);
  }, [article.sourceUrl]);

  return (
    <View
      className={`flex-1 bg-background ${
        fullscreen ? "" : "overflow-hidden rounded-lg border border-border"
      }`}
    >
      {/* Header chrome — always visible */}
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        {/* Wikipedia "W" mark — the per-article link to the source, in both modes. */}
        <Pressable
          testID={`article-window-source-${nodeId}`}
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
          // Windowed toggle: expand to fullscreen / restore back to the card. This only
          // ever changes the window's size — it never closes the node.
          <Button
            testID={`article-window-fullscreen-${nodeId}`}
            variant="ghost"
            size="icon"
            accessibilityLabel={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onPress={onToggleFullscreen}
          >
            <Icon name={fullscreen ? "fullscreen-exit" : "fullscreen"} />
          </Button>
        ) : null}

        {onClose != null ? (
          // ✕ removes the whole node from the canvas (distinct from the fullscreen toggle).
          <Button
            testID={`article-window-close-${nodeId}`}
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
          theme={theme}
          initialScrollY={initialScrollY}
          onScroll={onScroll}
          onMessage={onMessage}
        />
      </View>
    </View>
  );
}

export default memo(ArticleWindowImpl);

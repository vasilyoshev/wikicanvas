import * as React from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { buildSrcDoc } from "@/src/features/wikipedia/sandbox-html";
import {
  parseInterceptorMessage,
  type InterceptorMessage,
} from "@/src/features/wikipedia/messages";

export interface ArticleHtmlProps {
  html: string;
  lang: string;
  nodeId: string;
  title?: string;
  onMessage: (message: InterceptorMessage, sourceNodeId: string) => void;
}

// Web-only frame-source guard; on native the single WebView is the only sender.
export function shouldAcceptMessage(): boolean {
  return true;
}

export default function ArticleHtml({ html, lang, nodeId, onMessage }: ArticleHtmlProps) {
  const srcDoc = React.useMemo(() => buildSrcDoc(html, lang), [html, lang]);

  const handleMessage = React.useCallback(
    (event: WebViewMessageEvent) => {
      const parsed = parseInterceptorMessage(event.nativeEvent.data);
      if (parsed) {
        onMessage(parsed, nodeId);
      }
    },
    [nodeId, onMessage],
  );

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: srcDoc }}
      onMessage={handleMessage}
      style={{ flex: 1, backgroundColor: "transparent" }}
    />
  );
}

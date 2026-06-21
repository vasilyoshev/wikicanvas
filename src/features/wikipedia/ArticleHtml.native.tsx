import * as React from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

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

/**
 * Navigation guard for the native WebView.
 *
 * The WebView renders a self-contained srcdoc (source={{ html }}). All real link
 * navigations are intercepted by the injected script and delivered via postMessage —
 * the WebView itself should never navigate away from the initial document load.
 *
 * We allow only the initial "about:blank" and "about:srcdoc" loads; every other
 * navigation request is blocked so live Wikipedia never loads inside the app frame.
 */
export function shouldStartLoad(request: ShouldStartLoadRequest): boolean {
  const { url, isTopFrame, mainDocumentURL } = request;
  // Allow the initial srcdoc/blank load (top-frame, no main document URL yet).
  if (isTopFrame && (url === "about:blank" || url === "about:srcdoc" || mainDocumentURL == null)) {
    return true;
  }
  // Block everything else — real navigations go through postMessage instead.
  return false;
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
      // Restrict to about: scheme only — the srcdoc is delivered via source={{ html }},
      // not a URL load, so "about:*" is sufficient for the initial document.
      originWhitelist={["about:*"]}
      source={{ html: srcDoc }}
      onMessage={handleMessage}
      onShouldStartLoadWithRequest={shouldStartLoad}
      style={{ flex: 1, backgroundColor: "transparent" }}
    />
  );
}

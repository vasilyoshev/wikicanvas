import * as React from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

import { buildSrcDoc } from "@/src/features/wikipedia/sandbox-html";
import {
  parseInterceptorMessage,
  parseScrollMessage,
  type InterceptorMessage,
} from "@/src/features/wikipedia/messages";

export interface ArticleHtmlProps {
  html: string;
  lang: string;
  nodeId: string;
  title?: string;
  /** Light/dark theme the article renders in (follows the app theme). */
  theme?: "light" | "dark";
  /** Scroll offset (px) restored when the frame first mounts. */
  initialScrollY?: number;
  /** Reports the frame's scroll position so the host can persist it. */
  onScroll?: (scrollY: number) => void;
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
  // Allow ONLY the initial about: document (about:blank / about:srcdoc). Every other
  // navigation — including real https:// URLs — is blocked; in-article links are
  // delivered to the host via postMessage, never by navigating the WebView.
  //
  // Gate strictly on the URL scheme. We deliberately do NOT consult `mainDocumentURL`
  // (iOS-only; always null on Android) or `isTopFrame` to permit a load: doing so let
  // any top-frame URL through on Android, turning the reader into an open in-app
  // browser pointed at attacker-controlled article script.
  return request.url.startsWith("about:");
}

export default function ArticleHtml({
  html,
  lang,
  nodeId,
  theme = "light",
  initialScrollY = 0,
  onScroll,
  onMessage,
}: ArticleHtmlProps) {
  const scrollRef = React.useRef(initialScrollY);
  const srcDoc = React.useMemo(
    () => buildSrcDoc(html, lang, { theme, initialScrollY: scrollRef.current }),
    [html, lang, theme],
  );

  const handleMessage = React.useCallback(
    (event: WebViewMessageEvent) => {
      const scrollY = parseScrollMessage(event.nativeEvent.data);
      if (scrollY != null) {
        scrollRef.current = scrollY;
        onScroll?.(scrollY);
        return;
      }
      const parsed = parseInterceptorMessage(event.nativeEvent.data);
      if (parsed) {
        onMessage(parsed, nodeId);
      }
    },
    [nodeId, onMessage, onScroll],
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

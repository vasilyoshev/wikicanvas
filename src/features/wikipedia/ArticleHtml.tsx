import * as React from "react";
import { memo } from "react";

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

/** True only when the postMessage came from THIS node's sandboxed iframe. */
export function shouldAcceptMessage(
  source: MessageEventSource | null,
  iframe: HTMLIFrameElement | null,
): boolean {
  return iframe !== null && source === iframe.contentWindow;
}

function ArticleHtmlImpl({
  html,
  lang,
  nodeId,
  title,
  theme = "light",
  initialScrollY = 0,
  onScroll,
  onMessage,
}: ArticleHtmlProps) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  // Latest known scroll, used to restore position when the frame rebuilds (e.g. on a
  // theme toggle) — kept in a ref so scrolling never triggers a srcdoc rebuild.
  const scrollRef = React.useRef(initialScrollY);
  const srcDoc = React.useMemo(
    () => buildSrcDoc(html, lang, { theme, initialScrollY: scrollRef.current }),
    [html, lang, theme],
  );

  React.useEffect(() => {
    function handle(event: MessageEvent) {
      if (!shouldAcceptMessage(event.source, iframeRef.current)) {
        return;
      }
      const scrollY = parseScrollMessage(event.data);
      if (scrollY != null) {
        scrollRef.current = scrollY;
        onScroll?.(scrollY);
        return;
      }
      const parsed = parseInterceptorMessage(event.data);
      if (parsed) {
        onMessage(parsed, nodeId);
      }
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [nodeId, onMessage, onScroll]);

  return (
    <iframe
      ref={iframeRef}
      data-testid={`article-frame-${nodeId}`}
      title={title ?? "Wikipedia article"}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}

export default memo(ArticleHtmlImpl);

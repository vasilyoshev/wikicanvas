import * as React from "react";

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

/** True only when the postMessage came from THIS node's sandboxed iframe. */
export function shouldAcceptMessage(
  source: MessageEventSource | null,
  iframe: HTMLIFrameElement | null,
): boolean {
  return iframe !== null && source === iframe.contentWindow;
}

export default function ArticleHtml({ html, lang, nodeId, title, onMessage }: ArticleHtmlProps) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const srcDoc = React.useMemo(() => buildSrcDoc(html, lang), [html, lang]);

  React.useEffect(() => {
    function handle(event: MessageEvent) {
      if (!shouldAcceptMessage(event.source, iframeRef.current)) {
        return;
      }
      const parsed = parseInterceptorMessage(event.data);
      if (parsed) {
        onMessage(parsed, nodeId);
      }
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [nodeId, onMessage]);

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

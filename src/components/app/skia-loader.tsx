import type { PropsWithChildren } from "react";

/**
 * Native: Skia is backed by a JSI binding that is ready synchronously, so there is
 * nothing to load — render children immediately. (Web loads CanvasKit/WASM first;
 * see skia-loader.web.tsx.)
 */
export function SkiaLoader({ children }: PropsWithChildren) {
  return <>{children}</>;
}

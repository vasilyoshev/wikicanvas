import { useEffect, useState, type PropsWithChildren } from "react";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

import { LoadingState } from "@/src/components/app/screen-state";

/**
 * Web: react-native-skia's `<Canvas>` requires the CanvasKit WASM runtime to be
 * loaded onto `global.CanvasKit` BEFORE any Skia component renders. Without this,
 * every Skia draw throws "CanvasKit is not defined" — which silently breaks the
 * canvas edges and the session thumbnails (both Skia-drawn) on web.
 *
 * We load it once at app start (the .wasm is bundled to /canvaskit.wasm by the
 * `setup:skia-web` script) and gate the app behind a short loading state. If the
 * load fails (or stalls), we render anyway so the app degrades instead of hanging.
 */
export function SkiaLoader({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setReady(true);
      }
    };
    LoadSkiaWeb({ locateFile: (file: string) => `/${file}` })
      .then(finish)
      .catch((error) => {
        console.error("[skia] CanvasKit failed to load; canvas/thumbnails will not render", error);
        finish();
      });
    // Safety net: never block the whole app indefinitely on the WASM load.
    const timer = setTimeout(finish, 8000);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, []);

  if (!ready) {
    return <LoadingState label="Loading canvas…" />;
  }
  return <>{children}</>;
}

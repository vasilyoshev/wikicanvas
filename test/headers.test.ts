import { readFileSync } from "fs";
import { join } from "path";

// Pins the non-obvious header rules that are easy to "tidy" away but break the
// app when removed. See docs/superpowers/specs/2026-06-23-production-go-live-design.md §2.
const headers = readFileSync(join(process.cwd(), "public", "_headers"), "utf8");

describe("public/_headers", () => {
  it("preserves the wasm Content-Type rule (CanvasKit needs application/wasm)", () => {
    expect(headers).toMatch(/\/canvaskit\.wasm/);
    expect(headers).toMatch(/Content-Type:\s*application\/wasm/);
  });

  it("ships the CSP as report-only first", () => {
    expect(headers).toMatch(/Content-Security-Policy-Report-Only:/);
  });

  it("keeps the script-src tokens the app actually needs", () => {
    // Metro's web async-chunk loader runs eval(); the srcdoc article iframe
    // inherits this CSP and injects inline scripts. All three tokens are required.
    expect(headers).toMatch(/'unsafe-eval'/);
    expect(headers).toMatch(/'unsafe-inline'/);
    expect(headers).toMatch(/'wasm-unsafe-eval'/);
  });

  it("allows the Supabase websocket origin in connect-src", () => {
    expect(headers).toMatch(/connect-src[^;]*wss:\/\/lhxixheyjoxujewybhgw\.supabase\.co/);
  });

  it("allows the realtime worker and blocks framing", () => {
    expect(headers).toMatch(/worker-src[^;]*blob:/);
    expect(headers).toMatch(/frame-ancestors 'none'/);
  });
});

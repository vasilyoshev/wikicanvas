import {
  parseInterceptorMessage,
  parseScrollMessage,
  isInterceptorMessage,
  isSafeExternalHref,
  type InterceptorMessage,
} from "./messages";

describe("parseScrollMessage", () => {
  it("returns scrollY for a valid scroll message (object or JSON string)", () => {
    expect(parseScrollMessage({ type: "scroll", scrollY: 240 })).toBe(240);
    expect(parseScrollMessage('{"type":"scroll","scrollY":12}')).toBe(12);
    expect(parseScrollMessage({ type: "scroll", scrollY: 0 })).toBe(0);
  });
  it("returns null for non-scroll, malformed, or non-finite payloads", () => {
    expect(parseScrollMessage({ type: "wikilink", title: "X" })).toBeNull();
    expect(parseScrollMessage({ type: "scroll", scrollY: "x" })).toBeNull();
    expect(parseScrollMessage({ type: "scroll", scrollY: Infinity })).toBeNull();
    expect(parseScrollMessage("not json")).toBeNull();
  });
  it("is not confused with the interceptor (spawn) message union", () => {
    // A scroll payload must never resolve to a spawn message.
    expect(parseInterceptorMessage({ type: "scroll", scrollY: 5 })).toBeNull();
  });
});

describe("isSafeExternalHref", () => {
  it("allows only http/https/mailto (rejects script/data/file/custom schemes)", () => {
    expect(isSafeExternalHref("https://x.com")).toBe(true);
    expect(isSafeExternalHref("http://x.com")).toBe(true);
    expect(isSafeExternalHref("mailto:a@b.com")).toBe(true);
    expect(isSafeExternalHref("  https://x.com  ")).toBe(true);
    expect(isSafeExternalHref("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalHref("data:text/html,x")).toBe(false);
    expect(isSafeExternalHref("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalHref("wikicanvas://deep")).toBe(false);
  });
});

describe("isInterceptorMessage", () => {
  it("accepts a valid wikilink object", () => {
    const msg: InterceptorMessage = {
      type: "wikilink",
      lang: "en",
      title: "Physics",
      text: "physics",
    };
    expect(isInterceptorMessage(msg)).toBe(true);
  });
  it("accepts external + fragment objects", () => {
    expect(isInterceptorMessage({ type: "external", href: "https://x.com" })).toBe(true);
    expect(isInterceptorMessage({ type: "fragment", fragment: "History" })).toBe(true);
  });
  it("rejects external links with disallowed schemes", () => {
    expect(isInterceptorMessage({ type: "external", href: "javascript:alert(1)" })).toBe(false);
    expect(isInterceptorMessage({ type: "external", href: "data:text/html,x" })).toBe(false);
  });
  it("rejects unknown types and malformed shapes", () => {
    expect(isInterceptorMessage({ type: "wikilink", lang: "en" })).toBe(false); // missing title/text
    expect(isInterceptorMessage({ type: "nope" })).toBe(false);
    expect(isInterceptorMessage({ type: "external" })).toBe(false);
    expect(isInterceptorMessage(null)).toBe(false);
    expect(isInterceptorMessage("string")).toBe(false);
    expect(isInterceptorMessage(42)).toBe(false);
  });
});

describe("parseInterceptorMessage", () => {
  it("parses an object payload", () => {
    expect(parseInterceptorMessage({ type: "external", href: "https://x.com" })).toEqual({
      type: "external",
      href: "https://x.com",
    });
  });
  it("parses a JSON string payload (native WebView postMessage)", () => {
    const raw = JSON.stringify({ type: "wikilink", lang: "en", title: "Physics", text: "p" });
    expect(parseInterceptorMessage(raw)).toEqual({
      type: "wikilink",
      lang: "en",
      title: "Physics",
      text: "p",
    });
  });
  it("returns null for non-WikiCanvas JSON strings", () => {
    expect(parseInterceptorMessage(JSON.stringify({ source: "react-devtools" }))).toBeNull();
  });
  it("returns null for non-JSON strings", () => {
    expect(parseInterceptorMessage("not json")).toBeNull();
  });
  it("returns null for null / numbers / arrays", () => {
    expect(parseInterceptorMessage(null)).toBeNull();
    expect(parseInterceptorMessage(7)).toBeNull();
    expect(parseInterceptorMessage([1, 2])).toBeNull();
  });
  it("strips extra unknown properties to the known shape", () => {
    const parsed = parseInterceptorMessage({
      type: "fragment",
      fragment: "Top",
      evil: "x",
    });
    expect(parsed).toEqual({ type: "fragment", fragment: "Top" });
  });
});

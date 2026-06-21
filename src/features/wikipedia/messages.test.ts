import { parseInterceptorMessage, isInterceptorMessage, type InterceptorMessage } from "./messages";

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

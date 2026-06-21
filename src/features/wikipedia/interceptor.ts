/**
 * Returns the interceptor JS source injected into the iframe srcdoc and the WebView.
 * It captures a[href] clicks, preventDefault, classifies inline (mirroring links.ts),
 * and posts an InterceptorMessage: web -> parent.postMessage(msg, "*"); native ->
 * window.ReactNativeWebView.postMessage(JSON.stringify(msg)). Exposes __wcClassify for tests.
 */
export function buildInterceptorScript(lang: string): string {
  const langLiteral = JSON.stringify(lang);
  return `
(function () {
  var PAGE_LANG = ${langLiteral};
  var WIKI_PATH = "/wiki/";
  var NON_MAIN = {
    file: 1, image: 1, special: 1, help: 1, talk: 1, category: 1,
    "category talk": 1, wikipedia: 1, wp: 1, project: 1, portal: 1,
    template: 1, "template talk": 1, user: 1, "user talk": 1, media: 1,
    "help talk": 1, "portal talk": 1, "file talk": 1, "image talk": 1
  };
  function normalizeTitle(raw) {
    var v = ("" + raw).trim();
    if (v.indexOf("./") === 0) v = v.slice(2);
    // Strip a single leading ":" (the [[:NS:X]] wikitext form).
    if (v.charAt(0) === ":") v = v.slice(1);
    // Strip query string before percent-decoding (must come before #fragment strip).
    var q = v.indexOf("?");
    if (q !== -1) v = v.slice(0, q);
    var h = v.indexOf("#");
    if (h !== -1) v = v.slice(0, h);
    v = v.replace(/_/g, " ");
    try { v = decodeURIComponent(v); } catch (e) {}
    return v.trim();
  }
  function isNonMain(title) {
    var c = title.indexOf(":");
    if (c <= 0) return false;
    return !!NON_MAIN[title.slice(0, c).trim().toLowerCase()];
  }
  function langFromHost(host) {
    var m = /^([a-z-]{2,12})\\.wikipedia\\.org$/.exec(host);
    return m ? m[1] : null;
  }
  function __wcClassify(href, pageLang) {
    var raw = ("" + href).trim();
    if (raw === "") return { type: "external", href: raw };
    if (raw.charAt(0) === "#") return { type: "fragment", fragment: raw.slice(1) };
    if (raw.indexOf(WIKI_PATH) === 0 || raw.indexOf("./") === 0) {
      var part = raw.indexOf(WIKI_PATH) === 0 ? raw.slice(WIKI_PATH.length) : raw;
      var t = normalizeTitle(part);
      if (t !== "" && !isNonMain(t)) return { type: "wikilink", lang: pageLang, title: t };
      return { type: "external", href: raw };
    }
    var url;
    try { url = new URL(raw, "https://" + pageLang + ".wikipedia.org/"); }
    catch (e) { return { type: "external", href: raw }; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return { type: "external", href: raw };
    var linkLang = langFromHost(url.host);
    if (linkLang === pageLang && url.pathname.indexOf(WIKI_PATH) === 0) {
      var t2 = normalizeTitle(url.pathname.slice(WIKI_PATH.length));
      if (t2 !== "" && !isNonMain(t2)) return { type: "wikilink", lang: pageLang, title: t2 };
    }
    return { type: "external", href: raw };
  }
  if (typeof window !== "undefined") { window.__wcClassify = __wcClassify; }
  function post(msg) {
    var json = JSON.stringify(msg);
    if (typeof window !== "undefined" && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(json);
    } else if (typeof parent !== "undefined") {
      parent.postMessage(msg, "*");
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", function (event) {
      var el = event.target;
      while (el && el.tagName !== "A") el = el.parentElement;
      if (!el) return;
      var href = el.getAttribute("href");
      if (href == null) return;
      event.preventDefault();
      var msg = __wcClassify(href, PAGE_LANG);
      if (msg.type === "wikilink") {
        msg.text = (el.textContent || "").trim();
      }
      post(msg);
    }, true);
  }
})();
__wcClassify;
`;
}

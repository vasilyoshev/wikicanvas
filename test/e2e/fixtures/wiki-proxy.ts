export const MOCK_ARTICLE_WITH_HTML = {
  title: "Physics",
  key: "Physics",
  license: {
    title: "Creative Commons Attribution-ShareAlike 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  html: `<section><p id="lede">Physics is the natural science of matter.</p>
    <p>See also <a href="/wiki/Energy">Energy</a> and
    <a href="https://example.com/out">an external site</a>.</p></section>`,
};

export const MOCK_SEARCH = {
  pages: [
    { id: 1, key: "Physics", title: "Physics", description: "natural science", thumbnail: null },
  ],
};

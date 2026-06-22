import { fireEvent, render, screen } from "@testing-library/react-native";
import * as React from "react";

import ArticleWindow from "./ArticleWindow";
import type { ArticleResult } from "@/src/features/wikipedia/types";

jest.mock("./ArticleHtml", () => ({
  __esModule: true,
  default: () => null,
}));

const ARTICLE: ArticleResult = {
  lang: "en",
  requestedTitle: "Physics",
  canonicalTitle: "Physics",
  html: "<p>x</p>",
  license: "CC BY-SA 4.0",
  sourceUrl: "https://en.wikipedia.org/wiki/Physics",
  fetchedAt: 1,
  etag: null,
  fromCache: false,
};

describe("ArticleWindow chrome", () => {
  it("shows the canonical title in the header", () => {
    render(<ArticleWindow article={ARTICLE} nodeId="n1" onMessage={jest.fn()} />);
    expect(screen.getByText("Physics")).toBeTruthy();
  });

  it("fires onToggleFullscreen and onClose from header controls", () => {
    const onToggle = jest.fn();
    const onClose = jest.fn();
    render(
      <ArticleWindow
        article={ARTICLE}
        nodeId="n1"
        onToggleFullscreen={onToggle}
        onClose={onClose}
        onMessage={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId("article-window-fullscreen-n1"));
    fireEvent.press(screen.getByTestId("article-window-close-n1"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("never renders a per-window license footer (attribution lives in the viewport corner)", () => {
    const { rerender } = render(
      <ArticleWindow article={ARTICLE} nodeId="n1" onMessage={jest.fn()} />,
    );
    expect(screen.queryByTestId("article-window-attribution-n1")).toBeNull();

    rerender(<ArticleWindow article={ARTICLE} nodeId="n1" fullscreen onMessage={jest.fn()} />);
    expect(screen.queryByTestId("article-window-attribution-n1")).toBeNull();
  });

  it("toggles fullscreen from the same control in both modes (the fullscreen close affordance)", () => {
    const onToggle = jest.fn();
    const { rerender } = render(
      <ArticleWindow
        article={ARTICLE}
        nodeId="n1"
        onToggleFullscreen={onToggle}
        onMessage={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId("article-window-fullscreen-n1"));

    rerender(
      <ArticleWindow
        article={ARTICLE}
        nodeId="n1"
        fullscreen
        onToggleFullscreen={onToggle}
        onMessage={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId("article-window-fullscreen-n1"));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("always renders the tappable Wikipedia source mark", () => {
    render(<ArticleWindow article={ARTICLE} nodeId="n1" onMessage={jest.fn()} />);
    expect(screen.getByTestId("article-window-source-n1")).toBeTruthy();
  });
});

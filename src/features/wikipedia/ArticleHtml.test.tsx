import { render } from "@testing-library/react-native";
import * as React from "react";

import ArticleHtml, { shouldAcceptMessage } from "./ArticleHtml";

describe("shouldAcceptMessage (web frame-source guard)", () => {
  it("accepts a message whose source is the node's iframe contentWindow", () => {
    const win = {} as Window;
    expect(shouldAcceptMessage(win, { contentWindow: win } as HTMLIFrameElement)).toBe(true);
  });
  it("rejects a message from any other window", () => {
    expect(
      shouldAcceptMessage({} as Window, { contentWindow: {} as Window } as HTMLIFrameElement),
    ).toBe(false);
  });
  it("rejects when the iframe ref is null", () => {
    expect(shouldAcceptMessage({} as Window, null)).toBe(false);
  });
});

describe("ArticleHtml (web) render", () => {
  beforeEach(() => {
    // The React Native test environment does not wire up window.addEventListener;
    // stub it so the useEffect in the web component can register/remove its handler.
    if (typeof window !== "undefined" && typeof window.addEventListener !== "function") {
      Object.assign(window, {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      });
    }
  });

  it("renders without crashing given the required props", () => {
    const tree = render(
      <ArticleHtml html="<p>x</p>" lang="en" nodeId="n1" title="Physics" onMessage={jest.fn()} />,
    );
    expect(tree).toBeTruthy();
  });
});

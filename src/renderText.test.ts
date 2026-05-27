import { describe, it, expect } from "vitest";
import {
  renderOpener,
  truncatePath,
  pluralize,
  renderConfigSummary,
  renderText,
} from "./renderText.js";
import type { FoundMap, GraphData, Node, Summary } from "./types.js";

function makeNode(over: Partial<Node>): Node {
  return {
    path: "src/x.ts",
    kind: "helper",
    name: "A helper",
    does: "Does stuff.",
    confidence: 0.75,
    confidenceSource: "convention",
    userFacing: false,
    ...over,
  };
}

function makeSummary(over: Partial<Summary>): Summary {
  return {
    screens: 0,
    endpoints: 0,
    components: 0,
    helpers: 0,
    configFiles: 0,
    tests: 0,
    unknown: 0,
    ...over,
  };
}

function makeMap(nodes: Node[], over: Partial<Summary> = {}): FoundMap {
  const summary = makeSummary({
    screens: nodes.filter((n) => n.kind === "screen").length,
    endpoints: nodes.filter((n) => n.kind === "endpoint").length,
    components: nodes.filter((n) => n.kind === "component").length,
    helpers: nodes.filter((n) => n.kind === "helper").length,
    tests: nodes.filter((n) => n.kind === "test").length,
    unknown: nodes.filter((n) => n.kind === "unknown").length,
    ...over,
  });
  return {
    version: "0.1",
    generatedAt: "2026-05-27T12:00:00Z",
    summary,
    nodes,
    edges: [],
  };
}

function makeGraph(): GraphData {
  return { edges: [], fanIn: new Map(), fanOut: new Map(), parserUsed: "dependency-cruiser" };
}

describe("pluralize", () => {
  it("uses singular at 1", () => {
    expect(pluralize(1, "screen", "screens")).toBe("1 screen");
  });
  it("uses plural at 0 and 2+", () => {
    expect(pluralize(0, "screen", "screens")).toBe("0 screens");
    expect(pluralize(2, "screen", "screens")).toBe("2 screens");
  });
});

describe("renderOpener", () => {
  it("uses 'Your app is N screens and M helpers' for typical apps", () => {
    const opener = renderOpener(makeSummary({ screens: 4, helpers: 2 }));
    expect(opener).toContain("4 screens");
    expect(opener).toContain("2 helpers");
    expect(opener).toContain("That's all of it");
  });

  it("uses singular at 1", () => {
    const opener = renderOpener(makeSummary({ screens: 1, helpers: 1 }));
    expect(opener).toContain("1 screen");
    expect(opener).toContain("1 helper");
  });

  it("omits zero-count categories", () => {
    const opener = renderOpener(makeSummary({ screens: 3, helpers: 0 }));
    expect(opener).toContain("3 screens");
    expect(opener).not.toContain("0 helpers");
    expect(opener).not.toContain("helpers");
  });

  it("uses special phrasing for 0 screens", () => {
    const opener = renderOpener(makeSummary({ screens: 0, helpers: 3 }));
    expect(opener).toContain("didn't see any screens");
    expect(opener).toContain("3 helpers");
  });

  it("handles totally empty repos honestly", () => {
    const opener = renderOpener(makeSummary({}));
    expect(opener).toContain("didn't see any screens, helpers, or endpoints");
  });

  it("composes commas correctly for 3+ categories", () => {
    const opener = renderOpener(
      makeSummary({ screens: 2, endpoints: 1, components: 3, helpers: 4 }),
    );
    expect(opener).toContain("2 screens");
    expect(opener).toContain("1 endpoint");
    expect(opener).toContain("3 components");
    expect(opener).toContain("4 helpers");
    expect(opener).toContain("and 4 helpers");
  });
});

describe("truncatePath", () => {
  it("leaves short paths alone", () => {
    expect(truncatePath("src/x.ts", 80)).toBe("src/x.ts");
  });

  it("truncates with leading ellipsis", () => {
    const long = "src/very/deep/folder/structure/with/a/long/file.tsx";
    const result = truncatePath(long, 30);
    expect(result.startsWith("...")).toBe(true);
    expect(result.length).toBe(30);
    expect(result.endsWith("file.tsx")).toBe(true);
  });
});

describe("renderConfigSummary", () => {
  it("omits line when count is 0", () => {
    expect(renderConfigSummary(0)).toBe("");
  });
  it("uses singular at 1", () => {
    expect(renderConfigSummary(1)).toContain("1 settings file");
    expect(renderConfigSummary(1)).not.toContain("files");
  });
  it("uses plural at 2+", () => {
    expect(renderConfigSummary(6)).toContain("6 settings files");
  });
});

describe("renderText", () => {
  it("renders a basic app with screens and helpers", () => {
    const map = makeMap([
      makeNode({ path: "app/page.tsx", kind: "screen", name: "The home screen", does: "Where people land.", userFacing: true }),
      makeNode({ path: "src/lib/db.ts", kind: "helper", name: "A shared helper", does: "Used by all screens." }),
    ]);
    const out = renderText(map, { showAll: false, terminalWidth: 100, parserUsed: "dependency-cruiser" }, makeGraph());
    expect(out).toContain("Your app is 1 screen and 1 helper");
    expect(out).toContain("SCREENS PEOPLE SEE");
    expect(out).toContain("BEHIND THE SCENES");
  });

  it("caps lists at 20 unless --all", () => {
    const screens: Node[] = [];
    for (let i = 0; i < 30; i++) {
      screens.push(
        makeNode({ path: `app/p${i}/page.tsx`, kind: "screen", userFacing: true, name: `Screen ${i}`, does: "..." }),
      );
    }
    const map = makeMap(screens);
    const truncated = renderText(map, { showAll: false, terminalWidth: 100, parserUsed: "dependency-cruiser" }, makeGraph());
    expect(truncated).toContain("...and 10 more");
    const all = renderText(map, { showAll: true, terminalWidth: 100, parserUsed: "dependency-cruiser" }, makeGraph());
    expect(all).not.toContain("...and 10 more");
  });

  it("includes a banner when the babel fallback was used", () => {
    const map = makeMap([
      makeNode({ path: "app/page.tsx", kind: "screen", userFacing: true, name: "The home screen", does: "..." }),
    ]);
    const out = renderText(map, { showAll: false, terminalWidth: 100, parserUsed: "babel-fallback" }, makeGraph());
    expect(out).toContain("simpler parser");
  });
});

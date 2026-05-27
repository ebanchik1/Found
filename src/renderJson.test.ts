import { describe, it, expect } from "vitest";
import { buildFoundMap, renderJson } from "./renderJson.js";
import { FoundMapSchema, type DescribedNode } from "./types.js";

function node(over: Partial<DescribedNode> = {}): DescribedNode {
  return {
    path: "app/page.tsx",
    kind: "screen",
    name: "The home screen",
    does: "Where people land.",
    confidence: 0.9,
    confidenceSource: "convention+graph",
    userFacing: true,
    ...over,
  };
}

describe("buildFoundMap", () => {
  it("counts each kind into the summary", () => {
    const map = buildFoundMap(
      {
        nodes: [
          node({ kind: "screen", path: "app/page.tsx" }),
          node({ kind: "screen", path: "app/login/page.tsx" }),
          node({ kind: "helper", path: "src/lib/db.ts", userFacing: false }),
        ],
        edges: [],
      },
      5,
    );
    expect(map.summary.screens).toBe(2);
    expect(map.summary.helpers).toBe(1);
    expect(map.summary.configFiles).toBe(5);
  });

  it("includes a valid ISO timestamp", () => {
    const map = buildFoundMap({ nodes: [node()], edges: [] }, 0);
    expect(map.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("locks version to '0.1'", () => {
    const map = buildFoundMap({ nodes: [node()], edges: [] }, 0);
    expect(map.version).toBe("0.1");
  });

  it("round-trips through Zod validation", () => {
    const map = buildFoundMap({ nodes: [node()], edges: [] }, 0);
    expect(() => FoundMapSchema.parse(map)).not.toThrow();
  });
});

describe("renderJson", () => {
  it("emits pretty JSON by default", () => {
    const map = buildFoundMap({ nodes: [node()], edges: [] }, 0);
    const json = renderJson(map);
    expect(json).toContain("\n");
    expect(json).toContain('"version": "0.1"');
  });

  it("emits compact JSON when pretty=false", () => {
    const map = buildFoundMap({ nodes: [node()], edges: [] }, 0);
    const json = renderJson(map, false);
    expect(json).not.toContain("\n");
  });

  it("parses back to an equivalent object", () => {
    const map = buildFoundMap({ nodes: [node()], edges: [] }, 0);
    const json = renderJson(map);
    const parsed = JSON.parse(json);
    expect(() => FoundMapSchema.parse(parsed)).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { ConventionDescriber } from "./describer.js";
import type { GraphData, RouteInfo, ScannedNode } from "./types.js";

function makeGraph(opts: Partial<GraphData> = {}): GraphData {
  return {
    edges: opts.edges ?? [],
    fanIn: opts.fanIn ?? new Map(),
    fanOut: opts.fanOut ?? new Map(),
    parserUsed: opts.parserUsed ?? "dependency-cruiser",
  };
}

describe("ConventionDescriber", () => {
  const describer = new ConventionDescriber();

  it("labels root screen as 'The home screen'", async () => {
    const nodes: ScannedNode[] = [
      { path: "app/page.tsx", kind: "screen", userFacing: true },
    ];
    const routes: RouteInfo[] = [
      { path: "app/page.tsx", routePath: "/", framework: "next-app" },
    ];
    const out = await describer.describe(nodes, makeGraph(), routes);
    expect(out[0]?.name).toBe("The home screen");
  });

  it("labels static screens with their route segment", async () => {
    const nodes: ScannedNode[] = [
      { path: "app/login/page.tsx", kind: "screen", userFacing: true },
    ];
    const routes: RouteInfo[] = [
      { path: "app/login/page.tsx", routePath: "/login", framework: "next-app" },
    ];
    const out = await describer.describe(nodes, makeGraph(), routes);
    expect(out[0]?.name).toBe("The login screen");
    expect(out[0]?.does).toContain("sign in");
  });

  it("labels dynamic screens with singular parent + details suffix", async () => {
    const nodes: ScannedNode[] = [
      { path: "app/users/[id]/page.tsx", kind: "screen", userFacing: true },
    ];
    const routes: RouteInfo[] = [
      {
        path: "app/users/[id]/page.tsx",
        routePath: "/users/[id]",
        framework: "next-app",
      },
    ];
    const out = await describer.describe(nodes, makeGraph(), routes);
    expect(out[0]?.name).toBe("The user details screen");
  });

  it("labels endpoints as API endpoints", async () => {
    const nodes: ScannedNode[] = [
      { path: "app/api/users/route.ts", kind: "endpoint", userFacing: false },
    ];
    const out = await describer.describe(nodes, makeGraph(), []);
    expect(out[0]?.name).toContain("API endpoint");
    expect(out[0]?.name).toContain("/users");
  });

  it("labels helpers with fan-in count when ≥1", async () => {
    const nodes: ScannedNode[] = [
      { path: "src/lib/db.ts", kind: "helper", userFacing: false },
    ];
    const out = await describer.describe(
      nodes,
      makeGraph({ fanIn: new Map([["src/lib/db.ts", 3]]) }),
      [],
    );
    expect(out[0]?.does).toContain("3 other files");
  });

  it("labels unused helpers honestly", async () => {
    const nodes: ScannedNode[] = [
      { path: "src/lib/orphan.ts", kind: "helper", userFacing: false },
    ];
    const out = await describer.describe(nodes, makeGraph(), []);
    expect(out[0]?.does).toMatch(/closer look|exactly what/);
  });

  it("labels unknown low-confidence files with hedge text", async () => {
    const nodes: ScannedNode[] = [
      { path: "weird-thing.ts", kind: "unknown", userFacing: false },
    ];
    const out = await describer.describe(nodes, makeGraph(), []);
    expect(out[0]?.does).toMatch(/can't tell|couldn't figure/);
    expect(out[0]?.confidence).toBeLessThan(0.5);
  });

  it("marks confidenceSource as convention+graph when graph contributes", async () => {
    const nodes: ScannedNode[] = [
      { path: "src/lib/db.ts", kind: "helper", userFacing: false },
    ];
    const out = await describer.describe(
      nodes,
      makeGraph({ fanIn: new Map([["src/lib/db.ts", 2]]) }),
      [],
    );
    expect(out[0]?.confidenceSource).toBe("convention+graph");
  });

  it("marks confidenceSource as convention when no graph signal", async () => {
    const nodes: ScannedNode[] = [
      { path: "package.json", kind: "config", userFacing: false },
    ];
    const out = await describer.describe(nodes, makeGraph(), []);
    expect(out[0]?.confidenceSource).toBe("convention");
  });

  it("identifies hooks by useX naming", async () => {
    const nodes: ScannedNode[] = [
      { path: "src/hooks/useAuth.ts", kind: "helper", userFacing: false },
    ];
    const out = await describer.describe(nodes, makeGraph(), []);
    expect(out[0]?.name).toContain("useAuth");
  });
});

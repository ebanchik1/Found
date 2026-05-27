import { describe, it, expect } from "vitest";
import {
  classifyFromConventions,
  refineWithGraph,
  extractNounFromPath,
} from "./classify.js";
import type { GraphData, ScannedNode } from "./types.js";

describe("classifyFromConventions", () => {
  it("classifies Next.js app router pages as screens", () => {
    expect(classifyFromConventions("app/page.tsx").kind).toBe("screen");
    expect(classifyFromConventions("app/login/page.tsx").kind).toBe("screen");
    expect(classifyFromConventions("app/users/[id]/page.tsx").kind).toBe("screen");
    expect(classifyFromConventions("app/blog/[...slug]/page.tsx").kind).toBe("screen");
  });

  it("classifies Next.js pages router as screens", () => {
    expect(classifyFromConventions("pages/index.tsx").kind).toBe("screen");
    expect(classifyFromConventions("pages/login.tsx").kind).toBe("screen");
    expect(classifyFromConventions("pages/users/[id].tsx").kind).toBe("screen");
  });

  it("excludes _app, _document, api/ from pages router screens", () => {
    expect(classifyFromConventions("pages/_app.tsx").kind).toBe("entrypoint");
    expect(classifyFromConventions("pages/_document.tsx").kind).toBe("entrypoint");
    expect(classifyFromConventions("pages/api/users.ts").kind).toBe("endpoint");
  });

  it("classifies app router route.ts as endpoint", () => {
    expect(classifyFromConventions("app/api/users/route.ts").kind).toBe("endpoint");
  });

  it("classifies app router layout/template/error as helper", () => {
    expect(classifyFromConventions("app/layout.tsx").kind).toBe("helper");
    expect(classifyFromConventions("app/users/layout.tsx").kind).toBe("helper");
    expect(classifyFromConventions("app/error.tsx").kind).toBe("helper");
  });

  it("classifies components/ as component", () => {
    expect(classifyFromConventions("src/components/Button.tsx").kind).toBe("component");
    expect(classifyFromConventions("components/Header.jsx").kind).toBe("component");
  });

  it("classifies lib/ utils/ services/ hooks/ as helper", () => {
    expect(classifyFromConventions("src/lib/db.ts").kind).toBe("helper");
    expect(classifyFromConventions("src/utils/format.ts").kind).toBe("helper");
    expect(classifyFromConventions("src/services/api.ts").kind).toBe("helper");
    expect(classifyFromConventions("src/hooks/useAuth.ts").kind).toBe("helper");
  });

  it("classifies config files", () => {
    expect(classifyFromConventions("package.json").kind).toBe("config");
    expect(classifyFromConventions("tsconfig.json").kind).toBe("config");
    expect(classifyFromConventions("next.config.js").kind).toBe("config");
    expect(classifyFromConventions("vite.config.ts").kind).toBe("config");
    expect(classifyFromConventions(".env.local").kind).toBe("config");
    expect(classifyFromConventions("tailwind.config.js").kind).toBe("config");
  });

  it("classifies test files", () => {
    expect(classifyFromConventions("src/foo.test.ts").kind).toBe("test");
    expect(classifyFromConventions("src/bar.spec.tsx").kind).toBe("test");
    expect(classifyFromConventions("src/__tests__/baz.ts").kind).toBe("test");
  });

  it("classifies entrypoint files", () => {
    expect(classifyFromConventions("src/main.tsx").kind).toBe("entrypoint");
    expect(classifyFromConventions("src/index.ts").kind).toBe("entrypoint");
    expect(classifyFromConventions("src/App.tsx").kind).toBe("entrypoint");
  });

  it("falls back to unknown with low confidence", () => {
    const result = classifyFromConventions("src/random.ts");
    expect(result.kind).toBe("unknown");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("classifies Vercel-style root /api/*.tsx as endpoint", () => {
    expect(classifyFromConventions("api/og.tsx").kind).toBe("endpoint");
    expect(classifyFromConventions("api/og.tsx").confidence).toBeGreaterThanOrEqual(0.8);
    expect(classifyFromConventions("api/hello.ts").kind).toBe("endpoint");
  });

  it("classifies src/data/ as helper (data convention)", () => {
    expect(classifyFromConventions("src/data/cards.ts").kind).toBe("helper");
    expect(classifyFromConventions("data/products.ts").kind).toBe("helper");
  });

  it("classifies src/state/ and src/store/ as helper (state convention)", () => {
    expect(classifyFromConventions("src/state/walletStore.tsx").kind).toBe("helper");
    expect(classifyFromConventions("src/store/counter.ts").kind).toBe("helper");
    expect(classifyFromConventions("src/stores/auth.ts").kind).toBe("helper");
  });

  it("classifies root scripts/ as helper with high confidence", () => {
    const result = classifyFromConventions("scripts/check-cards.mjs");
    expect(result.kind).toBe("helper");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies .d.ts declaration files as config", () => {
    expect(classifyFromConventions("src/vite-env.d.ts").kind).toBe("config");
    expect(classifyFromConventions("types/global.d.ts").kind).toBe("config");
  });

  it("classifies root server.js / server.ts as entrypoint", () => {
    expect(classifyFromConventions("server.js").kind).toBe("entrypoint");
    expect(classifyFromConventions("server.ts").kind).toBe("entrypoint");
    expect(classifyFromConventions("src/server.ts").kind).toBe("entrypoint");
  });

  it("handles Windows backslash paths", () => {
    expect(classifyFromConventions("src\\components\\Button.tsx").kind).toBe("component");
    expect(classifyFromConventions("app\\login\\page.tsx").kind).toBe("screen");
  });
});

function makeGraph(opts: {
  fanIn?: Record<string, number>;
  fanOut?: Record<string, number>;
  parserUsed?: "dependency-cruiser" | "babel-fallback";
}): GraphData {
  return {
    edges: [],
    fanIn: new Map(Object.entries(opts.fanIn ?? {})),
    fanOut: new Map(Object.entries(opts.fanOut ?? {})),
    parserUsed: opts.parserUsed ?? "dependency-cruiser",
  };
}

describe("refineWithGraph", () => {
  it("downgrades orphan unknowns to confidence 0.1", () => {
    const node: ScannedNode = { path: "x.ts", kind: "unknown", userFacing: false };
    const graph = makeGraph({});
    const refined = refineWithGraph(node, 0.3, graph);
    expect(refined.confidence).toBe(0.1);
  });

  it("promotes imported-unknown to helper", () => {
    const node: ScannedNode = { path: "x.ts", kind: "unknown", userFacing: false };
    const graph = makeGraph({ fanIn: { "x.ts": 2 } });
    const refined = refineWithGraph(node, 0.3, graph);
    expect(refined.kind).toBe("helper");
    expect(refined.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("boosts confidence on high-fan-in helpers", () => {
    const node: ScannedNode = { path: "lib/db.ts", kind: "helper", userFacing: false };
    const graph = makeGraph({ fanIn: { "lib/db.ts": 5 } });
    const refined = refineWithGraph(node, 0.75, graph);
    expect(refined.confidence).toBeGreaterThan(0.75);
  });

  it("lowers confidence when babel fallback was used", () => {
    const node: ScannedNode = { path: "lib/db.ts", kind: "helper", userFacing: false };
    const graph = makeGraph({ parserUsed: "babel-fallback" });
    const refined = refineWithGraph(node, 0.75, graph);
    expect(refined.confidence).toBeLessThan(0.75);
  });
});

describe("extractNounFromPath", () => {
  it("handles the root route", () => {
    const result = extractNounFromPath("/");
    expect(result.noun).toBe("home");
    expect(result.isDynamic).toBe(false);
  });

  it("extracts simple noun from static route", () => {
    expect(extractNounFromPath("/login").noun).toBe("login");
    expect(extractNounFromPath("/dashboard").noun).toBe("dashboard");
    expect(extractNounFromPath("/settings").noun).toBe("settings");
  });

  it("strips [id] and singularizes parent", () => {
    const result = extractNounFromPath("/users/[id]");
    expect(result.noun).toBe("user");
    expect(result.isDynamic).toBe(true);
    expect(result.detailSuffix).toBe("details");
  });

  it("strips :id (React Router) and singularizes parent", () => {
    const result = extractNounFromPath("/products/:id");
    expect(result.noun).toBe("product");
    expect(result.isDynamic).toBe(true);
  });

  it("handles catch-all [...slug] as 'post'", () => {
    const result = extractNounFromPath("/blog/[...slug]");
    expect(result.noun).toBe("blog");
    expect(result.isDynamic).toBe(true);
    expect(result.detailSuffix).toBe("post");
  });

  it("handles deeper paths with dynamic + action", () => {
    const result = extractNounFromPath("/users/[id]/edit");
    expect(result.noun).toBe("edit user");
    expect(result.isDynamic).toBe(true);
  });

  it("looks up verbs from the verb table", () => {
    expect(extractNounFromPath("/login").verb).toBe("sign in");
    expect(extractNounFromPath("/signup").verb).toBe("create an account");
    expect(extractNounFromPath("/settings").verb).toBe("change settings");
  });

  it("returns null verb for unmapped segments", () => {
    expect(extractNounFromPath("/inventory").verb).toBeNull();
  });

  it("humanizes hyphenated and underscored segments", () => {
    expect(extractNounFromPath("/order-history").noun).toBe("order history");
    expect(extractNounFromPath("/user_profile").noun).toBe("user profile");
  });

  it("handles pluralized parents ending in 'ies'", () => {
    expect(extractNounFromPath("/categories/[id]").noun).toBe("category");
  });
});

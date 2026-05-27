import {
  FoundMapSchema,
  type DescribedNode,
  type Edge,
  type FoundMap,
  type Summary,
} from "./types.js";

export interface BuildMapInput {
  nodes: DescribedNode[];
  edges: Edge[];
}

export function buildFoundMap(input: BuildMapInput, configCount: number): FoundMap {
  const summary: Summary = {
    screens: input.nodes.filter((n) => n.kind === "screen").length,
    endpoints: input.nodes.filter((n) => n.kind === "endpoint").length,
    components: input.nodes.filter((n) => n.kind === "component").length,
    helpers: input.nodes.filter((n) => n.kind === "helper").length,
    configFiles: configCount,
    tests: input.nodes.filter((n) => n.kind === "test").length,
    unknown: input.nodes.filter((n) => n.kind === "unknown").length,
  };

  const map: FoundMap = {
    version: "0.1",
    generatedAt: new Date().toISOString(),
    summary,
    nodes: input.nodes,
    edges: input.edges,
  };

  return FoundMapSchema.parse(map);
}

export function renderJson(map: FoundMap, pretty = true): string {
  return pretty ? JSON.stringify(map, null, 2) : JSON.stringify(map);
}

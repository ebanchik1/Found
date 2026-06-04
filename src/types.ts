import { z } from "zod";

export const NodeKindSchema = z.enum([
  "screen",
  "endpoint",
  "component",
  "helper",
  "config",
  "test",
  "entrypoint",
  "unknown",
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const ConceptCategorySchema = z.enum([
  "language",
  "frontend",
  "styling",
  "ai",
  "state",
  "data",
  "backend",
  "database",
  "auth",
  "testing",
  "deployment",
  "tooling",
  "other",
]);

export const ConceptTagSchema = z.object({
  id: z.string(),
  category: ConceptCategorySchema,
  label: z.string(),
  source: z.enum(["package", "pattern", "filesystem"]),
  confidence: z.number().min(0).max(1),
  detectedIn: z.array(z.string()),
});

export const BuiltOnSchema = z
  .object({
    tags: z.array(ConceptTagSchema),
    summary: z.string().optional(),
  })
  .optional();

export const ConfidenceSourceSchema = z.enum([
  "convention",
  "convention+graph",
  "graph",
  "model",
]);
export type ConfidenceSource = z.infer<typeof ConfidenceSourceSchema>;

export const NodeSchema = z.object({
  path: z.string(),
  kind: NodeKindSchema,
  name: z.string(),
  does: z.string(),
  confidence: z.number().min(0).max(1),
  confidenceSource: ConfidenceSourceSchema,
  userFacing: z.boolean(),
});
export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const SummarySchema = z.object({
  screens: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  components: z.number().int().nonnegative(),
  helpers: z.number().int().nonnegative(),
  configFiles: z.number().int().nonnegative(),
  tests: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});
export type Summary = z.infer<typeof SummarySchema>;

export const FoundMapSchema = z.object({
  version: z.literal("0.1"),
  generatedAt: z.string(),
  summary: SummarySchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  builtOn: BuiltOnSchema,
});
export type FoundMap = z.infer<typeof FoundMapSchema>;
export type BuiltOn = NonNullable<z.infer<typeof BuiltOnSchema>>;

export interface ScannedNode {
  path: string;
  kind: NodeKind;
  userFacing: boolean;
}

export interface RouteInfo {
  path: string;
  routePath: string;
  framework: "next-app" | "next-pages" | "react-router";
}

export interface GraphData {
  edges: Edge[];
  fanIn: Map<string, number>;
  fanOut: Map<string, number>;
  parserUsed: "dependency-cruiser" | "babel-fallback";
}

export interface DescribedNode extends Node {}

export interface DescribeResult {
  nodes: DescribedNode[];
  builtOnSummary?: string;
}

export interface DescribeContext {
  nodes: ScannedNode[];
  graph: GraphData;
  routes: RouteInfo[];
  builtOnTags?: Array<{ id: string; category: string; label: string }>;
}

export interface Describer {
  describe(ctx: DescribeContext): Promise<DescribeResult>;
}

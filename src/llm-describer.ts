import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import path from "node:path";
import type {
  Describer,
  DescribeContext,
  DescribeResult,
  DescribedNode,
  GraphData,
  RouteInfo,
  ScannedNode,
} from "./types.js";
import { extractAllExports, type FileExports } from "./exports.js";
import { ConventionDescriber } from "./describer.js";

export interface LLMDescriberOptions {
  apiKey: string;
  model?: string;
  rootDir: string;
  signal?: AbortSignal;
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 8000;

const LLMLabelSchema = z.object({
  path: z.string(),
  name: z.string().min(1),
  does: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
const LLMResponseSchema = z.object({
  labels: z.array(LLMLabelSchema),
  builtOnSummary: z.string().optional(),
});

const SYSTEM_PROMPT = `You label the parts of a JavaScript or TypeScript project so the non-technical person who built it (often with an AI tool like Lovable, Bolt, or v0) can understand what they have.

You receive a STRUCTURED description only: file paths, what each file exports (names only, no source), what imports what, route info, a deterministic kind hint per file, and a list of detected technologies and patterns. You NEVER see the source code itself. Label only from the structure.

For each file, produce:
- "name": a plain-language label of what this is TO A USER. Not technical role.
  - Good: "The sign-in screen", "The optimization engine", "Where users add their cards"
  - Bad: "auth component", "scoring utility", "LoginPage.tsx"
- "does": one sentence on what it does for the people USING the app, not how it works.
  - Good: "Where people enter the credit cards they have today and what they spend their money on."
  - Bad: "Renders a form with controlled inputs that dispatches actions to the wallet store."
- "confidence": 0.0 to 1.0 based ONLY on the strength of the evidence in the structure.
  - 0.9+: the path + exports + edges clearly imply the role.
  - 0.5 to 0.8: educated guess; hedge in the does sentence ("Probably where...").
  - Below 0.5: REFUSE to guess. Use "I can't tell what this does without a closer look." Lower confidence forces honest hedging in the renderer.

Also produce ONE "builtOnSummary": 2-3 short sentences in plain English describing what the app is built on AT A HIGH LEVEL. Mention the headline technologies and patterns (frontend framework, AI APIs and how they're used, key databases, distinctive patterns). For a non-technical audience. Skip pieces that are not interesting (typescript, vite as build tool, etc.) — focus on the recognizable, distinguishing technologies.

Good builtOnSummary: "A React app built with Vite, styled with Tailwind and shadcn/ui. The chat feature uses Anthropic's Claude API with streaming responses. Data lives in Supabase Postgres."
Bad builtOnSummary: "This project uses several modern web technologies including React, TypeScript, Vite, and various other tools to provide a rich frontend experience."

Hard rules:
- Never invent. If the evidence is thin, lower the confidence and say so.
- Never use technical jargon in user-facing names. Refuse phrases like "component", "module", "utility" unless the file is clearly internal (helpers).
- For helpers: name what they DO for the app, not what they ARE technically. ("The optimization engine" beats "The optimal helper".)
- For screens: lead with what users see/do there.
- For endpoints: lead with what the back end serves.
- Return STRICT JSON. No prose, no markdown, no code fences. JSON only.

Schema:
{
  "labels": [
    { "path": "<exact path from input>", "name": "...", "does": "...", "confidence": 0.85 }
  ],
  "builtOnSummary": "2-3 sentences..."
}

Return one label entry per node, in the same order as the input. Do not skip any.`;

interface NodeContext {
  path: string;
  kind: ScannedNode["kind"];
  userFacing: boolean;
  exports: FileExports;
  fanIn: number;
  fanOut: number;
  importedBy: string[];
  imports: string[];
  routePath?: string;
}

function buildNodeContexts(
  nodes: ScannedNode[],
  graph: GraphData,
  routes: RouteInfo[],
  exportsMap: Map<string, FileExports>,
): NodeContext[] {
  const incomingByPath = new Map<string, string[]>();
  const outgoingByPath = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!outgoingByPath.has(edge.from)) outgoingByPath.set(edge.from, []);
    outgoingByPath.get(edge.from)!.push(edge.to);
    if (!incomingByPath.has(edge.to)) incomingByPath.set(edge.to, []);
    incomingByPath.get(edge.to)!.push(edge.from);
  }

  return nodes.map((node) => {
    const route = routes.find((r) => r.path === node.path);
    const exportsForNode = exportsMap.get(node.path) ?? { hasDefault: false, named: [] };
    const ctx: NodeContext = {
      path: node.path,
      kind: node.kind,
      userFacing: node.userFacing,
      exports: exportsForNode,
      fanIn: graph.fanIn.get(node.path) ?? 0,
      fanOut: graph.fanOut.get(node.path) ?? 0,
      importedBy: (incomingByPath.get(node.path) ?? []).slice(0, 8),
      imports: (outgoingByPath.get(node.path) ?? []).slice(0, 8),
    };
    if (route) ctx.routePath = route.routePath;
    return ctx;
  });
}

function formatPrompt(
  rootDir: string,
  contexts: NodeContext[],
  builtOnTags: Array<{ id: string; category: string; label: string }> | undefined,
): string {
  const projectName = path.basename(rootDir);
  const lines: string[] = [
    `PROJECT: ${projectName}`,
    `FILE COUNT: ${contexts.length}`,
    "",
  ];

  if (builtOnTags && builtOnTags.length > 0) {
    lines.push("DETECTED TECHNOLOGIES AND PATTERNS:");
    const byCategory = new Map<string, string[]>();
    for (const t of builtOnTags) {
      if (!byCategory.has(t.category)) byCategory.set(t.category, []);
      byCategory.get(t.category)!.push(t.label);
    }
    for (const [category, labels] of byCategory) {
      lines.push(`  ${category}: ${labels.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("NODES:");
  for (const c of contexts) {
    lines.push(`- path: ${c.path}`);
    lines.push(`  kind: ${c.kind}`);
    if (c.routePath) lines.push(`  route: ${c.routePath}`);
    const exportsList: string[] = [];
    if (c.exports.hasDefault) exportsList.push("default");
    exportsList.push(...c.exports.named);
    if (exportsList.length > 0) {
      lines.push(`  exports: ${exportsList.slice(0, 12).join(", ")}`);
    } else {
      lines.push(`  exports: (none detected)`);
    }
    if (c.fanIn > 0) {
      const sample = c.importedBy.length > 0 ? ` [${c.importedBy.slice(0, 5).join(", ")}]` : "";
      lines.push(`  imported_by: ${c.fanIn} file${c.fanIn === 1 ? "" : "s"}${sample}`);
    }
    if (c.fanOut > 0) {
      const sample = c.imports.length > 0 ? ` [${c.imports.slice(0, 5).join(", ")}]` : "";
      lines.push(`  imports: ${c.fanOut} file${c.fanOut === 1 ? "" : "s"}${sample}`);
    }
    lines.push("");
  }

  lines.push(
    "Return JSON with one label per node in the same order, plus a builtOnSummary string. STRICT JSON only.",
  );
  return lines.join("\n");
}

export interface AnthropicLike {
  messages: {
    create(input: {
      model: string;
      max_tokens: number;
      system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export class LLMDescriber implements Describer {
  private client: AnthropicLike;
  private model: string;
  private rootDir: string;
  private fallback: ConventionDescriber;

  constructor(opts: LLMDescriberOptions, clientOverride?: AnthropicLike) {
    this.client =
      clientOverride ??
      (new Anthropic({ apiKey: opts.apiKey }) as unknown as AnthropicLike);
    this.model = opts.model ?? DEFAULT_MODEL;
    this.rootDir = opts.rootDir;
    this.fallback = new ConventionDescriber();
  }

  async describe(ctx: DescribeContext): Promise<DescribeResult> {
    const exportsMap = extractAllExports(
      this.rootDir,
      ctx.nodes.map((n) => n.path),
    );
    const contexts = buildNodeContexts(ctx.nodes, ctx.graph, ctx.routes, exportsMap);
    const userPrompt = formatPrompt(this.rootDir, contexts, ctx.builtOnTags);

    let response;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (err) {
      process.stderr.write(
        `\nFound's LLM labeling failed (${
          err instanceof Error ? err.message : "unknown error"
        }). Falling back to plain-language labels without the model.\n\n`,
      );
      return this.fallback.describe(ctx);
    }

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    let parsed: z.infer<typeof LLMResponseSchema>;
    try {
      const json = extractJson(rawText);
      parsed = LLMResponseSchema.parse(json);
    } catch (err) {
      process.stderr.write(
        `\nFound's LLM returned unparseable output. Falling back to plain-language labels without the model.\n\n`,
      );
      return this.fallback.describe(ctx);
    }

    const llmByPath = new Map(parsed.labels.map((l) => [l.path, l]));
    const fallbackResult = await this.fallback.describe(ctx);

    const nodes: DescribedNode[] = fallbackResult.nodes.map((fallbackNode) => {
      const llm = llmByPath.get(fallbackNode.path);
      if (!llm) return fallbackNode;
      return {
        ...fallbackNode,
        name: llm.name,
        does: llm.does,
        confidence: llm.confidence,
        confidenceSource: "model",
      };
    });

    const result: DescribeResult = { nodes };
    if (parsed.builtOnSummary) {
      result.builtOnSummary = parsed.builtOnSummary;
    }
    return result;
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const stripFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = stripFences.indexOf("{");
  const end = stripFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in LLM response");
  }
  return JSON.parse(stripFences.slice(start, end + 1));
}

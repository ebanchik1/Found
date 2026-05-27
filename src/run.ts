import { scan } from "./scan.js";
import { buildGraph } from "./graph.js";
import { detectRoutes } from "./routes.js";
import { ConventionDescriber } from "./describer.js";
import { LLMDescriber } from "./llm-describer.js";
import { buildFoundMap, renderJson } from "./renderJson.js";
import { renderText, renderConfigSummary } from "./renderText.js";
import type { Describer, RouteInfo, ScannedNode } from "./types.js";

export interface RunOptions {
  rootDir: string;
  showAll: boolean;
  terminalWidth: number;
  useLLM?: boolean;
  apiKey?: string;
  model?: string;
}

export interface RunResult {
  humanText: string;
  json: string;
  describerUsed: "convention" | "model";
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const scanResult = await scan(opts.rootDir);
  const filePaths = scanResult.nodes.map((n) => n.path);

  const graph = await buildGraph({
    rootDir: scanResult.rootDir,
    files: filePaths,
  });

  const initialRoutes = detectRoutes(scanResult.nodes, scanResult.rootDir);
  const { routes, spaPromotedPath } = detectSpaIfNoRoutes(
    initialRoutes,
    scanResult.nodes,
  );

  const routeTargets = new Set(
    routes
      .filter((r) => r.framework === "react-router")
      .map((r) => r.path),
  );
  const promotedNodes = scanResult.nodes.map((n) => {
    if (n.path === spaPromotedPath) {
      return { ...n, kind: "screen" as const, userFacing: true };
    }
    if (routeTargets.has(n.path) && n.kind !== "screen") {
      return { ...n, kind: "screen" as const, userFacing: true };
    }
    return n;
  });

  const wantsLLM = opts.useLLM !== false && !!opts.apiKey;
  const describer: Describer = wantsLLM
    ? new LLMDescriber({
        apiKey: opts.apiKey!,
        rootDir: scanResult.rootDir,
        ...(opts.model ? { model: opts.model } : {}),
      })
    : new ConventionDescriber();
  const described = await describer.describe(promotedNodes, graph, routes);
  const describerUsed: "convention" | "model" =
    wantsLLM && described.some((d) => d.confidenceSource === "model")
      ? "model"
      : "convention";

  const map = buildFoundMap(
    { nodes: described, edges: graph.edges },
    scanResult.configCount,
  );

  const humanText =
    renderText(
      map,
      {
        showAll: opts.showAll,
        terminalWidth: opts.terminalWidth,
        parserUsed: graph.parserUsed,
      },
      graph,
    ) +
    "\n" +
    renderConfigSummary(scanResult.configCount);

  const json = renderJson(map);

  return { humanText, json, describerUsed };
}

const APP_ENTRYPOINT_RX = /^(src\/)?App\.(t|j)sx?$/;

function detectSpaIfNoRoutes(
  routes: RouteInfo[],
  nodes: ScannedNode[],
): { routes: RouteInfo[]; spaPromotedPath: string | null } {
  if (routes.length > 0) return { routes, spaPromotedPath: null };

  const appNode = nodes.find((n) => APP_ENTRYPOINT_RX.test(toPosix(n.path)));
  if (!appNode) return { routes, spaPromotedPath: null };

  const synthesized: RouteInfo = {
    path: appNode.path,
    routePath: "/",
    framework: "react-router",
  };
  return { routes: [synthesized], spaPromotedPath: appNode.path };
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

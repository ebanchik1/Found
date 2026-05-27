import { scan } from "./scan.js";
import { buildGraph } from "./graph.js";
import { detectRoutes } from "./routes.js";
import { ConventionDescriber } from "./describer.js";
import { buildFoundMap, renderJson } from "./renderJson.js";
import { renderText, renderConfigSummary } from "./renderText.js";

export interface RunOptions {
  rootDir: string;
  showAll: boolean;
  terminalWidth: number;
}

export interface RunResult {
  humanText: string;
  json: string;
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const scanResult = await scan(opts.rootDir);
  const filePaths = scanResult.nodes.map((n) => n.path);

  const graph = await buildGraph({
    rootDir: scanResult.rootDir,
    files: filePaths,
  });

  const routes = detectRoutes(scanResult.nodes, scanResult.rootDir);

  const routeTargets = new Set(
    routes
      .filter((r) => r.framework === "react-router")
      .map((r) => r.path),
  );
  const promotedNodes = scanResult.nodes.map((n) =>
    routeTargets.has(n.path) && n.kind !== "screen"
      ? { ...n, kind: "screen" as const, userFacing: true }
      : n,
  );

  const describer = new ConventionDescriber();
  const described = await describer.describe(promotedNodes, graph, routes);

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

  return { humanText, json };
}

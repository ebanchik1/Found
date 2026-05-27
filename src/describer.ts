import path from "node:path";
import {
  classifyFromConventions,
  refineWithGraph,
  extractNounFromPath,
} from "./classify.js";
import type {
  Describer,
  DescribedNode,
  GraphData,
  NodeKind,
  RouteInfo,
  ScannedNode,
} from "./types.js";

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function basenameNoExt(filePath: string): string {
  const base = path.basename(filePath);
  return base.replace(/\.(t|j)sx?$/, "");
}

function labelScreen(route: RouteInfo): { name: string; does: string } {
  const extracted = extractNounFromPath(route.routePath);
  if (route.routePath === "/") {
    return {
      name: "The home screen",
      does: "A screen at /. Probably where people land when they open the app.",
    };
  }

  const verb = extracted.verb;
  if (extracted.isDynamic) {
    const detail = extracted.detailSuffix ?? "details";
    const name = `The ${extracted.noun} ${detail} screen`;
    const does = `A screen at ${route.routePath}. Probably where people ${
      verb ?? `see a single ${extracted.noun}`
    }.`;
    return { name, does };
  }

  const name = `The ${extracted.noun} screen`;
  const does = `A screen at ${route.routePath}. Probably where people ${
    verb ?? `interact with ${extracted.noun}`
  }.`;
  return { name, does };
}

function labelEndpoint(filePath: string, route: RouteInfo | undefined): {
  name: string;
  does: string;
} {
  if (route) {
    return {
      name: `An API endpoint at ${route.routePath}`,
      does: "A back-end endpoint. Other parts of the app call this.",
    };
  }
  const guessedRoute = guessApiRoute(filePath);
  return {
    name: `An API endpoint at ${guessedRoute}`,
    does: "A back-end endpoint. Other parts of the app call this.",
  };
}

function guessApiRoute(filePath: string): string {
  const p = toPosix(filePath);
  const appMatch = p.match(/(?:^|\/)app\/(.*)\/route\.(?:t|j)sx?$/);
  if (appMatch) return "/" + appMatch[1]!;
  const pagesMatch = p.match(/(?:^|\/)pages\/api\/(.*)\.(?:t|j)sx?$/);
  if (pagesMatch) return "/api/" + pagesMatch[1]!;
  return "/api/...";
}

function labelComponent(filePath: string, fanIn: number): { name: string; does: string } {
  const base = basenameNoExt(filePath);
  const name = `A reusable piece called ${base}`;
  const does =
    fanIn === 0
      ? `A UI piece. Used inside screens. You probably never open this directly.`
      : `Used inside ${fanIn} ${fanIn === 1 ? "screen or other piece" : "screens or other pieces"}. You probably never open this directly.`;
  return { name, does };
}

function labelHelper(filePath: string, fanIn: number): { name: string; does: string } {
  const p = filePath.replace(/\\/g, "/");
  const base = basenameNoExt(filePath);
  const isHook = /^use[A-Z]/.test(base);
  const isScript = /^scripts\//.test(p);
  const isData = /(^|\/)(src\/)?data\//.test(p);
  const isState = /(^|\/)(src\/)?(state|store|stores)\//.test(p);

  let name: string;
  if (isScript) {
    name = `A maintenance script — \`${base}\``;
  } else if (isData) {
    name = `A data file — \`${base}\``;
  } else if (isState) {
    name = `App state — \`${base}\``;
  } else if (isHook) {
    name = `A behavior helper called ${base}`;
  } else {
    name = `A shared helper — \`${base}\``;
  }

  let does: string;
  if (isScript) {
    does =
      fanIn === 0
        ? "A standalone script. Not imported by the app — run it from the command line."
        : `A script run from the command line. Used by ${fanIn === 1 ? "1 other file" : `${fanIn} other files`}.`;
  } else if (fanIn === 0) {
    does = "Nothing else in the project imports this. It might be unused, or it might be loaded dynamically.";
  } else {
    const usedBy = fanIn === 1 ? "1 other file" : `${fanIn} other files`;
    does = `Used by ${usedBy}. I can't tell exactly what it does without a closer look.`;
  }
  return { name, does };
}

function labelEntrypoint(filePath: string): { name: string; does: string } {
  return {
    name: `The app's starting point`,
    does: "Where the app starts running. Probably never edited by hand.",
  };
}

function labelConfig(filePath: string): { name: string; does: string } {
  return {
    name: `A settings file`,
    does: "Project settings. You've never had to open this.",
  };
}

function labelUnknown(filePath: string, confidence: number): { name: string; does: string } {
  const base = path.basename(filePath);
  if (confidence < 0.3) {
    return {
      name: `A file called \`${base}\``,
      does: "I couldn't figure out what this is. It might be unused.",
    };
  }
  return {
    name: `A file called \`${base}\``,
    does: "I can't tell what this does without a closer look.",
  };
}

function describeOne(
  node: ScannedNode,
  baseConfidence: number,
  graph: GraphData,
  routes: RouteInfo[],
): DescribedNode {
  const refined = refineWithGraph(node, baseConfidence, graph);
  const fanIn = graph.fanIn.get(node.path) ?? 0;
  const route = routes.find((r) => r.path === node.path);

  let label: { name: string; does: string };
  switch (refined.kind) {
    case "screen":
      if (route) {
        label = labelScreen(route);
      } else {
        label = {
          name: `A screen — \`${basenameNoExt(node.path)}\``,
          does: "Probably a screen, but I couldn't figure out its route.",
        };
      }
      break;
    case "endpoint":
      label = labelEndpoint(node.path, route);
      break;
    case "component":
      label = labelComponent(node.path, fanIn);
      break;
    case "helper":
      label = labelHelper(node.path, fanIn);
      break;
    case "entrypoint":
      label = labelEntrypoint(node.path);
      break;
    case "config":
      label = labelConfig(node.path);
      break;
    case "test":
      label = {
        name: `A test file`,
        does: "Tests for other files in this project.",
      };
      break;
    case "unknown":
    default:
      label = labelUnknown(node.path, refined.confidence);
      break;
  }

  const confidenceSource: DescribedNode["confidenceSource"] =
    refined.kind === "unknown" && fanIn === 0
      ? "graph"
      : fanIn > 0 || (graph.fanOut.get(node.path) ?? 0) > 0
      ? "convention+graph"
      : "convention";

  return {
    path: node.path,
    kind: refined.kind,
    name: label.name,
    does: label.does,
    confidence: refined.confidence,
    confidenceSource,
    userFacing: refined.userFacing,
  };
}

export class ConventionDescriber implements Describer {
  async describe(
    nodes: ScannedNode[],
    graph: GraphData,
    routes: RouteInfo[],
  ): Promise<DescribedNode[]> {
    return nodes.map((node) => {
      const base = classifyFromConventions(node.path);
      return describeOne(node, base.confidence, graph, routes);
    });
  }
}

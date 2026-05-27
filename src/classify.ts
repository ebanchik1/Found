import type { NodeKind, ScannedNode, GraphData } from "./types.js";

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export interface ClassifyResult {
  kind: NodeKind;
  userFacing: boolean;
  confidence: number;
}

const CONFIG_PATTERNS = [
  /(^|\/)package\.json$/,
  /(^|\/)tsconfig.*\.json$/,
  /(^|\/)[^/]*\.config\.(js|ts|mjs|cjs)$/,
  /(^|\/)\.env(\..+)?$/,
  /(^|\/)next\.config\.(js|ts|mjs)$/,
  /(^|\/)vite\.config\.(js|ts|mjs)$/,
  /(^|\/)postcss\.config\.(js|ts|mjs)$/,
  /(^|\/)tailwind\.config\.(js|ts|mjs)$/,
  /(^|\/)eslint\.config\.(js|ts|mjs)$/,
  /(^|\/)\.eslintrc(\..+)?$/,
  /(^|\/)\.prettierrc(\..+)?$/,
];

const TEST_PATTERNS = [
  /\.test\.(t|j)sx?$/,
  /\.spec\.(t|j)sx?$/,
  /(^|\/)__tests__\//,
];

const ENTRYPOINT_PATTERNS = [
  /(^|\/)src\/main\.(t|j)sx?$/,
  /(^|\/)src\/index\.(t|j)sx?$/,
  /(^|\/)src\/App\.(t|j)sx?$/,
  /(^|\/)pages\/_app\.(t|j)sx?$/,
  /(^|\/)pages\/_document\.(t|j)sx?$/,
];

const NEXT_APP_SCREEN = /(^|\/)app\/.*\/page\.(t|j)sx?$/;
const NEXT_APP_ROOT_SCREEN = /(^|\/)app\/page\.(t|j)sx?$/;
const NEXT_APP_ENDPOINT = /(^|\/)app\/.*\/route\.(t|j)sx?$/;
const NEXT_APP_LAYOUT = /(^|\/)app\/(.*\/)?(layout|template|error|not-found|loading)\.(t|j)sx?$/;

const NEXT_PAGES_SCREEN = /(^|\/)pages\/(?!_app|_document|api\/).*\.(t|j)sx?$/;
const NEXT_PAGES_ENDPOINT = /(^|\/)pages\/api\/.*\.(t|j)sx?$/;

const COMPONENT_DIR = /(^|\/)(src\/)?components\//;
const LIB_DIR = /(^|\/)(src\/)?lib\//;
const UTILS_DIR = /(^|\/)(src\/)?utils\//;
const HOOKS_DIR = /(^|\/)(src\/)?hooks\//;
const SERVICES_DIR = /(^|\/)(src\/)?services\//;
const SCREENS_DIR = /(^|\/)(src\/)?(screens|views|routes)\//;

export function classifyFromConventions(filePath: string): ClassifyResult {
  const p = toPosix(filePath);

  if (CONFIG_PATTERNS.some((rx) => rx.test(p))) {
    return { kind: "config", userFacing: false, confidence: 0.9 };
  }

  if (TEST_PATTERNS.some((rx) => rx.test(p))) {
    return { kind: "test", userFacing: false, confidence: 0.9 };
  }

  if (NEXT_APP_LAYOUT.test(p)) {
    return { kind: "helper", userFacing: false, confidence: 0.75 };
  }

  if (NEXT_APP_ROOT_SCREEN.test(p) || NEXT_APP_SCREEN.test(p)) {
    return { kind: "screen", userFacing: true, confidence: 0.9 };
  }

  if (NEXT_APP_ENDPOINT.test(p) || NEXT_PAGES_ENDPOINT.test(p)) {
    return { kind: "endpoint", userFacing: false, confidence: 0.9 };
  }

  if (NEXT_PAGES_SCREEN.test(p)) {
    return { kind: "screen", userFacing: true, confidence: 0.9 };
  }

  if (ENTRYPOINT_PATTERNS.some((rx) => rx.test(p))) {
    return { kind: "entrypoint", userFacing: false, confidence: 0.9 };
  }

  if (SCREENS_DIR.test(p)) {
    return { kind: "screen", userFacing: true, confidence: 0.75 };
  }

  if (COMPONENT_DIR.test(p)) {
    return { kind: "component", userFacing: true, confidence: 0.75 };
  }

  if (LIB_DIR.test(p) || UTILS_DIR.test(p) || SERVICES_DIR.test(p)) {
    return { kind: "helper", userFacing: false, confidence: 0.75 };
  }

  if (HOOKS_DIR.test(p)) {
    return { kind: "helper", userFacing: false, confidence: 0.75 };
  }

  return { kind: "unknown", userFacing: false, confidence: 0.3 };
}

export function refineWithGraph(
  node: ScannedNode,
  baseConfidence: number,
  graph: GraphData,
): ClassifyResult {
  const fanIn = graph.fanIn.get(node.path) ?? 0;
  const fanOut = graph.fanOut.get(node.path) ?? 0;

  if (fanIn === 0 && fanOut === 0 && node.kind === "unknown") {
    return { kind: "unknown", userFacing: false, confidence: 0.1 };
  }

  if (node.kind === "unknown" && fanIn >= 1) {
    return {
      kind: "helper",
      userFacing: false,
      confidence: Math.max(baseConfidence, 0.5),
    };
  }

  if (
    (node.kind === "helper" || node.kind === "component") &&
    fanIn >= 3
  ) {
    return {
      kind: node.kind,
      userFacing: node.userFacing,
      confidence: Math.min(0.9, baseConfidence + 0.15),
    };
  }

  if (graph.parserUsed === "babel-fallback") {
    return {
      kind: node.kind,
      userFacing: node.userFacing,
      confidence: Math.max(0.3, baseConfidence - 0.15),
    };
  }

  return { kind: node.kind, userFacing: node.userFacing, confidence: baseConfidence };
}

const ROUTE_VERB_TABLE: Record<string, string> = {
  login: "sign in",
  signin: "sign in",
  "sign-in": "sign in",
  auth: "sign in",
  signup: "create an account",
  register: "create an account",
  join: "create an account",
  logout: "sign out",
  signout: "sign out",
  dashboard: "land after signing in",
  home: "land after signing in",
  settings: "change settings",
  account: "manage their account",
  profile: "view or update their profile",
  new: "create something",
  create: "create something",
  add: "create something",
  edit: "edit something",
  update: "edit something",
  delete: "remove something",
  search: "search",
  browse: "browse",
};

const DYNAMIC_SEGMENT_RX = /^\[\.\.\.([^\]]+)\]$|^\[([^\]]+)\]$|^:(.+)$/;

function isDynamicSegment(seg: string): boolean {
  return DYNAMIC_SEGMENT_RX.test(seg);
}

function singularize(noun: string): string {
  if (noun.length > 3 && noun.endsWith("ies")) return noun.slice(0, -3) + "y";
  if (noun.length > 2 && noun.endsWith("ses")) return noun.slice(0, -2);
  if (noun.length > 1 && noun.endsWith("s") && !noun.endsWith("ss"))
    return noun.slice(0, -1);
  return noun;
}

function humanizeSegment(seg: string): string {
  return seg.replace(/[-_]+/g, " ").toLowerCase();
}

export interface ExtractedNoun {
  noun: string;
  verb: string | null;
  isDynamic: boolean;
  detailSuffix: string | null;
}

export function extractNounFromPath(routePath: string): ExtractedNoun {
  const normalized = routePath.replace(/^\//, "").replace(/\/$/, "");
  if (normalized === "") {
    return { noun: "home", verb: "land after signing in", isDynamic: false, detailSuffix: null };
  }

  const segments = normalized.split("/").filter((s) => s.length > 0);

  let detailSuffix: string | null = null;
  const cleanedSegments: string[] = [];
  let sawDynamic = false;

  for (const seg of segments) {
    if (isDynamicSegment(seg)) {
      sawDynamic = true;
      const match = seg.match(DYNAMIC_SEGMENT_RX);
      if (match && match[1]) {
        detailSuffix = "post";
      } else {
        detailSuffix = "details";
      }
    } else {
      cleanedSegments.push(seg);
    }
  }

  if (cleanedSegments.length === 0) {
    return {
      noun: "item",
      verb: null,
      isDynamic: sawDynamic,
      detailSuffix: detailSuffix ?? "details",
    };
  }

  const lastSegment = cleanedSegments[cleanedSegments.length - 1]!;
  const lastHumanized = humanizeSegment(lastSegment);

  if (sawDynamic) {
    const parent = cleanedSegments[0]!;
    const parentSingular = singularize(humanizeSegment(parent));

    if (cleanedSegments.length === 1) {
      return {
        noun: parentSingular,
        verb: ROUTE_VERB_TABLE[parent] ?? null,
        isDynamic: true,
        detailSuffix: detailSuffix ?? "details",
      };
    }

    const action = lastHumanized;
    return {
      noun: `${action} ${parentSingular}`,
      verb: ROUTE_VERB_TABLE[lastSegment] ?? null,
      isDynamic: true,
      detailSuffix: null,
    };
  }

  const verb = ROUTE_VERB_TABLE[lastSegment] ?? null;
  return {
    noun: lastHumanized,
    verb,
    isDynamic: false,
    detailSuffix: null,
  };
}

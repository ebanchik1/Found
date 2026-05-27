import fs from "node:fs";
import path from "node:path";
import type { RouteInfo, ScannedNode } from "./types.js";

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function nextAppRoutePath(filePath: string): string | null {
  const p = toPosix(filePath);
  const match = p.match(/(?:^|\/)app\/(.*)\/?page\.(?:t|j)sx?$/);
  if (!match) {
    if (/(?:^|\/)app\/page\.(?:t|j)sx?$/.test(p)) return "/";
    return null;
  }
  const segments = match[1]!.split("/").filter((s) => s.length > 0);
  const filtered = segments.filter((s) => !s.startsWith("(") || !s.endsWith(")"));
  if (filtered.length === 0) return "/";
  return "/" + filtered.join("/");
}

function nextPagesRoutePath(filePath: string): string | null {
  const p = toPosix(filePath);
  const match = p.match(/(?:^|\/)pages\/(.*)\.(?:t|j)sx?$/);
  if (!match) return null;
  const rel = match[1]!;
  if (rel.startsWith("_app") || rel.startsWith("_document")) return null;
  if (rel.startsWith("api/")) return null;
  if (rel === "index") return "/";
  if (rel.endsWith("/index")) {
    return "/" + rel.slice(0, -"/index".length);
  }
  return "/" + rel;
}

const REACT_ROUTER_RX = /<Route\s+(?:[^>]*?\s+)?path\s*=\s*["'`]([^"'`]+)["'`]/g;

function reactRouterPaths(filePath: string, rootDir: string): string[] {
  const full = path.join(rootDir, filePath);
  let contents: string;
  try {
    contents = fs.readFileSync(full, "utf8");
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const m of contents.matchAll(REACT_ROUTER_RX)) {
    const p = m[1];
    if (!p) continue;
    if (p === "/" || p.startsWith("/")) paths.push(p);
    else if (p === "*") continue;
    else paths.push("/" + p);
  }
  return paths;
}

export function detectRoutes(nodes: ScannedNode[], rootDir: string): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const node of nodes) {
    const appPath = nextAppRoutePath(node.path);
    if (appPath !== null) {
      routes.push({ path: node.path, routePath: appPath, framework: "next-app" });
      continue;
    }

    const pagesPath = nextPagesRoutePath(node.path);
    if (pagesPath !== null) {
      routes.push({ path: node.path, routePath: pagesPath, framework: "next-pages" });
      continue;
    }

    if (
      node.kind === "screen" ||
      node.kind === "component" ||
      node.kind === "entrypoint" ||
      node.kind === "unknown"
    ) {
      const rrPaths = reactRouterPaths(node.path, rootDir);
      for (const routePath of rrPaths) {
        routes.push({ path: node.path, routePath, framework: "react-router" });
      }
    }
  }

  return routes;
}

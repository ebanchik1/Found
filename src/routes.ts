import fs from "node:fs";
import path from "node:path";
import { parse as babelParse } from "@babel/parser";
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

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function resolveRelativeFile(
  fromFile: string,
  specifier: string,
  knownFiles: Set<string>,
): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return null;
  }
  const fromDir = path.posix.dirname(toPosix(fromFile));
  const joined = toPosix(path.posix.normalize(path.posix.join(fromDir, specifier)));

  if (knownFiles.has(joined)) return joined;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (knownFiles.has(joined + ext)) return joined + ext;
  }
  const stripped = joined.replace(/\.(t|j)sx?$/, "");
  if (knownFiles.has(stripped)) return stripped;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (knownFiles.has(stripped + ext)) return stripped + ext;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const indexed = joined + "/index" + ext;
    if (knownFiles.has(indexed)) return indexed;
  }
  return null;
}

interface ReactRouterTarget {
  routePath: string;
  targetFile: string | null;
}

function collectImports(ast: any): Map<string, string> {
  const imports = new Map<string, string>();
  for (const node of ast.program.body) {
    if (node.type !== "ImportDeclaration") continue;
    const source: string | undefined = node.source?.value;
    if (!source) continue;
    for (const spec of node.specifiers ?? []) {
      if (spec.type === "ImportDefaultSpecifier" || spec.type === "ImportSpecifier") {
        const localName = spec.local?.name;
        if (typeof localName === "string") {
          imports.set(localName, source);
        }
      }
    }
  }
  return imports;
}

function getJsxName(jsxNameNode: any): string | null {
  if (!jsxNameNode) return null;
  if (jsxNameNode.type === "JSXIdentifier") return jsxNameNode.name ?? null;
  return null;
}

function getElementComponentName(elementValueNode: any): string | null {
  if (!elementValueNode) return null;
  if (elementValueNode.type === "JSXExpressionContainer") {
    const expr = elementValueNode.expression;
    if (expr?.type === "JSXElement") {
      return getJsxName(expr.openingElement?.name);
    }
  }
  if (elementValueNode.type === "JSXElement") {
    return getJsxName(elementValueNode.openingElement?.name);
  }
  return null;
}

function findRouteElements(node: any, out: { path: string; component: string | null }[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) findRouteElements(child, out);
    return;
  }

  if (node.type === "JSXElement") {
    const name = getJsxName(node.openingElement?.name);
    if (name === "Route") {
      const attrs = node.openingElement?.attributes ?? [];
      let routePath: string | null = null;
      let componentName: string | null = null;
      for (const attr of attrs) {
        if (attr.type !== "JSXAttribute") continue;
        const attrName = attr.name?.name;
        if (attrName === "path" && attr.value?.type === "StringLiteral") {
          routePath = attr.value.value;
        }
        if (attrName === "element") {
          componentName = getElementComponentName(attr.value);
        }
      }
      if (routePath !== null) {
        if (routePath === "*") {
          // skip catch-all
        } else {
          const normalized = routePath.startsWith("/") ? routePath : "/" + routePath;
          out.push({ path: normalized, component: componentName });
        }
      }
    }
  }

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    findRouteElements(node[key], out);
  }
}

function extractReactRouterRoutes(
  filePath: string,
  rootDir: string,
  knownFiles: Set<string>,
): ReactRouterTarget[] {
  const full = path.join(rootDir, filePath);
  let contents: string;
  try {
    contents = fs.readFileSync(full, "utf8");
  } catch {
    return [];
  }
  if (!contents.includes("<Route")) return [];

  let ast: any;
  try {
    ast = babelParse(contents, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      errorRecovery: true,
      plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"],
    });
  } catch {
    return [];
  }

  const imports = collectImports(ast);
  const raw: { path: string; component: string | null }[] = [];
  findRouteElements(ast.program, raw);

  const out: ReactRouterTarget[] = [];
  for (const r of raw) {
    let target: string | null = null;
    if (r.component) {
      const specifier = imports.get(r.component);
      if (specifier) {
        target = resolveRelativeFile(filePath, specifier, knownFiles);
      }
    }
    out.push({ routePath: r.path, targetFile: target });
  }
  return out;
}

export function detectRoutes(nodes: ScannedNode[], rootDir: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const knownFiles = new Set(nodes.map((n) => toPosix(n.path)));

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
      const rrTargets = extractReactRouterRoutes(node.path, rootDir, knownFiles);
      for (const target of rrTargets) {
        routes.push({
          path: target.targetFile ?? node.path,
          routePath: target.routePath,
          framework: "react-router",
        });
      }
    }
  }

  return routes;
}

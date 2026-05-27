import fs from "node:fs";
import path from "node:path";
import { parse as babelParse } from "@babel/parser";
import { cruise } from "dependency-cruiser";
import { DependencyCruiserFailed, CatastrophicParseFailure } from "./errors.js";
import type { Edge, GraphData } from "./types.js";

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

interface BuildGraphOptions {
  rootDir: string;
  files: string[];
}

export async function buildGraph(opts: BuildGraphOptions): Promise<GraphData> {
  try {
    return await buildGraphViaDepCruiser(opts);
  } catch (depCruiserErr) {
    try {
      const fallback = buildGraphViaBabelFallback(opts);
      return fallback;
    } catch (babelErr) {
      throw new CatastrophicParseFailure(babelErr ?? depCruiserErr);
    }
  }
}

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

async function buildGraphViaDepCruiser(opts: BuildGraphOptions): Promise<GraphData> {
  const realRoot = safeRealpath(opts.rootDir);
  const absToRel = new Map<string, string>();
  for (const rel of opts.files) {
    const abs = safeRealpath(path.join(opts.rootDir, rel));
    absToRel.set(abs, toPosix(rel));
  }
  const absFiles = Array.from(absToRel.keys());

  let result;
  try {
    result = await cruise(absFiles, {
      doNotFollow: { path: "node_modules" },
      exclude: { path: "node_modules" },
      tsPreCompilationDeps: true,
    });
  } catch (err) {
    throw new DependencyCruiserFailed(err);
  }

  if (typeof result.output === "string") {
    throw new DependencyCruiserFailed(new Error("dep-cruiser returned string output (expected JSON)"));
  }

  const modules = result.output.modules ?? [];
  const edges: Edge[] = [];
  const seenEdges = new Set<string>();
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();

  function normalizeToKnown(rawPath: string): string | null {
    const abs = path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);
    const real = safeRealpath(abs);
    return absToRel.get(real) ?? null;
  }

  for (const mod of modules) {
    const fromPath = normalizeToKnown(mod.source);
    if (!fromPath) continue;
    for (const dep of mod.dependencies ?? []) {
      const toPath = normalizeToKnown(dep.resolved);
      if (!toPath || toPath === fromPath) continue;
      const key = `${fromPath}->${toPath}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({ from: fromPath, to: toPath });
      fanOut.set(fromPath, (fanOut.get(fromPath) ?? 0) + 1);
      fanIn.set(toPath, (fanIn.get(toPath) ?? 0) + 1);
    }
  }

  return {
    edges,
    fanIn,
    fanOut,
    parserUsed: "dependency-cruiser",
  };
}

const IMPORT_PARSER_PLUGINS = [
  "typescript" as const,
  "jsx" as const,
  "decorators-legacy" as const,
  "classProperties" as const,
];

function buildGraphViaBabelFallback(opts: BuildGraphOptions): GraphData {
  const edges: Edge[] = [];
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  const knownFiles = new Set(opts.files.map(toPosix));

  let successCount = 0;

  for (const file of opts.files) {
    const fullPath = path.join(opts.rootDir, file);
    let source: string;
    try {
      source = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    let ast;
    try {
      ast = babelParse(source, {
        sourceType: "module",
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        errorRecovery: true,
        plugins: IMPORT_PARSER_PLUGINS,
      });
      successCount++;
    } catch {
      continue;
    }

    const importedSpecifiers = new Set<string>();
    for (const node of ast.program.body) {
      if (
        node.type === "ImportDeclaration" ||
        node.type === "ExportAllDeclaration" ||
        (node.type === "ExportNamedDeclaration" && node.source)
      ) {
        const src =
          node.type === "ImportDeclaration"
            ? node.source.value
            : (node.source?.value ?? null);
        if (src) importedSpecifiers.add(src);
      }
    }

    for (const spec of importedSpecifiers) {
      const resolved = resolveRelative(file, spec, knownFiles);
      if (resolved && knownFiles.has(resolved) && resolved !== file) {
        edges.push({ from: file, to: resolved });
        fanOut.set(file, (fanOut.get(file) ?? 0) + 1);
        fanIn.set(resolved, (fanIn.get(resolved) ?? 0) + 1);
      }
    }
  }

  if (successCount === 0) {
    throw new Error("Babel fallback parsed 0 files successfully");
  }

  return {
    edges,
    fanIn,
    fanOut,
    parserUsed: "babel-fallback",
  };
}

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function resolveRelative(
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
  for (const ext of RESOLVE_EXTENSIONS) {
    const indexed = joined + "/index" + ext;
    if (knownFiles.has(indexed)) return indexed;
  }
  return null;
}

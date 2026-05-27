import { globby } from "globby";
import fs from "node:fs";
import path from "node:path";
import { NotAJsProject, MonorepoDetected } from "./errors.js";
import { classifyFromConventions } from "./classify.js";
import type { ScannedNode } from "./types.js";

const SOURCE_PATTERNS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"];

const ALWAYS_IGNORE = [
  "node_modules/**",
  ".next/**",
  ".vercel/**",
  ".turbo/**",
  "dist/**",
  "build/**",
  "out/**",
  "coverage/**",
  ".git/**",
  ".idea/**",
  ".vscode/**",
  "fixtures/**",
  "__fixtures__/**",
  "__mocks__/**",
  "examples/**",
  "example/**",
];

const CONFIG_PATTERNS = [
  "package.json",
  "tsconfig*.json",
  "*.config.js",
  "*.config.ts",
  "*.config.mjs",
  "*.config.cjs",
  ".env",
  ".env.*",
];

export interface ScanResult {
  rootDir: string;
  nodes: ScannedNode[];
  configCount: number;
}

const MONOREPO_SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "fixtures",
  "__fixtures__",
  "__mocks__",
  "examples",
  "example",
]);

function shouldSkipForMonorepoScan(name: string): boolean {
  if (name.startsWith(".")) return true;
  return MONOREPO_SCAN_SKIP_DIRS.has(name);
}

function findPackageJsonFiles(rootDir: string): string[] {
  const found: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (shouldSkipForMonorepoScan(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "package.json") {
        found.push(full);
      } else if (entry.isDirectory()) {
        walk(full, depth + 1);
      }
    }
  }

  if (fs.existsSync(path.join(rootDir, "package.json"))) {
    found.push(path.join(rootDir, "package.json"));
  }
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (shouldSkipForMonorepoScan(entry.name)) continue;
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) walk(full, 1);
  }

  return Array.from(new Set(found));
}

export async function scan(rootDir: string): Promise<ScanResult> {
  const absRoot = path.resolve(rootDir);

  if (!fs.existsSync(absRoot)) {
    throw new NotAJsProject(absRoot);
  }
  const stat = fs.statSync(absRoot);
  if (!stat.isDirectory()) {
    throw new NotAJsProject(absRoot);
  }

  const packageJsons = findPackageJsonFiles(absRoot);
  if (packageJsons.length === 0) {
    throw new NotAJsProject(absRoot);
  }
  if (packageJsons.length > 1) {
    throw new MonorepoDetected(packageJsons);
  }

  const sourceFiles = await globby(SOURCE_PATTERNS, {
    cwd: absRoot,
    gitignore: true,
    ignore: ALWAYS_IGNORE,
    followSymbolicLinks: false,
    absolute: false,
  });

  if (sourceFiles.length === 0) {
    throw new NotAJsProject(absRoot);
  }

  const configFiles = await globby(CONFIG_PATTERNS, {
    cwd: absRoot,
    gitignore: true,
    ignore: ALWAYS_IGNORE,
    followSymbolicLinks: false,
    absolute: false,
    dot: true,
  });

  const nodes: ScannedNode[] = sourceFiles.map((filePath) => {
    const cls = classifyFromConventions(filePath);
    return {
      path: filePath,
      kind: cls.kind,
      userFacing: cls.userFacing,
    };
  });

  return {
    rootDir: absRoot,
    nodes,
    configCount: configFiles.length,
  };
}

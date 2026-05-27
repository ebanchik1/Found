import fs from "node:fs";
import path from "node:path";
import { parse as babelParse } from "@babel/parser";

export interface FileExports {
  hasDefault: boolean;
  named: string[];
}

const PARSER_PLUGINS = [
  "typescript" as const,
  "jsx" as const,
  "decorators-legacy" as const,
  "classProperties" as const,
];

export function extractExports(rootDir: string, filePath: string): FileExports {
  const empty: FileExports = { hasDefault: false, named: [] };
  const full = path.join(rootDir, filePath);
  let source: string;
  try {
    source = fs.readFileSync(full, "utf8");
  } catch {
    return empty;
  }

  let ast: any;
  try {
    ast = babelParse(source, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      errorRecovery: true,
      plugins: PARSER_PLUGINS,
    });
  } catch {
    return empty;
  }

  const named = new Set<string>();
  let hasDefault = false;

  for (const node of ast.program?.body ?? []) {
    if (!node || typeof node !== "object") continue;

    if (node.type === "ExportDefaultDeclaration") {
      hasDefault = true;
      continue;
    }

    if (node.type === "ExportNamedDeclaration") {
      for (const spec of node.specifiers ?? []) {
        if (spec.type === "ExportSpecifier") {
          const exported = spec.exported?.name ?? spec.exported?.value;
          if (typeof exported === "string") named.add(exported);
        }
        if (spec.type === "ExportDefaultSpecifier" || spec.type === "ExportNamespaceSpecifier") {
          if (spec.exported?.name) named.add(spec.exported.name);
        }
      }
      if (node.declaration) {
        const decl = node.declaration;
        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations ?? []) {
            if (d.id?.type === "Identifier" && d.id.name) named.add(d.id.name);
          }
        } else if (
          (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") &&
          decl.id?.name
        ) {
          named.add(decl.id.name);
        } else if (
          decl.type === "TSTypeAliasDeclaration" ||
          decl.type === "TSInterfaceDeclaration" ||
          decl.type === "TSEnumDeclaration"
        ) {
          if (decl.id?.name) named.add(decl.id.name);
        }
      }
      continue;
    }

    if (node.type === "ExportAllDeclaration") {
      continue;
    }
  }

  return { hasDefault, named: Array.from(named).sort() };
}

export function extractAllExports(
  rootDir: string,
  files: string[],
): Map<string, FileExports> {
  const out = new Map<string, FileExports>();
  for (const file of files) {
    out.set(file, extractExports(rootDir, file));
  }
  return out;
}

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildGraph } from "./graph.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function mkTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "found-graph-test-"));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("buildGraph", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTempProject();
    writeFile(tmpDir, "package.json", JSON.stringify({ type: "module" }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("builds edges for relative imports", async () => {
    writeFile(tmpDir, "src/a.ts", `import { b } from "./b.js"; export const a = b;`);
    writeFile(tmpDir, "src/b.ts", `export const b = 1;`);

    const result = await buildGraph({
      rootDir: tmpDir,
      files: ["src/a.ts", "src/b.ts"],
    });

    expect(result.edges).toContainEqual({ from: "src/a.ts", to: "src/b.ts" });
    expect(result.fanIn.get("src/b.ts")).toBe(1);
    expect(result.fanOut.get("src/a.ts")).toBe(1);
  });

  it("ignores external npm imports", async () => {
    writeFile(tmpDir, "src/a.ts", `import React from "react"; export const a = React;`);

    const result = await buildGraph({
      rootDir: tmpDir,
      files: ["src/a.ts"],
    });

    expect(result.edges).toHaveLength(0);
  });

  it("computes fan-in for shared helpers", async () => {
    writeFile(tmpDir, "src/lib/db.ts", `export const db = {};`);
    writeFile(tmpDir, "src/a.ts", `import { db } from "./lib/db.js"; export const a = db;`);
    writeFile(tmpDir, "src/b.ts", `import { db } from "./lib/db.js"; export const b = db;`);
    writeFile(tmpDir, "src/c.ts", `import { db } from "./lib/db.js"; export const c = db;`);

    const result = await buildGraph({
      rootDir: tmpDir,
      files: ["src/lib/db.ts", "src/a.ts", "src/b.ts", "src/c.ts"],
    });

    expect(result.fanIn.get("src/lib/db.ts")).toBe(3);
  });

  it("returns parserUsed: dependency-cruiser on success", async () => {
    writeFile(tmpDir, "src/a.ts", `export const a = 1;`);
    const result = await buildGraph({ rootDir: tmpDir, files: ["src/a.ts"] });
    expect(result.parserUsed).toBe("dependency-cruiser");
  });

  it("handles empty graphs without crashing", async () => {
    writeFile(tmpDir, "src/lonely.ts", `export const x = 1;`);
    const result = await buildGraph({ rootDir: tmpDir, files: ["src/lonely.ts"] });
    expect(result.edges).toHaveLength(0);
  });
});

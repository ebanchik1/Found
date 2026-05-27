import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scan } from "./scan.js";
import { NotAJsProject, MonorepoDetected } from "./errors.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function mkTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "found-scan-test-"));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("scan", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects non-existent paths", async () => {
    await expect(scan("/this/path/does/not/exist")).rejects.toBeInstanceOf(NotAJsProject);
  });

  it("rejects directories with no package.json", async () => {
    writeFile(tmpDir, "foo.ts", "export const x = 1;");
    await expect(scan(tmpDir)).rejects.toBeInstanceOf(NotAJsProject);
  });

  it("rejects directories with package.json but no source files", async () => {
    writeFile(tmpDir, "package.json", "{}");
    await expect(scan(tmpDir)).rejects.toBeInstanceOf(NotAJsProject);
  });

  it("detects monorepos with multiple package.json files", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "packages/a/package.json", "{}");
    writeFile(tmpDir, "packages/a/index.ts", "export const x = 1;");
    await expect(scan(tmpDir)).rejects.toBeInstanceOf(MonorepoDetected);
  });

  it("scans a basic Next.js app router project", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "app/page.tsx", "export default function Page() { return null; }");
    writeFile(tmpDir, "app/login/page.tsx", "export default function Login() { return null; }");
    writeFile(tmpDir, "src/lib/db.ts", "export const db = {};");

    const result = await scan(tmpDir);
    expect(result.nodes).toHaveLength(3);
    const screens = result.nodes.filter((n) => n.kind === "screen");
    expect(screens).toHaveLength(2);
    const helpers = result.nodes.filter((n) => n.kind === "helper");
    expect(helpers).toHaveLength(1);
  });

  it("skips node_modules / .next / dist / build", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "app/page.tsx", "export default function Page() { return null; }");
    writeFile(tmpDir, "node_modules/some-pkg/index.ts", "// noise");
    writeFile(tmpDir, ".next/cache/foo.ts", "// noise");
    writeFile(tmpDir, "dist/main.js", "// noise");
    writeFile(tmpDir, "build/output.ts", "// noise");

    const result = await scan(tmpDir);
    expect(result.nodes.map((n) => n.path).filter((p) => p.includes("node_modules"))).toHaveLength(0);
    expect(result.nodes.map((n) => n.path).filter((p) => p.includes(".next"))).toHaveLength(0);
    expect(result.nodes.map((n) => n.path).filter((p) => p.startsWith("dist/"))).toHaveLength(0);
    expect(result.nodes.map((n) => n.path).filter((p) => p.startsWith("build/"))).toHaveLength(0);
  });

  it("respects .gitignore", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "app/page.tsx", "export default function Page() { return null; }");
    writeFile(tmpDir, ".gitignore", "ignored/\n");
    writeFile(tmpDir, "ignored/secret.ts", "// secret");

    const result = await scan(tmpDir);
    expect(result.nodes.map((n) => n.path).filter((p) => p.includes("ignored"))).toHaveLength(0);
  });

  it("counts config files separately", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "tsconfig.json", "{}");
    writeFile(tmpDir, "next.config.js", "module.exports = {};");
    writeFile(tmpDir, "app/page.tsx", "export default function Page() { return null; }");

    const result = await scan(tmpDir);
    expect(result.configCount).toBeGreaterThanOrEqual(3);
  });
});

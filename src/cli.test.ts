import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { main } from "./cli.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function mkTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "found-cli-test-"));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("cli", () => {
  let tmpDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdout = "";
  let stderr = "";

  beforeEach(() => {
    tmpDir = mkTempProject();
    stdout = "";
    stderr = "";
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdout += chunk.toString();
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderr += chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("exits 2 with friendly message for non-existent path", async () => {
    const code = await main(["/this/does/not/exist"]);
    expect(code).toBe(2);
    expect(stderr).toContain("doesn't recognize");
    expect(stderr).not.toMatch(/\n\s+at\s+\S+:\d+:\d+/);
    expect(stderr).not.toContain("--- debug ---");
  });

  it("exits 3 with friendly message for monorepo", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "packages/a/package.json", "{}");
    writeFile(tmpDir, "packages/a/index.ts", "export const x = 1;");
    const code = await main([tmpDir]);
    expect(code).toBe(3);
    expect(stderr).toContain("monorepo");
  });

  it("--debug exposes stack traces beneath friendly message", async () => {
    const code = await main(["/this/does/not/exist", "--debug"]);
    expect(code).toBe(2);
    expect(stderr).toContain("doesn't recognize");
    expect(stderr).toContain("debug");
  });

  it("happy path renders human text by default", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "app/page.tsx", "export default function Page() { return null; }");
    writeFile(tmpDir, "app/login/page.tsx", "export default function Login() { return null; }");
    const code = await main([tmpDir]);
    expect(code).toBe(0);
    expect(stdout).toContain("Your app is");
    expect(stdout).toContain("login screen");
  });

  it("--json emits JSON without human text", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "app/page.tsx", "export default function Page() { return null; }");
    const code = await main([tmpDir, "--json"]);
    expect(code).toBe(0);
    expect(stdout).toContain('"version": "0.1"');
    expect(stdout).not.toContain("Your app is");
  });

  it("promotes App.tsx to a screen when project is a no-router SPA", async () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(
      tmpDir,
      "src/main.tsx",
      `import App from "./App"; export default App;`,
    );
    writeFile(
      tmpDir,
      "src/App.tsx",
      `export default function App() { return <div>Single-page app</div>; }`,
    );
    const code = await main([tmpDir]);
    expect(code).toBe(0);
    expect(stdout).toContain("1 screen");
    expect(stdout).not.toContain("didn't see any screens");
  });
});

import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";

describe("cli — bin entry point (regression: silent no-op via symlink)", () => {
  let tmpDir: string;
  let symlinkPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "found-bin-test-"));
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "app", "page.tsx"),
      "export default function Page() { return null; }",
    );
    symlinkPath = path.join(tmpDir, "my-found-bin");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("invoking the bin via a differently-named symlink still runs main()", () => {
    const distCli = path.resolve(__dirname, "..", "dist", "cli.js");
    if (!fs.existsSync(distCli)) {
      console.warn("Skipping bin test: dist/cli.js not built. Run `npm run build` first.");
      return;
    }
    fs.symlinkSync(distCli, symlinkPath);
    fs.chmodSync(distCli, 0o755);
    const result = spawnSync(symlinkPath, [tmpDir], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Your app is");
  });
});

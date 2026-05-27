import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractExports } from "./exports.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "found-exports-test-"));
}

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("extractExports", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects a default export", () => {
    writeFile(tmp, "a.ts", `export default function foo() {}`);
    const result = extractExports(tmp, "a.ts");
    expect(result.hasDefault).toBe(true);
    expect(result.named).toEqual([]);
  });

  it("detects named exports of const/let/var", () => {
    writeFile(tmp, "a.ts", `export const a = 1; export const b = 2;`);
    expect(extractExports(tmp, "a.ts").named.sort()).toEqual(["a", "b"]);
  });

  it("detects named function and class exports", () => {
    writeFile(tmp, "a.ts", `export function foo() {} export class Bar {}`);
    expect(extractExports(tmp, "a.ts").named.sort()).toEqual(["Bar", "foo"]);
  });

  it("detects re-exports via export { ... }", () => {
    writeFile(tmp, "a.ts", `const x = 1; const y = 2; export { x, y };`);
    expect(extractExports(tmp, "a.ts").named.sort()).toEqual(["x", "y"]);
  });

  it("detects exported types and interfaces", () => {
    writeFile(tmp, "a.ts", `export interface Foo {} export type Bar = string;`);
    expect(extractExports(tmp, "a.ts").named.sort()).toEqual(["Bar", "Foo"]);
  });

  it("combines default and named in one file", () => {
    writeFile(tmp, "a.ts", `export default function Page() {} export const meta = {};`);
    const result = extractExports(tmp, "a.ts");
    expect(result.hasDefault).toBe(true);
    expect(result.named).toEqual(["meta"]);
  });

  it("returns empty for missing files", () => {
    const result = extractExports(tmp, "missing.ts");
    expect(result.hasDefault).toBe(false);
    expect(result.named).toEqual([]);
  });

  it("handles malformed source gracefully (no throw)", () => {
    writeFile(tmp, "broken.ts", `export const x = ; { broken`);
    expect(() => extractExports(tmp, "broken.ts")).not.toThrow();
  });

  it("handles JSX/TSX", () => {
    writeFile(
      tmp,
      "Page.tsx",
      `export default function Page() { return <div/>; }
       export const meta = { title: "Hello" };`,
    );
    const result = extractExports(tmp, "Page.tsx");
    expect(result.hasDefault).toBe(true);
    expect(result.named).toEqual(["meta"]);
  });
});

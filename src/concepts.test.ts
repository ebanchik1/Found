import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { detectConcepts } from "./concepts.js";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "found-concepts-test-"));
}

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("detectConcepts — package.json", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects React + Next.js from package.json", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({
        dependencies: { react: "^19.0.0", next: "^15.0.0" },
      }),
    );
    const result = detectConcepts(tmp, []);
    const ids = result.tags.map((t) => t.id);
    expect(ids).toContain("react");
    expect(ids).toContain("nextjs");
  });

  it("detects scoped packages by prefix", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({
        dependencies: { "@radix-ui/react-dialog": "^1.0.0", "@clerk/nextjs": "^5.0.0" },
      }),
    );
    const ids = detectConcepts(tmp, []).tags.map((t) => t.id);
    expect(ids).toContain("radix-ui");
    expect(ids).toContain("clerk");
  });

  it("detects Anthropic SDK and Vercel AI SDK distinctly", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({
        dependencies: { "@anthropic-ai/sdk": "^0.40.0", ai: "^4.0.0" },
      }),
    );
    const ids = detectConcepts(tmp, []).tags.map((t) => t.id);
    expect(ids).toContain("anthropic-sdk");
    expect(ids).toContain("vercel-ai-sdk");
  });

  it("handles missing package.json gracefully", () => {
    expect(() => detectConcepts(tmp, [])).not.toThrow();
    const result = detectConcepts(tmp, []);
    expect(result.tags).toEqual([]);
  });

  it("ignores irrelevant packages", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({ dependencies: { "some-random-thing": "1.0.0" } }),
    );
    expect(detectConcepts(tmp, []).tags).toEqual([]);
  });
});

describe("detectConcepts — language detection", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
    writeFile(tmp, "package.json", "{}");
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects TypeScript when any .ts/.tsx file is present", () => {
    const result = detectConcepts(tmp, ["src/a.ts"]);
    expect(result.tags.find((t) => t.id === "typescript")).toBeDefined();
  });

  it("detects JavaScript when only .js files present", () => {
    const result = detectConcepts(tmp, ["src/a.js"]);
    expect(result.tags.find((t) => t.id === "javascript")).toBeDefined();
  });

  it("prefers TypeScript when mixed", () => {
    const result = detectConcepts(tmp, ["src/a.js", "src/b.ts"]);
    expect(result.tags.find((t) => t.id === "typescript")).toBeDefined();
    expect(result.tags.find((t) => t.id === "javascript")).toBeUndefined();
  });
});

describe("detectConcepts — source patterns", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects React hooks usage when React is a dep", () => {
    writeFile(tmp, "package.json", JSON.stringify({ dependencies: { react: "^19.0.0" } }));
    writeFile(
      tmp,
      "src/Counter.tsx",
      `import { useState, useEffect } from 'react';
       export function Counter() { const [n, setN] = useState(0); useEffect(() => {}, []); return <div>{n}</div>; }`,
    );
    const result = detectConcepts(tmp, ["src/Counter.tsx"]);
    const hookTag = result.tags.find((t) => t.id === "react-hooks");
    expect(hookTag).toBeDefined();
    expect(hookTag?.detectedIn).toContain("src/Counter.tsx");
  });

  it("does NOT match react-hooks when React is not a dep", () => {
    writeFile(tmp, "package.json", JSON.stringify({ dependencies: {} }));
    writeFile(tmp, "src/some.ts", `function fake() { return useState(0); }`);
    const result = detectConcepts(tmp, ["src/some.ts"]);
    expect(result.tags.find((t) => t.id === "react-hooks")).toBeUndefined();
  });

  it("detects Anthropic streaming when SDK is present", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({ dependencies: { "@anthropic-ai/sdk": "^0.40.0" } }),
    );
    writeFile(
      tmp,
      "api/chat.ts",
      `import Anthropic from '@anthropic-ai/sdk';
       const client = new Anthropic();
       export async function handler() {
         const stream = await client.messages.stream({ model: 'claude-haiku', messages: [] });
       }`,
    );
    const result = detectConcepts(tmp, ["api/chat.ts"]);
    expect(result.tags.find((t) => t.id === "anthropic-streaming")).toBeDefined();
  });

  it("detects prompt caching when cache_control: ephemeral is present", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({ dependencies: { "@anthropic-ai/sdk": "^0.40.0" } }),
    );
    writeFile(
      tmp,
      "api/chat.ts",
      `client.messages.create({ system: [{ type: 'text', text: 'big', cache_control: { type: 'ephemeral' } }] });`,
    );
    const result = detectConcepts(tmp, ["api/chat.ts"]);
    expect(result.tags.find((t) => t.id === "prompt-caching")).toBeDefined();
  });

  it("detects 'use client' directive only with Next.js", () => {
    writeFile(tmp, "package.json", JSON.stringify({ dependencies: { next: "^15.0.0" } }));
    writeFile(tmp, "app/page.tsx", `'use client';\nexport default function Page() { return null; }`);
    const result = detectConcepts(tmp, ["app/page.tsx"]);
    expect(result.tags.find((t) => t.id === "client-components")).toBeDefined();
  });

  it("populates byFile with the ids that matched", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    );
    writeFile(tmp, "src/A.tsx", `import { useState } from 'react'; export const A = () => useState(0);`);
    const result = detectConcepts(tmp, ["src/A.tsx"]);
    expect(result.byFile.get("src/A.tsx")).toContain("react-hooks");
  });

  it("skips files larger than 200KB (perf guard)", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    );
    const big = "useState(0);\n".repeat(20_000);
    writeFile(tmp, "src/Huge.tsx", big);
    const result = detectConcepts(tmp, ["src/Huge.tsx"]);
    expect(result.tags.find((t) => t.id === "react-hooks")).toBeUndefined();
  });
});

describe("detectConcepts — ordering", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("groups tags by category in a sensible order", () => {
    writeFile(
      tmp,
      "package.json",
      JSON.stringify({
        dependencies: {
          react: "^19.0.0",
          tailwindcss: "^3.0.0",
          "@anthropic-ai/sdk": "^0.40.0",
        },
      }),
    );
    const result = detectConcepts(tmp, ["src/a.ts"]);
    const ids = result.tags.map((t) => t.id);
    const typescriptIdx = ids.indexOf("typescript");
    const reactIdx = ids.indexOf("react");
    const tailwindIdx = ids.indexOf("tailwind");
    const anthropicIdx = ids.indexOf("anthropic-sdk");
    expect(typescriptIdx).toBeLessThan(reactIdx);
    expect(reactIdx).toBeLessThan(tailwindIdx);
    expect(tailwindIdx).toBeLessThan(anthropicIdx);
  });
});

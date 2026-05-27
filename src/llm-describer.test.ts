import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LLMDescriber, type AnthropicLike } from "./llm-describer.js";
import type { GraphData, RouteInfo, ScannedNode } from "./types.js";

function mockClient(textBlocks: string[]): AnthropicLike {
  return {
    messages: {
      async create() {
        return {
          content: textBlocks.map((t) => ({ type: "text", text: t })),
        };
      },
    },
  };
}

function failingClient(error: Error): AnthropicLike {
  return {
    messages: {
      async create() {
        throw error;
      },
    },
  };
}

function makeGraph(): GraphData {
  return {
    edges: [],
    fanIn: new Map(),
    fanOut: new Map(),
    parserUsed: "dependency-cruiser",
  };
}

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "found-llm-test-"));
}

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("LLMDescriber", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
    writeFile(tmp, "src/login.ts", `export const login = () => {};`);
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("calls the LLM and merges results with the fallback metadata", async () => {
    const stub = JSON.stringify({
      labels: [
        {
          path: "src/login.ts",
          name: "The login flow",
          does: "Where people sign in to the app.",
          confidence: 0.92,
        },
      ],
    });
    const client = mockClient([stub]);
    const describer = new LLMDescriber({ apiKey: "test", rootDir: tmp }, client);
    const nodes: ScannedNode[] = [
      { path: "src/login.ts", kind: "screen", userFacing: true },
    ];

    const out = await describer.describe(nodes, makeGraph(), []);
    expect(out[0]?.name).toBe("The login flow");
    expect(out[0]?.does).toContain("sign in");
    expect(out[0]?.confidence).toBeCloseTo(0.92, 2);
    expect(out[0]?.confidenceSource).toBe("model");
  });

  it("strips markdown code fences from the LLM response", async () => {
    const stub = '```json\n{"labels":[{"path":"src/login.ts","name":"X","does":"Y","confidence":0.8}]}\n```';
    const client = mockClient([stub]);
    const describer = new LLMDescriber({ apiKey: "test", rootDir: tmp }, client);
    const out = await describer.describe(
      [{ path: "src/login.ts", kind: "helper", userFacing: false }],
      makeGraph(),
      [],
    );
    expect(out[0]?.name).toBe("X");
  });

  it("falls back to convention labels when the API call throws", async () => {
    const client = failingClient(new Error("network down"));
    const describer = new LLMDescriber({ apiKey: "test", rootDir: tmp }, client);
    const out = await describer.describe(
      [{ path: "src/login.ts", kind: "helper", userFacing: false }],
      makeGraph(),
      [],
    );
    expect(out[0]?.name).toBeTruthy();
    expect(out[0]?.confidenceSource).not.toBe("model");
  });

  it("falls back when the LLM returns malformed JSON", async () => {
    const client = mockClient(["this is not json at all, no braces here"]);
    const describer = new LLMDescriber({ apiKey: "test", rootDir: tmp }, client);
    const out = await describer.describe(
      [{ path: "src/login.ts", kind: "helper", userFacing: false }],
      makeGraph(),
      [],
    );
    expect(out[0]?.name).toBeTruthy();
    expect(out[0]?.confidenceSource).not.toBe("model");
  });

  it("preserves convention label for nodes the LLM omits", async () => {
    const stub = JSON.stringify({
      labels: [
        {
          path: "src/login.ts",
          name: "Login",
          does: "Sign-in.",
          confidence: 0.9,
        },
      ],
    });
    writeFile(tmp, "src/extra.ts", `export const extra = 1;`);
    const client = mockClient([stub]);
    const describer = new LLMDescriber({ apiKey: "test", rootDir: tmp }, client);
    const out = await describer.describe(
      [
        { path: "src/login.ts", kind: "helper", userFacing: false },
        { path: "src/extra.ts", kind: "helper", userFacing: false },
      ],
      makeGraph(),
      [],
    );
    const login = out.find((n) => n.path === "src/login.ts");
    const extra = out.find((n) => n.path === "src/extra.ts");
    expect(login?.confidenceSource).toBe("model");
    expect(extra?.confidenceSource).not.toBe("model");
  });
});

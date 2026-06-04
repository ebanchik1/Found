import fs from "node:fs";
import path from "node:path";

export type ConceptCategory =
  | "language"
  | "frontend"
  | "styling"
  | "ai"
  | "state"
  | "data"
  | "backend"
  | "database"
  | "auth"
  | "testing"
  | "deployment"
  | "tooling"
  | "other";

export interface ConceptTag {
  id: string;
  category: ConceptCategory;
  label: string;
  source: "package" | "pattern" | "filesystem";
  confidence: number;
  detectedIn: string[];
}

export interface ProjectConcepts {
  tags: ConceptTag[];
  byFile: Map<string, string[]>;
}

interface PackageRule {
  id: string;
  category: ConceptCategory;
  label: string;
  match: { name?: string; prefix?: string };
}

interface PatternRule {
  id: string;
  category: ConceptCategory;
  label: string;
  pattern: RegExp;
  fileMatch?: RegExp;
  requires?: string[];
}

const PACKAGE_RULES: PackageRule[] = [
  { id: "react", category: "frontend", label: "React", match: { name: "react" } },
  { id: "nextjs", category: "frontend", label: "Next.js", match: { name: "next" } },
  { id: "vite", category: "frontend", label: "Vite", match: { name: "vite" } },
  { id: "vue", category: "frontend", label: "Vue", match: { name: "vue" } },
  { id: "svelte", category: "frontend", label: "Svelte", match: { name: "svelte" } },
  { id: "solidjs", category: "frontend", label: "Solid", match: { name: "solid-js" } },
  { id: "remix", category: "frontend", label: "Remix", match: { prefix: "@remix-run/" } },
  { id: "gatsby", category: "frontend", label: "Gatsby", match: { name: "gatsby" } },
  { id: "astro", category: "frontend", label: "Astro", match: { name: "astro" } },
  { id: "react-router", category: "frontend", label: "React Router", match: { name: "react-router-dom" } },
  { id: "tanstack-router", category: "frontend", label: "TanStack Router", match: { name: "@tanstack/react-router" } },

  { id: "tailwind", category: "styling", label: "Tailwind CSS", match: { name: "tailwindcss" } },
  { id: "styled-components", category: "styling", label: "styled-components", match: { name: "styled-components" } },
  { id: "emotion", category: "styling", label: "Emotion", match: { prefix: "@emotion/" } },
  { id: "sass", category: "styling", label: "Sass", match: { name: "sass" } },
  { id: "radix-ui", category: "styling", label: "Radix UI", match: { prefix: "@radix-ui/" } },
  { id: "shadcn-icons", category: "styling", label: "Lucide icons", match: { name: "lucide-react" } },
  { id: "framer-motion", category: "styling", label: "Framer Motion", match: { name: "framer-motion" } },
  { id: "headlessui", category: "styling", label: "Headless UI", match: { prefix: "@headlessui/" } },
  { id: "chakra", category: "styling", label: "Chakra UI", match: { prefix: "@chakra-ui/" } },
  { id: "mui", category: "styling", label: "Material UI", match: { prefix: "@mui/" } },

  { id: "openai-sdk", category: "ai", label: "OpenAI SDK", match: { name: "openai" } },
  { id: "anthropic-sdk", category: "ai", label: "Anthropic Claude SDK", match: { name: "@anthropic-ai/sdk" } },
  { id: "google-genai", category: "ai", label: "Google Generative AI", match: { prefix: "@google/generative-ai" } },
  { id: "vercel-ai-sdk", category: "ai", label: "Vercel AI SDK", match: { name: "ai" } },
  { id: "langchain", category: "ai", label: "LangChain", match: { name: "langchain" } },
  { id: "langchain-core", category: "ai", label: "LangChain", match: { prefix: "@langchain/" } },
  { id: "llamaindex", category: "ai", label: "LlamaIndex", match: { name: "llamaindex" } },
  { id: "pinecone", category: "ai", label: "Pinecone vector DB", match: { prefix: "@pinecone-database/" } },
  { id: "qdrant", category: "ai", label: "Qdrant vector DB", match: { prefix: "@qdrant/" } },
  { id: "pgvector", category: "ai", label: "pgvector", match: { name: "pgvector" } },
  { id: "chromadb", category: "ai", label: "ChromaDB", match: { name: "chromadb" } },
  { id: "ai-sdk-anthropic", category: "ai", label: "Vercel AI SDK + Anthropic", match: { name: "@ai-sdk/anthropic" } },
  { id: "ai-sdk-openai", category: "ai", label: "Vercel AI SDK + OpenAI", match: { name: "@ai-sdk/openai" } },

  { id: "redux", category: "state", label: "Redux", match: { name: "@reduxjs/toolkit" } },
  { id: "redux-legacy", category: "state", label: "Redux (legacy)", match: { name: "redux" } },
  { id: "zustand", category: "state", label: "Zustand", match: { name: "zustand" } },
  { id: "jotai", category: "state", label: "Jotai", match: { name: "jotai" } },
  { id: "recoil", category: "state", label: "Recoil", match: { name: "recoil" } },
  { id: "mobx", category: "state", label: "MobX", match: { name: "mobx" } },
  { id: "xstate", category: "state", label: "XState", match: { name: "xstate" } },

  { id: "react-query", category: "data", label: "React Query", match: { name: "@tanstack/react-query" } },
  { id: "swr", category: "data", label: "SWR", match: { name: "swr" } },
  { id: "trpc", category: "data", label: "tRPC", match: { prefix: "@trpc/" } },
  { id: "apollo", category: "data", label: "Apollo GraphQL", match: { prefix: "@apollo/" } },
  { id: "urql", category: "data", label: "URQL", match: { name: "urql" } },
  { id: "axios", category: "data", label: "Axios HTTP client", match: { name: "axios" } },

  { id: "express", category: "backend", label: "Express", match: { name: "express" } },
  { id: "fastify", category: "backend", label: "Fastify", match: { name: "fastify" } },
  { id: "hono", category: "backend", label: "Hono", match: { name: "hono" } },
  { id: "vercel", category: "deployment", label: "Vercel", match: { prefix: "@vercel/" } },
  { id: "vercel-analytics", category: "deployment", label: "Vercel Analytics", match: { name: "@vercel/analytics" } },
  { id: "netlify-functions", category: "deployment", label: "Netlify Functions", match: { prefix: "@netlify/" } },
  { id: "cloudflare-workers", category: "deployment", label: "Cloudflare Workers", match: { name: "wrangler" } },

  { id: "prisma", category: "database", label: "Prisma ORM", match: { name: "prisma" } },
  { id: "prisma-client", category: "database", label: "Prisma ORM", match: { name: "@prisma/client" } },
  { id: "drizzle", category: "database", label: "Drizzle ORM", match: { name: "drizzle-orm" } },
  { id: "supabase", category: "database", label: "Supabase", match: { prefix: "@supabase/" } },
  { id: "mongoose", category: "database", label: "MongoDB (Mongoose)", match: { name: "mongoose" } },
  { id: "firebase", category: "database", label: "Firebase", match: { name: "firebase" } },
  { id: "neon", category: "database", label: "Neon Postgres", match: { prefix: "@neondatabase/" } },
  { id: "postgres", category: "database", label: "node-postgres", match: { name: "pg" } },
  { id: "vercel-postgres", category: "database", label: "Vercel Postgres", match: { name: "@vercel/postgres" } },
  { id: "vercel-kv", category: "database", label: "Vercel KV", match: { name: "@vercel/kv" } },

  { id: "next-auth", category: "auth", label: "NextAuth", match: { name: "next-auth" } },
  { id: "clerk", category: "auth", label: "Clerk", match: { prefix: "@clerk/" } },
  { id: "lucia", category: "auth", label: "Lucia", match: { name: "lucia" } },
  { id: "supabase-auth", category: "auth", label: "Supabase Auth", match: { name: "@supabase/auth-js" } },
  { id: "firebase-auth", category: "auth", label: "Firebase Auth", match: { name: "@firebase/auth" } },

  { id: "vitest", category: "testing", label: "Vitest", match: { name: "vitest" } },
  { id: "jest", category: "testing", label: "Jest", match: { name: "jest" } },
  { id: "playwright", category: "testing", label: "Playwright", match: { prefix: "@playwright/" } },
  { id: "cypress", category: "testing", label: "Cypress", match: { name: "cypress" } },
  { id: "testing-library", category: "testing", label: "Testing Library", match: { prefix: "@testing-library/" } },

  { id: "typescript", category: "language", label: "TypeScript", match: { name: "typescript" } },
  { id: "zod", category: "tooling", label: "Zod (schema validation)", match: { name: "zod" } },
  { id: "stripe", category: "tooling", label: "Stripe", match: { name: "stripe" } },
  { id: "stripe-js", category: "tooling", label: "Stripe (browser)", match: { prefix: "@stripe/" } },
];

const PATTERN_RULES: PatternRule[] = [
  {
    id: "react-hooks",
    category: "frontend",
    label: "React hooks (useState, useEffect, etc.)",
    pattern: /\buse(?:State|Effect|Reducer|Callback|Memo|Ref|Context|LayoutEffect)\s*\(/,
    requires: ["react"],
  },
  {
    id: "react-context",
    category: "state",
    label: "React Context",
    pattern: /\bcreateContext\s*[<(]/,
    requires: ["react"],
  },
  {
    id: "anthropic-streaming",
    category: "ai",
    label: "Streaming LLM responses",
    pattern: /\.(?:stream|messages\.stream)\s*\(/,
    requires: ["anthropic-sdk", "openai-sdk", "vercel-ai-sdk"],
  },
  {
    id: "llm-tool-use",
    category: "ai",
    label: "LLM tool use / function calling",
    pattern: /\btools\s*:\s*\[/,
  },
  {
    id: "embeddings",
    category: "ai",
    label: "Vector embeddings",
    pattern: /\b(?:embeddings\.create|createEmbedding|embedMany|embedText)\s*\(/,
  },
  {
    id: "rag-pattern",
    category: "ai",
    label: "Retrieval-augmented generation (RAG)",
    pattern: /\b(?:vectorStore|similaritySearch|retriever|queryEmbedding|VectorStore)\b/,
  },
  {
    id: "prompt-caching",
    category: "ai",
    label: "Prompt caching",
    pattern: /cache_control\s*:\s*\{[^}]*?ephemeral/,
    requires: ["anthropic-sdk"],
  },
  {
    id: "server-components",
    category: "frontend",
    label: "React Server Components / 'use server'",
    pattern: /^\s*['"]use server['"]/m,
    requires: ["nextjs"],
  },
  {
    id: "client-components",
    category: "frontend",
    label: "Client components ('use client')",
    pattern: /^\s*['"]use client['"]/m,
    requires: ["nextjs"],
  },
  {
    id: "websockets",
    category: "backend",
    label: "WebSockets",
    pattern: /\b(?:new WebSocket|ws:\/\/|wss:\/\/|socket\.io)\b/,
  },
  {
    id: "stripe-checkout",
    category: "tooling",
    label: "Stripe Checkout / payments",
    pattern: /\bstripe\.(?:checkout|paymentIntents|subscriptions)\b/i,
    requires: ["stripe", "stripe-js"],
  },
  {
    id: "tailwind-classnames",
    category: "styling",
    label: "Tailwind class-name utility (cn / clsx)",
    pattern: /\b(?:clsx|twMerge|cn)\s*\(/,
    requires: ["tailwind"],
  },
];

const PACKAGE_LOCK_NAMES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"];

function safeReadJson(p: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function matchesPackage(pkg: string, rule: PackageRule): boolean {
  if (rule.match.name && pkg === rule.match.name) return true;
  if (rule.match.prefix && pkg.startsWith(rule.match.prefix)) return true;
  return false;
}

function detectFromPackageJson(rootDir: string): {
  tags: Map<string, ConceptTag>;
  deps: string[];
} {
  const pkgPath = path.join(rootDir, "package.json");
  const tags = new Map<string, ConceptTag>();
  const allDeps: string[] = [];

  const pkg = safeReadJson(pkgPath);
  if (!pkg) return { tags, deps: allDeps };

  const deps = {
    ...(typeof pkg["dependencies"] === "object" && pkg["dependencies"]
      ? (pkg["dependencies"] as Record<string, string>)
      : {}),
    ...(typeof pkg["devDependencies"] === "object" && pkg["devDependencies"]
      ? (pkg["devDependencies"] as Record<string, string>)
      : {}),
    ...(typeof pkg["peerDependencies"] === "object" && pkg["peerDependencies"]
      ? (pkg["peerDependencies"] as Record<string, string>)
      : {}),
  };
  const depNames = Object.keys(deps);
  allDeps.push(...depNames);

  for (const dep of depNames) {
    for (const rule of PACKAGE_RULES) {
      if (matchesPackage(dep, rule) && !tags.has(rule.id)) {
        tags.set(rule.id, {
          id: rule.id,
          category: rule.category,
          label: rule.label,
          source: "package",
          confidence: 0.95,
          detectedIn: [],
        });
      }
    }
  }

  return { tags, deps: allDeps };
}

function detectLanguage(files: string[]): ConceptTag | null {
  const hasTs = files.some((f) => /\.tsx?$/.test(f));
  if (hasTs) {
    return {
      id: "typescript",
      category: "language",
      label: "TypeScript",
      source: "filesystem",
      confidence: 1,
      detectedIn: [],
    };
  }
  const hasJs = files.some((f) => /\.jsx?$/.test(f));
  if (hasJs) {
    return {
      id: "javascript",
      category: "language",
      label: "JavaScript",
      source: "filesystem",
      confidence: 1,
      detectedIn: [],
    };
  }
  return null;
}

function detectFromSources(
  rootDir: string,
  files: string[],
  presentIds: Set<string>,
): { patternHits: Map<string, ConceptTag>; perFile: Map<string, string[]> } {
  const patternHits = new Map<string, ConceptTag>();
  const perFile = new Map<string, string[]>();

  for (const file of files) {
    const full = path.join(rootDir, file);
    let source: string;
    try {
      source = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (source.length === 0 || source.length > 200_000) continue;

    const hits: string[] = [];
    for (const rule of PATTERN_RULES) {
      if (rule.fileMatch && !rule.fileMatch.test(file)) continue;
      if (rule.requires && !rule.requires.some((id) => presentIds.has(id))) continue;
      if (!rule.pattern.test(source)) continue;

      hits.push(rule.id);
      const existing = patternHits.get(rule.id);
      if (existing) {
        if (!existing.detectedIn.includes(file)) {
          existing.detectedIn.push(file);
        }
      } else {
        patternHits.set(rule.id, {
          id: rule.id,
          category: rule.category,
          label: rule.label,
          source: "pattern",
          confidence: 0.85,
          detectedIn: [file],
        });
      }
    }
    if (hits.length > 0) perFile.set(file, hits);
  }

  return { patternHits, perFile };
}

export function detectConcepts(rootDir: string, files: string[]): ProjectConcepts {
  const fromPkg = detectFromPackageJson(rootDir);

  const language = detectLanguage(files);
  if (language) fromPkg.tags.set(language.id, language);

  const presentIds = new Set(fromPkg.tags.keys());
  const fromSource = detectFromSources(rootDir, files, presentIds);

  const merged = new Map<string, ConceptTag>(fromPkg.tags);
  for (const [id, tag] of fromSource.patternHits) {
    merged.set(id, tag);
  }

  const orderedCategories: ConceptCategory[] = [
    "language",
    "frontend",
    "styling",
    "ai",
    "state",
    "data",
    "backend",
    "database",
    "auth",
    "deployment",
    "testing",
    "tooling",
    "other",
  ];
  const tags = Array.from(merged.values()).sort((a, b) => {
    const aCat = orderedCategories.indexOf(a.category);
    const bCat = orderedCategories.indexOf(b.category);
    if (aCat !== bCat) return aCat - bCat;
    return a.label.localeCompare(b.label);
  });

  return { tags, byFile: fromSource.perFile };
}

export function lockfileTokens(rootDir: string): string[] {
  return PACKAGE_LOCK_NAMES.filter((name) => fs.existsSync(path.join(rootDir, name)));
}

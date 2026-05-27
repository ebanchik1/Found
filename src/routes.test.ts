import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectRoutes } from "./routes.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ScannedNode } from "./types.js";

function mkTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "found-routes-test-"));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function node(p: string, kind: ScannedNode["kind"] = "screen", userFacing = true): ScannedNode {
  return { path: p, kind, userFacing };
}

describe("detectRoutes — Next.js app router", () => {
  it("detects root route from app/page.tsx", () => {
    const routes = detectRoutes([node("app/page.tsx")], "/tmp");
    expect(routes).toContainEqual({
      path: "app/page.tsx",
      routePath: "/",
      framework: "next-app",
    });
  });

  it("detects nested route from app/users/page.tsx", () => {
    const routes = detectRoutes([node("app/users/page.tsx")], "/tmp");
    expect(routes[0]?.routePath).toBe("/users");
  });

  it("preserves dynamic segments [id]", () => {
    const routes = detectRoutes([node("app/users/[id]/page.tsx")], "/tmp");
    expect(routes[0]?.routePath).toBe("/users/[id]");
  });

  it("preserves catch-all [...slug]", () => {
    const routes = detectRoutes([node("app/blog/[...slug]/page.tsx")], "/tmp");
    expect(routes[0]?.routePath).toBe("/blog/[...slug]");
  });

  it("strips route groups (parens)", () => {
    const routes = detectRoutes([node("app/(marketing)/about/page.tsx")], "/tmp");
    expect(routes[0]?.routePath).toBe("/about");
  });

  it("works with .jsx and .js extensions", () => {
    const routes = detectRoutes(
      [node("app/page.jsx"), node("app/about/page.js")],
      "/tmp",
    );
    expect(routes.map((r) => r.routePath).sort()).toEqual(["/", "/about"]);
  });
});

describe("detectRoutes — Next.js pages router", () => {
  it("detects index as root", () => {
    const routes = detectRoutes([node("pages/index.tsx")], "/tmp");
    expect(routes[0]?.routePath).toBe("/");
    expect(routes[0]?.framework).toBe("next-pages");
  });

  it("detects /login from pages/login.tsx", () => {
    const routes = detectRoutes([node("pages/login.tsx")], "/tmp");
    expect(routes[0]?.routePath).toBe("/login");
  });

  it("preserves dynamic segments in pages/users/[id].tsx", () => {
    const routes = detectRoutes([node("pages/users/[id].tsx")], "/tmp");
    expect(routes[0]?.routePath).toBe("/users/[id]");
  });

  it("converts pages/users/index.tsx to /users", () => {
    const routes = detectRoutes([node("pages/users/index.tsx")], "/tmp");
    expect(routes[0]?.routePath).toBe("/users");
  });

  it("excludes _app and _document", () => {
    const routes = detectRoutes(
      [
        node("pages/_app.tsx", "entrypoint"),
        node("pages/_document.tsx", "entrypoint"),
      ],
      "/tmp",
    );
    expect(routes).toHaveLength(0);
  });

  it("excludes pages/api/", () => {
    const routes = detectRoutes(
      [node("pages/api/users.ts", "endpoint", false)],
      "/tmp",
    );
    expect(routes).toHaveLength(0);
  });
});

describe("detectRoutes — React Router declarative", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTempProject();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("extracts <Route path='...'> declarations", () => {
    writeFile(
      tmpDir,
      "src/App.tsx",
      `
      import { Route, Routes } from "react-router-dom";
      export function App() {
        return (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/products/:id" element={<Product />} />
          </Routes>
        );
      }
      `,
    );
    const routes = detectRoutes([node("src/App.tsx", "entrypoint")], tmpDir);
    const paths = routes.map((r) => r.routePath).sort();
    expect(paths).toEqual(["/", "/login", "/products/:id"]);
    expect(routes.every((r) => r.framework === "react-router")).toBe(true);
  });

  it("ignores wildcard '*' routes (catch-all 404s)", () => {
    writeFile(tmpDir, "src/App.tsx", `<Route path="*" element={<NotFound />} />`);
    const routes = detectRoutes([node("src/App.tsx", "entrypoint")], tmpDir);
    expect(routes).toHaveLength(0);
  });

  it("prepends slash to relative paths", () => {
    writeFile(tmpDir, "src/App.tsx", `<Route path="profile" element={<Profile />} />`);
    const routes = detectRoutes([node("src/App.tsx", "entrypoint")], tmpDir);
    expect(routes[0]?.routePath).toBe("/profile");
  });
});

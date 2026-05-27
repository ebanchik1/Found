import { describe, it, expect } from "vitest";
import {
  NotAJsProject,
  MonorepoDetected,
  DependencyCruiserFailed,
  CatastrophicParseFailure,
  UnknownError,
  FoundError,
  wrapUnknown,
} from "./errors.js";

describe("Error classes", () => {
  it("NotAJsProject has exit code 2 and a friendly message", () => {
    const err = new NotAJsProject("/tmp/empty");
    expect(err.exitCode).toBe(2);
    expect(err.friendlyMessage).toContain("doesn't recognize");
    expect(err.suggestedAction).toContain("package.json");
    expect(err).toBeInstanceOf(FoundError);
  });

  it("MonorepoDetected has exit code 3 and lists package.json paths", () => {
    const err = new MonorepoDetected(["/a/package.json", "/b/package.json"]);
    expect(err.exitCode).toBe(3);
    expect(err.packageJsonPaths).toHaveLength(2);
    expect(err.friendlyMessage).toContain("monorepo");
  });

  it("DependencyCruiserFailed has exit code 0 (warn, don't abort)", () => {
    const err = new DependencyCruiserFailed(new Error("parse error"));
    expect(err.exitCode).toBe(0);
    expect(err.friendlyMessage).toContain("less certain");
  });

  it("CatastrophicParseFailure has exit code 4", () => {
    const err = new CatastrophicParseFailure(new Error("everything broke"));
    expect(err.exitCode).toBe(4);
    expect(err.friendlyMessage).toContain("couldn't parse");
  });

  it("UnknownError has exit code 1", () => {
    const err = new UnknownError(new Error("surprise"));
    expect(err.exitCode).toBe(1);
    expect(err.friendlyMessage).toContain("Something went wrong");
  });
});

describe("wrapUnknown", () => {
  it("passes through FoundError instances unchanged", () => {
    const original = new NotAJsProject("/tmp");
    const wrapped = wrapUnknown(original);
    expect(wrapped).toBe(original);
  });

  it("wraps unknown errors as UnknownError", () => {
    const wrapped = wrapUnknown(new Error("boom"));
    expect(wrapped).toBeInstanceOf(UnknownError);
    expect(wrapped.exitCode).toBe(1);
  });

  it("wraps non-Error values as UnknownError", () => {
    const wrapped = wrapUnknown("string error");
    expect(wrapped).toBeInstanceOf(UnknownError);
  });
});

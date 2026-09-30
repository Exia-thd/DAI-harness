import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeQuietly, renameWithRetry } from "../src/fs-safe.js";

function workspace(): string {
  return fs.mkdtempSync(join(tmpdir(), "dai-harness-fs-safe-"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renameWithRetry", () => {
  it("renames on the first attempt when nothing is holding the destination", () => {
    const root = workspace();
    const from = join(root, "staged");
    const to = join(root, "final");
    fs.writeFileSync(from, "payload", "utf8");

    renameWithRetry(from, to);

    expect(fs.readFileSync(to, "utf8")).toBe("payload");
    expect(fs.existsSync(from)).toBe(false);
    removeQuietly(root);
  });

  it("retries a transient failure rather than reporting the rename as failed", () => {
    const root = workspace();
    const from = join(root, "staged");
    const to = join(root, "final");
    fs.writeFileSync(from, "payload", "utf8");
    const rename = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw Object.assign(new Error("EPERM: injected"), { code: "EPERM" });
    });

    renameWithRetry(from, to);

    expect(rename).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(to, "utf8")).toBe("payload");
    removeQuietly(root);
  });

  it("throws once the deadline passes, so an unlanded rename is never reported as done", () => {
    const root = workspace();
    const from = join(root, "staged");
    fs.writeFileSync(from, "payload", "utf8");
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw Object.assign(new Error("EPERM: always"), { code: "EPERM" });
    });

    expect(() => renameWithRetry(from, join(root, "final"), 50)).toThrow(
      "EPERM: always",
    );
    removeQuietly(root);
  });
});

describe("removeQuietly", () => {
  it("removes a directory tree", () => {
    const root = workspace();
    const nested = join(root, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(join(nested, "f.txt"), "x", "utf8");

    removeQuietly(root);

    expect(fs.existsSync(root)).toBe(false);
  });

  it("swallows a failure, because cleanup must never change the caller's result", () => {
    vi.spyOn(fs, "rmSync").mockImplementation(() => {
      throw Object.assign(new Error("EPERM: locked"), { code: "EPERM" });
    });

    expect(() =>
      removeQuietly(join(tmpdir(), "does-not-matter")),
    ).not.toThrow();
  });

  it("does not object to a path that is already gone", () => {
    expect(() =>
      removeQuietly(join(tmpdir(), "dai-harness-fs-safe-absent-path")),
    ).not.toThrow();
  });
});

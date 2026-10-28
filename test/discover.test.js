import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverFiles } from "../src/discover.js";

test("discovers files recursively in sorted, relative paths", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-navigator-"));

  try {
    mkdirSync(path.join(root, "src", "nested"), { recursive: true });
    writeFileSync(path.join(root, "README.md"), "project");
    writeFileSync(path.join(root, "src", "index.js"), "entry");
    writeFileSync(path.join(root, "src", "nested", "module.js"), "module");

    assert.deepEqual(discoverFiles(root), [
      "README.md",
      "src/index.js",
      "src/nested/module.js",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not enter common generated and dependency directories", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-navigator-"));

  try {
    mkdirSync(path.join(root, "node_modules", "package"), { recursive: true });
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "node_modules", "package", "index.js"), "ignored");
    writeFileSync(path.join(root, "src", "app.js"), "included");

    assert.deepEqual(discoverFiles(root), ["src/app.js"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores common generated directories and non-source files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-navigator-"));

  try {
    const ignoredDirectories = [
      ".cache",
      ".git",
      ".next",
      "build",
      "coverage",
      "dist",
      "node_modules",
      "out",
      "target",
      "vendor",
    ];
    for (const directory of ignoredDirectories) {
      mkdirSync(path.join(root, directory), { recursive: true });
      writeFileSync(path.join(root, directory, "hidden.js"), "ignored");
    }

    writeFileSync(path.join(root, "app.js"), "useful");
    writeFileSync(path.join(root, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(root, "bundle.min.js"), "generated");
    writeFileSync(path.join(root, "package-lock.json"), "{}");

    assert.deepEqual(discoverFiles(root), ["app.js"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a path that is not a directory", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-navigator-"));
  const file = path.join(root, "file.txt");
  writeFileSync(file, "not a directory");

  try {
    assert.throws(() => discoverFiles(file), /Not a directory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

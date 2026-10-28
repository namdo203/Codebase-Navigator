import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverFiles } from "../src/discover.js";
import { readAndChunkFiles } from "../src/readChunks.js";
import { splitIntoChunks } from "../src/chunk.js";

test("reads supported text files from discovered paths and preserves chunk metadata", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-navigator-"));

  try {
    writeFileSync(path.join(root, "notes.txt"), "first line\nsecond line\nthird");
    writeFileSync(path.join(root, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const files = discoverFiles(root);
    const chunks = readAndChunkFiles(root, files, { maxChunkChars: 12 });

    assert.deepEqual(chunks, [
      { filePath: "notes.txt", chunkIndex: 0, startLine: 1, endLine: 1, text: "first line\n" },
      { filePath: "notes.txt", chunkIndex: 1, startLine: 2, endLine: 2, text: "second line\n" },
      { filePath: "notes.txt", chunkIndex: 2, startLine: 3, endLine: 3, text: "third" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skips generated text files, archives, and binary data", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-navigator-"));

  try {
    writeFileSync(path.join(root, "app.js"), "useful source");
    writeFileSync(path.join(root, "bundle.min.js"), "generated source");
    writeFileSync(path.join(root, "model.generated.ts"), "generated source");
    writeFileSync(path.join(root, "archive.zip"), "not source");
    writeFileSync(path.join(root, "fake.txt"), Buffer.from([0x61, 0x00, 0x62]));

    const chunks = readAndChunkFiles(root, discoverFiles(root));

    assert.deepEqual(chunks, [
      { filePath: "app.js", chunkIndex: 0, startLine: 1, endLine: 1, text: "useful source" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("splits long lines at the character limit without losing text", () => {
  const text = "abcdefghijklmnopqrstuvwxyz";
  const chunks = splitIntoChunks(text, 10);

  assert.deepEqual(chunks, ["abcdefghij", "klmnopqrst", "uvwxyz"]);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => chunk.length <= 10));
});

test("rejects an invalid chunk size", () => {
  assert.throws(() => readAndChunkFiles(".", [], { maxChunkChars: 0 }), /positive integer/);
});

test("stops chunking at a configured chunk cap", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-navigator-"));

  try {
    writeFileSync(path.join(root, "long.txt"), "a".repeat(100));
    const chunks = readAndChunkFiles(root, ["long.txt"], {
      maxChunkChars: 10,
      maxChunks: 3,
    });

    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks.map(({ chunkIndex }) => chunkIndex), [0, 1, 2]);
    assert.equal(chunks.map(({ text }) => text).join(""), "a".repeat(30));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

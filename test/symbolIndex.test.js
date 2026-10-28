import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chunkFileText } from "../src/readChunks.js";
import {
  buildSymbolIndex,
  loadSymbolChunks,
  retrieveRelevantSymbols,
} from "../src/symbolIndex.js";

test("indexes symbols for lookup by name and file", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-symbol-index-"));

  try {
    writeFileSync(path.join(root, "game.js"), "export function renderBombs() {}");
    const index = buildSymbolIndex(root, ["game.js"]);

    assert.equal(index.indexedFiles, 1);
    assert.equal(index.findByName("renderBombs")[0].filePath, "game.js");
    assert.equal(index.findByFile("game.js")[0].name, "renderBombs");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("matches question terms to camelCase symbols and loads actual source", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-symbol-index-"));

  try {
    const source = "export function renderBombs() {\n  drawBombSprite();\n}";
    writeFileSync(path.join(root, "game.js"), source);
    const index = buildSymbolIndex(root, ["game.js"]);
    const matches = retrieveRelevantSymbols("How are bombs rendered?", index);
    const chunks = loadSymbolChunks(root, matches);

    assert.equal(matches[0].name, "renderBombs");
    assert.equal(chunks[0].filePath, "game.js");
    assert.match(chunks[0].text, /symbol: renderBombs \(function\)/);
    assert.match(chunks[0].text, /lines: 1-3/);
    assert.match(chunks[0].text, /drawBombSprite/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexes symbols beyond the bounded chunk-context file set", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-symbol-index-"));
  const files = [];

  try {
    for (let index = 0; index < 501; index += 1) {
      const filePath = `file-${String(index).padStart(3, "0")}.js`;
      files.push(filePath);
      writeFileSync(
        path.join(root, filePath),
        index === 500
          ? "export function renderBombs() { return drawBomb(); }"
          : `export function helper${index}() {}`,
      );
    }

    const boundedChunks = [];
    const index = buildSymbolIndex(root, files, {
      onFileContent: (filePath, source, fileIndex) => {
        if (fileIndex < 500) {
          boundedChunks.push(...chunkFileText(filePath, source));
        }
      },
    });
    const matches = retrieveRelevantSymbols("How are bombs rendered?", index);
    const sourceChunks = loadSymbolChunks(root, matches);

    assert.equal(index.indexedFiles, 501);
    assert.equal(boundedChunks.some(({ filePath }) => filePath === files[500]), false);
    assert.equal(matches[0].filePath, files[500]);
    assert.match(sourceChunks[0].text, /return drawBomb/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { rankContextCandidates } from "../src/context.js";
import { retrieveChunks } from "../src/retrieve.js";

test("deduplicates repeated keyword and expanded chunks and duplicate symbols", () => {
  const keyword = {
    filePath: "src/game.js",
    chunkIndex: 0,
    text: "renderBombs();",
    score: 2,
  };
  const repeatedKeyword = { ...keyword, text: "different representation, same chunk" };
  const symbol = {
    filePath: "src/game.js",
    chunkIndex: 4,
    text: "symbol: renderBombs (function)\nlines: 5-6\n\nfunction renderBombs() {}",
    symbolName: "renderBombs",
    symbolKind: "function",
    startLine: 5,
    endLine: 6,
    score: 2,
  };
  const duplicateSymbol = { ...symbol, score: 1 };
  const ranked = rankContextCandidates("render bombs", {
    keywordChunks: [keyword],
    symbolChunks: [symbol, duplicateSymbol],
    expandedChunks: [keyword, repeatedKeyword, symbol, duplicateSymbol],
  });

  assert.equal(ranked.length, 2);
  assert.equal(ranked.filter((chunk) => chunk.filePath === "src/game.js" && chunk.symbolName).length, 1);
});

test("ranks direct keyword matches and direct symbol matches above relationships", () => {
  const keyword = {
    filePath: "src/caller.js",
    chunkIndex: 0,
    text: "renderBombs();",
    score: 1,
  };
  const symbol = {
    filePath: "src/bombs.js",
    chunkIndex: 0,
    text: "symbol: renderBombs (function)\nfunction renderBombs() {}",
    symbolName: "renderBombs",
    symbolKind: "function",
    startLine: 1,
    endLine: 1,
    score: 2,
  };
  const related = {
    filePath: "src/draw.js",
    chunkIndex: 0,
    text: "function drawSprite() {}",
  };
  const ranked = rankContextCandidates("How are bombs rendered?", {
    keywordChunks: [keyword],
    symbolChunks: [symbol],
    expandedChunks: [keyword, symbol, related],
  });

  assert.deepEqual(ranked.map(({ filePath }) => filePath), [
    "src/caller.js",
    "src/bombs.js",
    "src/draw.js",
  ]);
  assert.ok(ranked[0].contextScore > ranked[1].contextScore);
  assert.ok(ranked[1].contextScore > ranked[2].contextScore);
});

test("prefers README and package metadata for high-level project questions", () => {
  const metadata = {
    filePath: "README.md",
    chunkIndex: 0,
    text: "Codebase Navigator explains a project using its code.",
  };
  const packageMetadata = {
    filePath: "package.json",
    chunkIndex: 0,
    text: '{"name":"example-app","description":"An example application"}',
  };
  const unrelatedDefinition = {
    filePath: "src/internal.js",
    chunkIndex: 0,
    text: "function privateHelper() { return 1; }",
  };
  const ranked = rankContextCandidates("What does this project do?", {
    expandedChunks: [unrelatedDefinition, packageMetadata, metadata],
  });

  assert.deepEqual(ranked.slice(0, 2).map(({ filePath }) => filePath), [
    "package.json",
    "README.md",
  ]);
});

test("limits the ranked final context", () => {
  const keywordChunks = Array.from({ length: 5 }, (_, index) => ({
    filePath: `src/file${index}.js`,
    chunkIndex: 0,
    text: `keyword ${index}`,
    score: 5 - index,
  }));
  const ranked = rankContextCandidates("keyword", {
    keywordChunks,
    expandedChunks: keywordChunks,
    maxItems: 3,
  });

  assert.equal(ranked.length, 3);
  assert.deepEqual(ranked.map(({ filePath }) => filePath), [
    "src/file0.js",
    "src/file1.js",
    "src/file2.js",
  ]);
});

test("preserves source metadata when ranking candidates", () => {
  const symbol = {
    filePath: "src/game.js",
    chunkIndex: 10,
    text: "function renderBombs() {}",
    symbolName: "renderBombs",
    symbolKind: "function",
    startLine: 11,
    endLine: 14,
    score: 2,
  };
  const [ranked] = rankContextCandidates("render bombs", {
    symbolChunks: [symbol],
  });

  assert.equal(ranked.filePath, "src/game.js");
  assert.equal(ranked.symbolName, "renderBombs");
  assert.equal(ranked.startLine, 11);
  assert.equal(ranked.endLine, 14);
});

test("preserves source ranges through keyword retrieval and final ranking", () => {
  const [retrieved] = retrieveChunks("render bombs", [{
    filePath: "src/game.js",
    chunkIndex: 2,
    startLine: 10,
    endLine: 14,
    text: "renderBombs draws bombs",
  }]);
  const [ranked] = rankContextCandidates("render bombs", {
    keywordChunks: [retrieved],
    expandedChunks: [retrieved],
  });

  assert.equal(ranked.filePath, "src/game.js");
  assert.equal(ranked.chunkIndex, 2);
  assert.equal(ranked.startLine, 10);
  assert.equal(ranked.endLine, 14);
});

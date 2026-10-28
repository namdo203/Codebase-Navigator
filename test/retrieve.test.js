import assert from "node:assert/strict";
import test from "node:test";
import {
  expandRelatedChunks,
  retrieveChunks,
  tokenize,
} from "../src/retrieve.js";

const chunks = [
  {
    filePath: "src/discover.js",
    chunkIndex: 0,
    text: "export function discoverFiles(rootPath) { return files.sort(); }",
  },
  {
    filePath: "src/readChunks.js",
    chunkIndex: 0,
    text: "export function readAndChunkFiles(rootPath, files) { return chunks; }",
  },
  {
    filePath: "README.md",
    chunkIndex: 0,
    text: "The project runs a local command line program.",
  },
];

test("ranks chunks with more matching keywords higher", () => {
  const results = retrieveChunks("How does file discovery sort files?", chunks);

  assert.equal(results[0].filePath, "src/discover.js");
  assert.ok(results[0].score > results[1].score);
});

test("ranks unrelated chunks below relevant chunks", () => {
  const results = retrieveChunks("read chunk files", chunks);

  assert.equal(results[0].filePath, "src/readChunks.js");
  assert.ok(results.every((result) => result.filePath !== "README.md"));
});

test("returns no more than the requested top-K results", () => {
  const results = retrieveChunks("files chunks", chunks, { topK: 1 });

  assert.equal(results.length, 1);
  assert.equal(results[0].filePath, "src/readChunks.js");
});

test("returns no matches when there is no useful keyword overlap", () => {
  assert.deepEqual(retrieveChunks("What color is the moon?", chunks), []);
  assert.deepEqual(retrieveChunks("and the how", chunks), []);
});

test("preserves chunk metadata and adds the overlap score", () => {
  const [result] = retrieveChunks("discover files", chunks);

  assert.deepEqual(result, {
    ...chunks[0],
    score: 2,
  });
});

test("tokenizes camelCase identifiers as separate terms", () => {
  assert.deepEqual(tokenize("readAndChunkFiles"), ["read", "chunk", "files"]);
});

test("rejects an invalid top-K value", () => {
  assert.throws(() => retrieveChunks("files", chunks, { topK: 0 }), /positive integer/);
});

test("retrieves a renderBombs implementation for the bombs question", () => {
  const codeChunks = [
    {
      filePath: "src/scene.js",
      chunkIndex: 0,
      text: "export function drawScene() {\n  renderBombs();\n}",
    },
    {
      filePath: "src/bombs.js",
      chunkIndex: 0,
      text: "export function renderBombs(scene) {\n  scene.draw(bombSprite);\n}",
    },
  ];
  const initial = retrieveChunks("How are bombs rendered?", codeChunks, { topK: 1 });
  const expanded = expandRelatedChunks(initial, codeChunks);

  assert.equal(initial[0].filePath, "src/scene.js");
  assert.equal(expanded.chunks.length, 2);
  assert.equal(expanded.chunks[1].filePath, "src/bombs.js");
  assert.equal(expanded.chunks[1].chunkIndex, 0);
  assert.match(expanded.chunks[1].text, /function renderBombs/);
  assert.deepEqual(expanded.relationships, [
    { symbol: "renderBombs", filePath: "src/bombs.js", chunkIndex: 0 },
  ]);
});

test("supports function declarations, variable arrows, and simple methods", () => {
  const initial = [
    {
      filePath: "src/caller.js",
      chunkIndex: 0,
      text: "renderBombs(); drawShields(); updateScore();",
    },
  ];
  const allChunks = [
    ...initial,
    {
      filePath: "src/helpers.js",
      chunkIndex: 0,
      text: "const renderBombs = (scene) => scene.draw(bomb);",
    },
    {
      filePath: "src/helpers.js",
      chunkIndex: 1,
      text: "let drawShields = function(scene) { scene.draw(shield); };",
    },
    {
      filePath: "src/renderer.js",
      chunkIndex: 0,
      text: "class Renderer {\n  updateScore() {\n    return 1;\n  }\n}",
    },
  ];

  const expanded = expandRelatedChunks(initial, allChunks);

  assert.deepEqual(
    expanded.relationships.map(({ symbol }) => symbol).sort(),
    ["drawShields", "renderBombs", "updateScore"],
  );
  assert.equal(expanded.chunks.length, 4);
});

test("does not duplicate already retrieved or multiply referenced definitions", () => {
  const caller = {
    filePath: "src/caller.js",
    chunkIndex: 0,
    text: "renderBombs(); renderBombs();",
  };
  const definition = {
    filePath: "src/bombs.js",
    chunkIndex: 0,
    text: "function renderBombs() { return; }",
  };
  const expanded = expandRelatedChunks([caller, definition], [caller, definition]);

  assert.equal(expanded.chunks.length, 2);
  assert.deepEqual(expanded.relationships, []);
});

test("ignores missing definitions and does not loop through cyclic references", () => {
  const allChunks = [
    {
      filePath: "src/a.js",
      chunkIndex: 0,
      text: "function start() { continueWork(); missingHelper(); }",
    },
    {
      filePath: "src/b.js",
      chunkIndex: 0,
      text: "function continueWork() { start(); }",
    },
  ];
  const expanded = expandRelatedChunks([allChunks[0]], allChunks);

  assert.equal(expanded.chunks.length, 2);
  assert.deepEqual(expanded.relationships, [
    { symbol: "continueWork", filePath: "src/b.js", chunkIndex: 0 },
  ]);
});

test("finds multiple definition chunks for a referenced name without duplicates", () => {
  const caller = {
    filePath: "src/caller.js",
    chunkIndex: 0,
    text: "renderBombs();",
  };
  const firstDefinition = {
    filePath: "src/first.js",
    chunkIndex: 0,
    text: "function renderBombs() { return 'first'; }",
  };
  const secondDefinition = {
    filePath: "src/second.js",
    chunkIndex: 0,
    text: "const renderBombs = () => 'second';",
  };
  const expanded = expandRelatedChunks(
    [caller],
    [caller, firstDefinition, secondDefinition],
  );

  assert.deepEqual(
    expanded.chunks.map(({ filePath }) => filePath),
    ["src/caller.js", "src/first.js", "src/second.js"],
  );
});

test("limits related definitions and reports when additional matches remain", () => {
  const caller = {
    filePath: "src/caller.js",
    chunkIndex: 0,
    text: "renderA(); renderB(); renderC();",
  };
  const definitions = ["renderA", "renderB", "renderC"].map((symbol, index) => ({
    filePath: `src/${symbol}.js`,
    chunkIndex: 0,
    text: `function ${symbol}() { return ${index}; }`,
  }));
  const expanded = expandRelatedChunks([caller], [caller, ...definitions], {
    maxRelatedDefinitions: 2,
  });

  assert.equal(expanded.relationships.length, 2);
  assert.equal(expanded.chunks.length, 3);
  assert.equal(expanded.limitReached, true);
});

test("preserves visited-symbol protection within the related-definition limit", () => {
  const caller = {
    filePath: "src/caller.js",
    chunkIndex: 0,
    text: "renderA(); renderA();",
  };
  const definition = {
    filePath: "src/renderA.js",
    chunkIndex: 0,
    text: "function renderA() { return; }",
  };
  const expanded = expandRelatedChunks([caller], [caller, definition], {
    maxRelatedDefinitions: 1,
  });

  assert.equal(expanded.relationships.length, 1);
  assert.equal(expanded.limitReached, false);
});

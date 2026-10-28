import assert from "node:assert/strict";
import test from "node:test";
import { formatSources, selectSources } from "../src/sources.js";

test("selects source metadata from ranked context and removes duplicate ranges", () => {
  const context = [
    { filePath: "src/game.js", chunkIndex: 2, startLine: 10, endLine: 20, symbolName: "render" },
    { filePath: "src/game.js", chunkIndex: 2, startLine: 10, endLine: 20, symbolName: "render" },
    { filePath: "src/game.js", chunkIndex: 3, startLine: 21, endLine: 30 },
  ];

  assert.deepEqual(selectSources(context), [
    { filePath: "src/game.js", startLine: 10, endLine: 20, symbolName: "render" },
    { filePath: "src/game.js", startLine: 21, endLine: 30, symbolName: undefined },
  ]);
});

test("formats file paths and inclusive line ranges", () => {
  assert.equal(formatSources([
    { filePath: "src/analyze.js", startLine: 45, endLine: 91 },
  ]), "Sources\n- `src/analyze.js:45-91`");
});

test("respects the configured source limit", () => {
  const context = [
    { filePath: "a.js", startLine: 1, endLine: 2 },
    { filePath: "b.js", startLine: 3, endLine: 4 },
    { filePath: "c.js", startLine: 5, endLine: 6 },
  ];

  assert.equal(selectSources(context, { limit: 2 }).length, 2);
});

test("does not accept citation details from answer text", () => {
  const modelAnswer = "The implementation is here. Sources: fake.js:1-999";
  const trustedSources = selectSources([
    { filePath: "src/real.js", startLine: 12, endLine: 18 },
  ]);
  const output = `${modelAnswer}\n\n${formatSources(trustedSources)}`;

  assert.match(output, /src\/real\.js:12-18/);
  assert.doesNotMatch(formatSources(trustedSources), /fake\.js/);
});

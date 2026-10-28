import assert from "node:assert/strict";
import test from "node:test";
import { extractSymbols, getSymbolSource } from "../src/symbols.js";

test("extracts functions, async functions, and exported declarations", () => {
  const source = [
    "export function renderBombs() {",
    "  drawBomb();",
    "}",
    "",
    "async function loadData() {",
    "  return await fetchData();",
    "}",
    "",
    "export class Game {}",
  ].join("\n");

  assert.deepEqual(
    extractSymbols(source, "game.js").map(({ name, kind, startLine, endLine }) => ({
      name,
      kind,
      startLine,
      endLine,
    })),
    [
      { name: "renderBombs", kind: "function", startLine: 1, endLine: 3 },
      { name: "loadData", kind: "function", startLine: 5, endLine: 7 },
      { name: "Game", kind: "class", startLine: 9, endLine: 9 },
    ],
  );
});

test("extracts arrow functions and function assignments", () => {
  const source = [
    "export const renderBombs = () => {",
    "  return drawBomb();",
    "};",
    "const loadData = function () {",
    "  return readData();",
    "};",
  ].join("\n");
  const symbols = extractSymbols(source, "game.js");

  assert.deepEqual(symbols.map(({ name, kind, startLine, endLine }) => ({
    name,
    kind,
    startLine,
    endLine,
  })), [
    { name: "renderBombs", kind: "function", startLine: 1, endLine: 3 },
    { name: "loadData", kind: "function", startLine: 4, endLine: 6 },
  ]);
});

test("extracts class methods and captures their source", () => {
  const source = [
    "class Game {",
    "  async render() {",
    "    return drawScene();",
    "  }",
    "}",
  ].join("\n");
  const symbols = extractSymbols(source, "game.js");

  assert.deepEqual(symbols.map(({ name, kind, startLine, endLine }) => ({
    name,
    kind,
    startLine,
    endLine,
  })), [
    { name: "Game", kind: "class", startLine: 1, endLine: 5 },
    { name: "render", kind: "method", startLine: 2, endLine: 4 },
  ]);
  assert.equal(getSymbolSource(source, symbols[1]), "  async render() {\n    return drawScene();\n  }");
});

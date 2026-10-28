import { readFileSync } from "node:fs";
import path from "node:path";
import { tokenize } from "./retrieve.js";
import { getSymbolSource, extractSymbols } from "./symbols.js";

function normalizeTerm(term) {
  if (term.length > 4 && term.endsWith("ing")) {
    return term.slice(0, -3);
  }
  if (term.length > 3 && term.endsWith("ed")) {
    return term.slice(0, -2);
  }
  if (term.length > 3 && term.endsWith("s")) {
    return term.slice(0, -1);
  }
  return term;
}

function decodeSource(buffer, filePath) {
  if (buffer.includes(0)) {
    return undefined;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined;
    }
    throw new Error(`Could not decode ${filePath}: ${error.message}`);
  }
}

export function buildSymbolIndex(rootPath, files, {
  onFileContent,
  onProgress,
  progressInterval = 250,
} = {}) {
  const root = path.resolve(rootPath);
  const symbols = [];
  const byName = new Map();
  const byFile = new Map();
  let indexedFiles = 0;

  for (const filePath of files) {
    const absolutePath = path.join(root, filePath);
    let buffer;

    try {
      buffer = readFileSync(absolutePath);
    } catch (error) {
      throw new Error(`Could not read ${filePath}: ${error.message}`);
    }

    const source = decodeSource(buffer, filePath);
    if (source !== undefined) {
      const fileSymbols = extractSymbols(source, filePath);
      byFile.set(filePath, fileSymbols);
      symbols.push(...fileSymbols);

      for (const symbol of fileSymbols) {
        const matchingSymbols = byName.get(symbol.name) ?? [];
        matchingSymbols.push(symbol);
        byName.set(symbol.name, matchingSymbols);
      }

      onFileContent?.(filePath, source, indexedFiles);
    } else {
      byFile.set(filePath, []);
    }

    indexedFiles += 1;
    if (onProgress && indexedFiles % progressInterval === 0) {
      onProgress(indexedFiles, files.length, symbols.length);
    }
  }

  const index = {
    symbols,
    byName,
    byFile,
    indexedFiles,
    findByName(name) {
      return byName.get(name) ?? [];
    },
    findByFile(filePath) {
      return byFile.get(filePath) ?? [];
    },
  };

  return index;
}

export function retrieveRelevantSymbols(question, symbolIndex, { limit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }

  const questionTerms = new Set(tokenize(question).map(normalizeTerm));
  if (questionTerms.size === 0) {
    return [];
  }

  return symbolIndex.symbols
    .map((symbol, index) => {
      const symbolTerms = new Set(tokenize(symbol.name).map(normalizeTerm));
      const score = [...questionTerms].filter((term) => symbolTerms.has(term)).length;
      return { symbol, index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ symbol, score }) => ({ ...symbol, score }));
}

export function loadSymbolChunks(rootPath, symbols, { maxChars = 1000 } = {}) {
  const root = path.resolve(rootPath);
  const sourceByFile = new Map();

  return symbols.map((symbol) => {
    let source = sourceByFile.get(symbol.filePath);
    if (source === undefined) {
      const absolutePath = path.join(root, symbol.filePath);
      let buffer;
      try {
        buffer = readFileSync(absolutePath);
      } catch (error) {
        throw new Error(`Could not read symbol source ${symbol.filePath}: ${error.message}`);
      }

      source = decodeSource(buffer, symbol.filePath);
      if (source === undefined) {
        throw new Error(`Could not decode symbol source ${symbol.filePath}`);
      }
      sourceByFile.set(symbol.filePath, source);
    }

    const text = [
      `symbol: ${symbol.name} (${symbol.kind})`,
      `lines: ${symbol.startLine}-${symbol.endLine}`,
      "",
      getSymbolSource(source, symbol, maxChars),
    ].join("\n");

    return {
      filePath: symbol.filePath,
      chunkIndex: symbol.startLine - 1,
      text,
      symbolName: symbol.name,
      symbolKind: symbol.kind,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      score: symbol.score,
    };
  });
}

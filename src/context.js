import path from "node:path";
import { tokenize } from "./retrieve.js";

function chunkKey(chunk) {
  const symbolId = symbolKey(chunk);
  return symbolId ?? `${chunk.filePath}\0${chunk.chunkIndex}`;
}

function symbolKey(chunk) {
  if (!chunk.symbolName) {
    return undefined;
  }
  return `${chunk.filePath}\0${chunk.symbolName}\0${chunk.startLine}`;
}

function isHighLevelQuestion(question) {
  return /\b(what does .* do|what is this|purpose|overview|describe|about this project|project do)\b/i
    .test(question);
}

function isProjectMetadata(chunk) {
  const basename = path.posix.basename(chunk.filePath).toLowerCase();
  return basename === "package.json" || /^readme(?:\..+)?$/.test(basename);
}

export function rankContextCandidates(question, {
  keywordChunks = [],
  symbolChunks = [],
  expandedChunks = [],
  maxItems = 12,
} = {}) {
  if (!Number.isInteger(maxItems) || maxItems < 1) {
    throw new Error("maxItems must be a positive integer");
  }

  const highLevelQuestion = isHighLevelQuestion(question);
  const questionTerms = new Set(tokenize(question));
  const directKeys = new Set([
    ...keywordChunks.map(chunkKey),
    ...symbolChunks.map(chunkKey),
  ]);
  const candidates = new Map();
  let insertionOrder = 0;

  function addCandidate(chunk, source) {
    const key = chunkKey(chunk);
    const existing = candidates.get(key);
    const symbolId = symbolKey(chunk);

    if (existing) {
      if (source === "keyword" && existing.source !== "keyword") {
        existing.source = source;
      }
      return;
    }

    const matchedTerms = symbolId
      ? [...questionTerms].filter((term) => tokenize(chunk.symbolName).includes(term)).length
      : Number(chunk.score ?? 0);
    const isMetadata = highLevelQuestion && isProjectMetadata(chunk);
    let priority;

    if (source === "keyword") {
      priority = 400;
    } else if (symbolId && matchedTerms > 0) {
      priority = 350;
    } else if (isMetadata) {
      priority = 325;
    } else if (source === "relationship") {
      priority = 100;
    } else {
      priority = 200;
    }

    candidates.set(key, {
      chunk,
      source,
      score: priority + matchedTerms + (isMetadata ? 25 : 0),
      order: insertionOrder,
      symbolId,
    });
    insertionOrder += 1;
  }

  keywordChunks.forEach((chunk) => addCandidate(chunk, "keyword"));
  symbolChunks.forEach((chunk) => addCandidate(chunk, "symbol"));

  for (const chunk of expandedChunks) {
    const key = chunkKey(chunk);
    if (directKeys.has(key)) {
      addCandidate(chunk, chunk.symbolName ? "symbol" : "keyword");
      continue;
    }

    addCandidate(chunk, "relationship");
  }

  const seenSymbols = new Set();
  const ranked = [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .filter((candidate) => {
      if (!candidate.symbolId) {
        return true;
      }
      if (seenSymbols.has(candidate.symbolId)) {
        return false;
      }
      seenSymbols.add(candidate.symbolId);
      return true;
    })
    .slice(0, maxItems);

  return ranked.map(({ chunk, score, source }) => ({
    ...chunk,
    contextScore: score,
    contextSource: source,
  }));
}

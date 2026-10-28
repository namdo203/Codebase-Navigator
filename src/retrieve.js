const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "can",
  "does",
  "do",
  "explain",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "please",
  "the",
  "this",
  "to",
  "what",
  "which",
  "where",
  "who",
  "why",
  "with",
]);

const NON_FUNCTION_CALLS = new Set([
  "catch",
  "for",
  "function",
  "if",
  "return",
  "switch",
  "while",
]);

export function tokenize(text) {
  const separatedWords = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

  return separatedWords
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => !STOP_WORDS.has(term)) ?? [];
}

export function retrieveChunks(question, chunks, { topK = 5 } = {}) {
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("topK must be a positive integer");
  }

  const questionTerms = new Set(tokenize(question));
  if (questionTerms.size === 0) {
    return [];
  }

  return chunks
    .map((chunk, index) => {
      const chunkTerms = new Set(tokenize(chunk.text));
      const score = [...questionTerms].filter((term) => chunkTerms.has(term)).length;
      return { chunk, index, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, topK)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

function getFunctionReferences(text) {
  const references = new Set();
  const callPattern = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let match;

  while ((match = callPattern.exec(text)) !== null) {
    const name = match[1];
    if (!NON_FUNCTION_CALLS.has(name)) {
      references.add(name);
    }
  }

  return references;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function definesFunction(text, name) {
  const escapedName = escapeRegExp(name);
  const patterns = [
    new RegExp(`\\bfunction\\s*\\*?\\s*${escapedName}\\s*\\(`),
    new RegExp(
      `\\b(?:const|let|var)\\s+${escapedName}\\s*=\\s*(?:async\\s*)?(?:function\\b|(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>)`,
    ),
    new RegExp(
      `(?:^|[\\n;{}])\\s*(?:(?:static|async)\\s+)*${escapedName}\\s*\\([^)]*\\)\\s*\\{`,
    ),
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function getChunkKey(chunk) {
  return `${chunk.filePath}\0${chunk.chunkIndex}\0${chunk.text}`;
}

export function expandRelatedChunks(initialChunks, allChunks, {
  maxRelatedDefinitions = Number.POSITIVE_INFINITY,
} = {}) {
  if (
    (!Number.isInteger(maxRelatedDefinitions) && maxRelatedDefinitions !== Number.POSITIVE_INFINITY) ||
    maxRelatedDefinitions < 0
  ) {
    throw new Error("maxRelatedDefinitions must be a non-negative integer");
  }

  const results = [...initialChunks];
  const queuedChunks = [...initialChunks];
  const includedKeys = new Set(initialChunks.map(getChunkKey));
  const processedSymbols = new Set();
  const relationships = [];
  let limitReached = false;

  expansion:
  while (queuedChunks.length > 0) {
    const sourceChunk = queuedChunks.shift();

    for (const symbol of getFunctionReferences(sourceChunk.text)) {
      if (processedSymbols.has(symbol)) {
        continue;
      }
      processedSymbols.add(symbol);

      for (const candidate of allChunks) {
        if (!definesFunction(candidate.text, symbol)) {
          continue;
        }

        const key = getChunkKey(candidate);
        if (includedKeys.has(key)) {
          continue;
        }

        if (relationships.length >= maxRelatedDefinitions) {
          limitReached = true;
          break expansion;
        }

        includedKeys.add(key);
        results.push(candidate);
        queuedChunks.push(candidate);
        relationships.push({
          symbol,
          filePath: candidate.filePath,
          chunkIndex: candidate.chunkIndex,
        });
      }
    }
  }

  return { chunks: results, relationships, limitReached };
}

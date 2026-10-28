export const MAX_FILES = 500;
export const MAX_CHUNKS = 2000;
export const MAX_RELATED_DEFINITIONS = 20;
export const MAX_CONTEXT_ITEMS = 12;
export const MAX_SOURCES = 5;

export const DEFAULT_LIMITS = Object.freeze({
  maxFiles: MAX_FILES,
  maxChunks: MAX_CHUNKS,
  maxRelatedDefinitions: MAX_RELATED_DEFINITIONS,
  maxContextItems: MAX_CONTEXT_ITEMS,
  maxSources: MAX_SOURCES,
});

function readPositiveInteger(value, fallback) {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function readLimits(environment = process.env) {
  return {
    maxFiles: readPositiveInteger(environment.CODEBASE_MAX_FILES, DEFAULT_LIMITS.maxFiles),
    maxChunks: readPositiveInteger(environment.CODEBASE_MAX_CHUNKS, DEFAULT_LIMITS.maxChunks),
    maxRelatedDefinitions: readPositiveInteger(
      environment.CODEBASE_MAX_RELATED_DEFINITIONS,
      DEFAULT_LIMITS.maxRelatedDefinitions,
    ),
    maxContextItems: readPositiveInteger(
      environment.CODEBASE_MAX_CONTEXT_ITEMS,
      DEFAULT_LIMITS.maxContextItems,
    ),
    maxSources: readPositiveInteger(
      environment.CODEBASE_MAX_SOURCES,
      DEFAULT_LIMITS.maxSources,
    ),
  };
}

export function limitFiles(files, maxFiles) {
  return {
    items: files.slice(0, maxFiles),
    truncated: files.length > maxFiles,
    total: files.length,
  };
}

export function limitChunks(chunks, maxChunks) {
  return {
    items: chunks.slice(0, maxChunks),
    truncated: chunks.length > maxChunks,
    total: chunks.length,
  };
}

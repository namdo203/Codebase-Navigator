import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LIMITS,
  limitChunks,
  limitFiles,
  readLimits,
} from "../src/limits.js";

test("uses the documented defaults when environment variables are missing", () => {
  assert.deepEqual(readLimits({}), {
    maxFiles: 500,
    maxChunks: 2000,
    maxRelatedDefinitions: 20,
    maxContextItems: 12,
    maxSources: 5,
  });
  assert.deepEqual(DEFAULT_LIMITS, {
    maxFiles: 500,
    maxChunks: 2000,
    maxRelatedDefinitions: 20,
    maxContextItems: 12,
    maxSources: 5,
  });
});

test("reads positive integer environment-variable overrides", () => {
  assert.deepEqual(readLimits({
    CODEBASE_MAX_FILES: "12",
    CODEBASE_MAX_CHUNKS: "345",
    CODEBASE_MAX_RELATED_DEFINITIONS: "6",
    CODEBASE_MAX_CONTEXT_ITEMS: "9",
    CODEBASE_MAX_SOURCES: "3",
  }), {
    maxFiles: 12,
    maxChunks: 345,
    maxRelatedDefinitions: 6,
    maxContextItems: 9,
    maxSources: 3,
  });
});

test("falls back to defaults for invalid environment-variable values", () => {
  assert.deepEqual(readLimits({
    CODEBASE_MAX_FILES: "0",
    CODEBASE_MAX_CHUNKS: "-1",
    CODEBASE_MAX_RELATED_DEFINITIONS: "many",
    CODEBASE_MAX_CONTEXT_ITEMS: "0",
    CODEBASE_MAX_SOURCES: "-2",
  }), DEFAULT_LIMITS);
});

test("limits the deterministic file list and reports truncation", () => {
  const files = ["a.js", "b.js", "c.js"];

  assert.deepEqual(limitFiles(files, 2), {
    items: ["a.js", "b.js"],
    truncated: true,
    total: 3,
  });
});

test("limits chunks and reports truncation", () => {
  const chunks = [{ chunkIndex: 0 }, { chunkIndex: 1 }, { chunkIndex: 2 }];

  assert.deepEqual(limitChunks(chunks, 2), {
    items: [{ chunkIndex: 0 }, { chunkIndex: 1 }],
    truncated: true,
    total: 3,
  });
});

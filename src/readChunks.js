import { readFileSync } from "node:fs";
import path from "node:path";
import { splitIntoChunks } from "./chunk.js";
import { isTextSourceFile } from "./fileTypes.js";

export function chunkFileText(filePath, content, {
  maxChunkChars = 1000,
  maxChunks = Number.POSITIVE_INFINITY,
} = {}) {
  let nextLine = 1;
  return splitIntoChunks(content, maxChunkChars, { maxChunks })
    .map((text, chunkIndex) => {
      const startLine = nextLine;
      const newlineCount = (text.match(/\n/g) ?? []).length;
      const endLine = Math.max(startLine, startLine + newlineCount - (text.endsWith("\n") ? 1 : 0));
      nextLine += newlineCount;

      return {
        filePath,
        chunkIndex,
        startLine,
        endLine,
        text,
      };
    });
}

export function readAndChunkFiles(rootPath, files, {
  maxChunkChars = 1000,
  maxChunks = Number.POSITIVE_INFINITY,
} = {}) {
  if (!Number.isInteger(maxChunkChars) || maxChunkChars < 1) {
    throw new Error("maxChunkChars must be a positive integer");
  }
  if ((!Number.isInteger(maxChunks) && maxChunks !== Number.POSITIVE_INFINITY) || maxChunks < 1) {
    throw new Error("maxChunks must be a positive integer");
  }

  const root = path.resolve(rootPath);
  const chunks = [];

  for (const filePath of files) {
    if (!isTextSourceFile(filePath)) {
      continue;
    }

    const absolutePath = path.join(root, filePath);
    let bytes;

    try {
      bytes = readFileSync(absolutePath);
    } catch (error) {
      throw new Error(`Could not read ${filePath}: ${error.message}`);
    }

    if (bytes.includes(0)) {
      continue;
    }

    let content;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      if (error instanceof TypeError) {
        continue;
      }
      throw error;
    }

    const fileChunks = chunkFileText(filePath, content, {
      maxChunkChars,
      maxChunks: maxChunks - chunks.length,
    });
    chunks.push(...fileChunks);

    if (chunks.length >= maxChunks) {
      break;
    }
  }

  return chunks;
}

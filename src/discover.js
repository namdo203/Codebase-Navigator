import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isTextSourceFile } from "./fileTypes.js";

const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "venv",
  "vendor",
]);

export function discoverFiles(rootPath) {
  const root = path.resolve(rootPath);

  if (!statSync(root).isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const files = [];
  const pendingDirectories = [root];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();

    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          pendingDirectories.push(entryPath);
        }
      } else if (entry.isFile() && isTextSourceFile(entry.name)) {
        files.push(path.relative(root, entryPath).split(path.sep).join("/"));
      }
    }
  }

  return files.sort();
}

import path from "node:path";

const TEXT_EXTENSIONS = new Set([
  ".adoc",
  ".astro",
  ".bash",
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".cjs",
  ".csv",
  ".go",
  ".graphql",
  ".gql",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".kt",
  ".kts",
  ".less",
  ".md",
  ".mdx",
  ".mjs",
  ".php",
  ".pl",
  ".properties",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".rst",
  ".sass",
  ".scala",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

const IGNORED_FILE_NAMES = new Set([
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const TEXT_FILE_NAMES = new Set([
  ".dockerignore",
  ".editorconfig",
  ".gitignore",
  ".npmrc",
  ".nvmrc",
  "dockerfile",
  "makefile",
]);

export function isTextSourceFile(filePath) {
  const basename = path.posix.basename(filePath).toLowerCase();
  const extension = path.posix.extname(basename);

  if (
    IGNORED_FILE_NAMES.has(basename) ||
    basename.endsWith(".min.js") ||
    basename.endsWith(".min.css") ||
    basename.endsWith(".map") ||
    basename.includes(".generated.") ||
    basename.includes(".gen.")
  ) {
    return false;
  }

  return TEXT_EXTENSIONS.has(extension) || TEXT_FILE_NAMES.has(basename);
}

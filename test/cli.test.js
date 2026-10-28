import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("prints progress and per-stage counts for a local repository", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codebase-navigator-cli-"));

  try {
    writeFileSync(
      path.join(root, "app.js"),
      `export function authenticateUser() {\n${"  // filler\n".repeat(150)}}`,
    );
    writeFileSync(path.join(root, "b.js"), "export function helper() {}");
    writeFileSync(path.join(root, "c.js"), "export function extra() {}");
    const cliPath = path.resolve("src/cli.js");
    const result = spawnSync(
      process.execPath,
      [cliPath, root, "How does authenticateUser work?"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPENAI_API_KEY: "",
          OPENAI_MODEL: "",
          CODEBASE_MAX_FILES: "2",
          CODEBASE_MAX_CHUNKS: "1",
          CODEBASE_MAX_RELATED_DEFINITIONS: "1",
        },
      },
    );

    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, 1);
    assert.match(output, /\[1\/6\] Discovering files/);
    assert.match(output, /Repository contains 3 usable files/);
    assert.match(output, /Chunk context is limited to the first 2 files/);
    assert.match(output, /Discovered 3 usable files/);
    assert.match(output, /\[2\/6\] Building the symbol index across all usable files/);
    assert.match(output, /Indexed 3 files\. Found 3 symbols/);
    assert.match(output, /\[3\/6\] Retrieving relevant code/);
    assert.match(output, /Repository produced more than 1 chunks/);
    assert.match(output, /Created 1 chunks/);
    assert.match(output, /Retrieved 1 keyword chunks/);
    assert.match(output, /\[4\/6\] Expanding code relationships/);
    assert.match(output, /Added 0 related definitions/);
    assert.match(output, /\[5\/6\] Preparing bounded LLM context/);
    assert.match(output, /Ranked and deduplicated to 2 context items/);
    assert.match(output, /\[6\/6\] Asking the LLM/);
    assert.match(output, /OPENAI_API_KEY is required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

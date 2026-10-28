import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  cleanupTemporaryRepository,
  detectRepositoryInput,
  isGitRepositoryUrl,
  resolveRepository,
} from "../src/repository.js";

test("detects local paths and HTTPS Git repository URLs", () => {
  assert.equal(detectRepositoryInput("./my-project"), "local");
  assert.equal(detectRepositoryInput("C:\\projects\\my-project"), "local");
  assert.equal(detectRepositoryInput("https://github.com/user/repository.git"), "git");
  assert.equal(detectRepositoryInput("https://gitlab.com/group/project"), "git");
  assert.equal(isGitRepositoryUrl("https://github.com/user/repository.git"), true);
});

test("rejects malformed or unsupported repository URL inputs", () => {
  assert.equal(isGitRepositoryUrl("http://github.com/user/repository"), false);
  assert.throws(() => detectRepositoryInput("https://"), /Invalid Git URL/);
  assert.throws(() => detectRepositoryInput("https://github.com/"), /Invalid Git URL/);
  assert.throws(
    () => detectRepositoryInput("https://github.com/user/repo.git?token=value"),
    /Invalid Git URL/,
  );
});

test("resolves a valid local directory without cloning or cleanup", async () => {
  const directory = process.cwd();
  let cloneCalled = false;
  const repository = await resolveRepository(directory, {
    spawnProcess: () => {
      cloneCalled = true;
    },
  });

  assert.equal(repository.directory, directory);
  assert.equal(repository.cleanup, undefined);
  assert.equal(cloneCalled, false);
});

test("streams clone progress, disables interactive prompts, and cleans the clone", async () => {
  let spawnCommand;
  let spawnArguments;
  let spawnOptions;
  let removedDirectory;
  const progress = [];
  const repository = await resolveRepository("https://github.com/user/repo.git", {
    spawnProcess: (command, args, options) => {
      spawnCommand = command;
      spawnArguments = args;
      spawnOptions = options;
      const child = new EventEmitter();
      child.stderr = new PassThrough();
      process.nextTick(() => {
        child.stderr.write("Receiving objects: 100%\n");
        child.emit("close", 0, null);
      });
      return child;
    },
    onProgress: (message) => progress.push(message),
    makeTemporaryDirectory: () => "C:\\Temp\\codebase-navigator-test",
    getTemporaryDirectory: () => "C:\\Temp",
    removeDirectory: (directory, options) => {
      removedDirectory = { directory, options };
    },
  });

  assert.equal(spawnCommand, "git");
  assert.deepEqual(spawnArguments, [
    "clone",
    "--depth",
    "1",
    "--progress",
    "--",
    "https://github.com/user/repo.git",
    "C:\\Temp\\codebase-navigator-test",
  ]);
  assert.equal(spawnOptions.env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(spawnOptions.env.GCM_INTERACTIVE, "Never");
  assert.deepEqual(spawnOptions.stdio, ["ignore", "ignore", "pipe"]);
  assert.equal(repository.directory, "C:\\Temp\\codebase-navigator-test");
  assert.match(progress[0], /Cloning repository/);
  assert.match(progress[1], /Receiving objects/);
  assert.match(progress[2], /Repository cloned successfully/);
  repository.cleanup();
  assert.equal(removedDirectory.directory, repository.directory);
  assert.deepEqual(removedDirectory.options, { recursive: true, force: true });
});

test("reports invalid local paths and Git-unavailable errors", async () => {
  await assert.rejects(
    resolveRepository("./missing", {
      getStats: () => {
        const error = new Error("not found");
        error.code = "ENOENT";
        throw error;
      },
    }),
    /Invalid local path "\.\/missing": not found/,
  );
  await assert.rejects(
    resolveRepository("https://github.com/user/repo.git", {
      makeTemporaryDirectory: () => "C:\\Temp\\clone",
      getTemporaryDirectory: () => "C:\\Temp",
      removeDirectory: () => {},
      onProgress: () => {},
      spawnProcess: () => {
        const error = new Error("git not found");
        error.code = "ENOENT";
        throw error;
      },
    }),
    /Git is not installed/,
  );
});

test("reports actual Git stderr for clone failures and cleans temporary data", async () => {
  let cleaned = false;
  await assert.rejects(
    resolveRepository("https://github.com/user/private.git", {
      makeTemporaryDirectory: () => "C:\\Temp\\clone",
      getTemporaryDirectory: () => "C:\\Temp",
      removeDirectory: (directory, options) => {
        cleaned = directory === "C:\\Temp\\clone"
          && options.recursive
          && options.force;
      },
      onProgress: () => {},
      spawnProcess: () => {
        const child = new EventEmitter();
        child.stderr = new PassThrough();
        process.nextTick(() => {
          child.stderr.write("fatal: repository not found\n");
          child.emit("close", 128, null);
        });
        return child;
      },
    }),
    /accessible \(public, or credentials are configured\).*fatal: repository not found/,
  );
  assert.equal(cleaned, true);
});

test("times out stalled clones and includes Git progress in the error", async () => {
  let cleaned = false;
  await assert.rejects(
    resolveRepository("https://github.com/user/repo.git", {
      makeTemporaryDirectory: () => "C:\\Temp\\clone",
      getTemporaryDirectory: () => "C:\\Temp",
      timeoutMs: 5,
      onProgress: () => {},
      removeDirectory: () => {
        cleaned = true;
      },
      spawnProcess: () => {
        const child = new EventEmitter();
        child.stderr = new PassThrough();
        child.kill = () => {
          child.stderr.write("Cloning into temporary directory...\n");
          child.emit("close", null, "SIGTERM");
        };
        return child;
      },
    }),
    /timed out after 5 ms.*Cloning into temporary directory/,
  );
  assert.equal(cleaned, true);
});

test("cleanup removes a real temporary directory", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "navigator-cleanup-test-"));

  cleanupTemporaryRepository(directory);

  assert.throws(() => statSync(directory), { code: "ENOENT" });
});

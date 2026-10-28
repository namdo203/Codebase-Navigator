import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function looksLikeRepositoryUrl(input) {
  return /^https?:/i.test(input) || /^[a-z][a-z\d+.-]*:\/\//i.test(input);
}

export function isGitRepositoryUrl(input) {
  try {
    const url = new URL(input);
    return url.protocol === "https:"
      && Boolean(url.hostname)
      && url.pathname.split("/").filter(Boolean).length >= 2
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function detectRepositoryInput(input) {
  if (looksLikeRepositoryUrl(input)) {
    if (!isGitRepositoryUrl(input)) {
      throw new Error(
        `Invalid Git URL: ${input}. Use an HTTPS repository URL such as https://github.com/user/repository.git`,
      );
    }
    return "git";
  }

  return "local";
}

export function cleanupTemporaryRepository(directory, removeDirectory = rmSync) {
  removeDirectory(directory, { recursive: true, force: true });
}

function cloneRepository(repositoryUrl, directory, {
  spawnProcess,
  timeoutMs,
  onProgress,
}) {
  return new Promise((resolve, reject) => {
    let child;
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer;
    let forceKillTimer;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      callback(value);
    };

    try {
      child = spawnProcess("git", [
        "clone",
        "--depth",
        "1",
        "--progress",
        "--",
        repositoryUrl,
        directory,
      ], {
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GCM_INTERACTIVE: "Never",
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (error) {
      finish(reject, error);
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      if (settled) {
        return;
      }
      forceKillTimer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(reject, new Error(
          `Git clone timed out after ${timeoutMs} ms.${stderr.trim() ? ` Git reported: ${stderr.trim()}` : ""}`,
        ));
      }, 1000);
    }, timeoutMs);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data) => {
      stderr += data;
      onProgress(data);
    });

    child.once("error", (error) => {
      finish(reject, error);
    });

    child.once("close", (code, signal) => {
      if (timedOut) {
        finish(reject, new Error(
          `Git clone timed out after ${timeoutMs} ms.${stderr.trim() ? ` Git reported: ${stderr.trim()}` : ""}`,
        ));
      } else if (code !== 0) {
        const signalDetails = signal ? ` (terminated by ${signal})` : "";
        finish(reject, new Error(
          `Git exited with code ${code}${signalDetails}.${stderr.trim() ? ` Git reported: ${stderr.trim()}` : ""}`,
        ));
      } else {
        finish(resolve);
      }
    });
  });
}

export async function resolveRepository(input, {
  spawnProcess = spawn,
  timeoutMs = 120_000,
  onProgress = (message) => process.stderr.write(message),
  makeTemporaryDirectory = mkdtempSync,
  removeDirectory = rmSync,
  getTemporaryDirectory = os.tmpdir,
  getStats = statSync,
  resolvePath = path.resolve,
} = {}) {
  const inputType = detectRepositoryInput(input);

  if (inputType === "local") {
    const directory = resolvePath(input);
    let stats;

    try {
      stats = getStats(directory);
    } catch (error) {
      throw new Error(`Invalid local path "${input}": ${error.message}`);
    }

    if (!stats.isDirectory()) {
      throw new Error(`Invalid local path "${input}": expected a directory`);
    }

    return { directory, cleanup: undefined };
  }

  const directory = makeTemporaryDirectory(
    path.join(getTemporaryDirectory(), "codebase-navigator-"),
  );

  onProgress("Cloning repository...\n");
  try {
    await cloneRepository(input, directory, {
      spawnProcess,
      timeoutMs,
      onProgress,
    });
  } catch (error) {
    cleanupTemporaryRepository(directory, removeDirectory);
    if (error.code === "ENOENT") {
      throw new Error("Git is not installed or is not available on PATH.");
    }

    throw new Error(
      `Could not clone repository "${input}". Check the URL and confirm the repository is accessible (public, or credentials are configured). ${error.message}`,
    );
  }

  onProgress("Repository cloned successfully.\n");
  return {
    directory,
    cleanup: () => cleanupTemporaryRepository(directory, removeDirectory),
  };
}

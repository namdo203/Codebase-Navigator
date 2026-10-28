import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/server.js";

async function withServer(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("POST /api/analyze validates repository and question", async () => {
  const app = createApp({ analyze: async () => assert.fail("analysis should not run") });

  await withServer(app, async (baseUrl) => {
    const missingRepository = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "How does auth work?" }),
    });
    assert.equal(missingRepository.status, 400);
    assert.deepEqual(await missingRepository.json(), {
      error: "Repository URL or path is required.",
    });

    const missingQuestion = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "https://github.com/owner/repo" }),
    });
    assert.equal(missingQuestion.status, 400);
    assert.deepEqual(await missingQuestion.json(), { error: "Question is required." });
  });
});

test("POST /api/analyze returns the answer and structured sources", async () => {
  let received;
  const app = createApp({
    analyze: async (repository, question) => {
      received = { repository, question };
      return {
        answer: "Authentication checks the session.",
        sources: [{
          filePath: "src/auth.js",
          startLine: 20,
          endLine: 48,
          symbolName: "checkSession",
        }],
      };
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repository: " https://github.com/owner/repo ",
        question: " How does authentication work? ",
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      answer: "Authentication checks the session.",
      sources: [{ filePath: "src/auth.js", startLine: 20, endLine: 48 }],
    });
    assert.deepEqual(received, {
      repository: "https://github.com/owner/repo",
      question: "How does authentication work?",
    });
  });
});

test("POST /api/analyze returns a generic 500 for analysis failures", async () => {
  const app = createApp({
    analyze: async () => {
      throw new Error("OPENAI_API_KEY leaked at C:\\private\\repository");
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "repo", question: "question" }),
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.match(body.error, /Analysis failed/);
    assert.doesNotMatch(body.error, /OPENAI_API_KEY|C:/);
  });
});

test("serves the browser interface at the root path", async () => {
  const app = createApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(await response.text(), /Codebase Navigator/);
  });
});

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepository } from "./analyze.js";

const publicDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
);

export function createApp({ analyze = analyzeRepository } = {}) {
  const app = express();

  app.use(express.json({ limit: "32kb" }));
  app.use(express.static(publicDirectory));

  app.post("/api/analyze", async (request, response) => {
    const repository = request.body?.repository;
    const question = request.body?.question;

    if (typeof repository !== "string" || repository.trim() === "") {
      return response.status(400).json({ error: "Repository URL or path is required." });
    }
    if (typeof question !== "string" || question.trim() === "") {
      return response.status(400).json({ error: "Question is required." });
    }

    try {
      const result = await analyze(repository.trim(), question.trim());
      return response.json({
        answer: result.answer,
        sources: result.sources.map(({ filePath, startLine, endLine }) => ({
          filePath,
          startLine,
          endLine,
        })),
      });
    } catch (error) {
      console.error(`Web analysis failed: ${error.message}`);
      return response.status(500).json({
        error: "Analysis failed. Verify the repository is accessible and the LLM configuration is valid.",
      });
    }
  });

  app.use((error, request, response, next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "Request body must be valid JSON." });
    }
    if (error.type === "entity.too.large") {
      return response.status(413).json({ error: "Request body is too large." });
    }
    return next(error);
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port between 1 and 65535.");
  }

  createApp().listen(port, "127.0.0.1", () => {
    console.log(`Codebase Navigator web UI listening at http://localhost:${port}`);
  });
}

import { performance } from "node:perf_hooks";
import { discoverFiles } from "./discover.js";
import { generateAnswer } from "./llm.js";
import { chunkFileText } from "./readChunks.js";
import { resolveRepository } from "./repository.js";
import { expandRelatedChunks, retrieveChunks } from "./retrieve.js";
import { limitChunks, limitFiles, readLimits } from "./limits.js";
import { rankContextCandidates } from "./context.js";
import { selectSources } from "./sources.js";
import {
  buildSymbolIndex,
  loadSymbolChunks,
  retrieveRelevantSymbols,
} from "./symbolIndex.js";

export async function analyzeRepository(rootPath, question, {
  topK = 5,
  logger = console,
  onRepositoryProgress = (message) => process.stderr.write(message),
  onCleanupError = (error) => {
    throw error;
  },
} = {}) {
  const repository = await resolveRepository(rootPath, {
    onProgress: onRepositoryProgress,
  });

  try {
    const limits = readLimits();

    let startedAt = startStage(logger, 1, "Discovering files...");
    const discoveredFiles = discoverFiles(repository.directory);
    const fileLimit = limitFiles(discoveredFiles, limits.maxFiles);
    finishStage(logger, startedAt, `Discovered ${discoveredFiles.length} usable files.`);

    startedAt = startStage(logger, 2, "Building the symbol index across all usable files...");
    const generatedChunks = [];
    const symbolIndex = buildSymbolIndex(repository.directory, discoveredFiles, {
      onFileContent: (filePath, source, fileIndex) => {
        if (fileIndex >= limits.maxFiles || generatedChunks.length > limits.maxChunks) {
          return;
        }

        generatedChunks.push(...chunkFileText(filePath, source, {
          maxChunks: limits.maxChunks + 1 - generatedChunks.length,
        }));
      },
      onProgress: (indexedFiles, totalFiles, symbolCount) => {
        logger.log(`Indexed ${indexedFiles}/${totalFiles} files (${symbolCount} symbols)...`);
      },
    });
    finishStage(
      logger,
      startedAt,
      `Indexed ${symbolIndex.indexedFiles} files. Found ${symbolIndex.symbols.length} symbols.`,
    );

    if (fileLimit.truncated) {
      logger.warn(
        `Repository contains ${fileLimit.total} usable files.\nChunk context is limited to the first ${limits.maxFiles} files (CODEBASE_MAX_FILES); symbol indexing covered all files.`,
      );
    }

    startedAt = startStage(logger, 3, "Retrieving relevant code...");
    const chunkLimit = limitChunks(generatedChunks, limits.maxChunks);
    const chunks = chunkLimit.items;
    if (chunkLimit.truncated) {
      logger.warn(
        `Repository produced more than ${limits.maxChunks} chunks.\nUsing first ${limits.maxChunks} chunks (CODEBASE_MAX_CHUNKS).`,
      );
    }
    logger.log(`Created ${chunks.length} chunks.`);
    const results = retrieveChunks(question, chunks, { topK });
    const relevantSymbols = retrieveRelevantSymbols(question, symbolIndex, {
      limit: limits.maxRelatedDefinitions,
    });
    const symbolChunks = loadSymbolChunks(repository.directory, relevantSymbols);
    finishStage(
      logger,
      startedAt,
      `Retrieved ${results.length} keyword chunks and ${symbolChunks.length} symbol contexts.`,
    );

    startedAt = startStage(logger, 4, "Expanding code relationships...");
    const expanded = expandRelatedChunks(
      [...results, ...symbolChunks],
      [...chunks, ...symbolChunks],
      {
        maxRelatedDefinitions: limits.maxRelatedDefinitions,
      },
    );
    finishStage(logger, startedAt, `Added ${expanded.relationships.length} related definitions.`);
    if (expanded.limitReached) {
      logger.warn(
        `Related-definition expansion limit reached (${limits.maxRelatedDefinitions}).`,
      );
    }

    logger.log(
      `Searched ${chunks.length} chunks from ${discoveredFiles.length} usable files for: ${question}`,
    );
    if (results.length === 0) {
      logger.log("No keyword matches; asking the model to respond based on the empty context.");
    }
    for (const relationship of expanded.relationships) {
      logger.log(
        `Related definition: ${relationship.symbol} -> ${relationship.filePath} (chunk ${relationship.chunkIndex})`,
      );
    }

    startedAt = startStage(logger, 5, "Preparing bounded LLM context...");
    const finalContext = rankContextCandidates(question, {
      keywordChunks: results,
      symbolChunks,
      expandedChunks: expanded.chunks,
      maxItems: limits.maxContextItems,
    });
    finishStage(logger, startedAt, `Ranked and deduplicated to ${finalContext.length} context items.`);
    const sources = selectSources(finalContext, { limit: limits.maxSources });

    startedAt = startStage(logger, 6, "Asking the LLM...");
    let waitingNoticeCount = 0;
    const waitingNotice = setInterval(() => {
      waitingNoticeCount += 1;
      const elapsedSeconds = Math.floor((performance.now() - startedAt) / 1000);
      logger.log(
        `Still waiting for the LLM response (${elapsedSeconds}s elapsed; notice ${waitingNoticeCount}).`,
      );
    }, 10_000);

    let answer;
    try {
      answer = await generateAnswer(question, finalContext);
    } finally {
      clearInterval(waitingNotice);
    }
    finishStage(logger, startedAt, "LLM response received.");
    return { answer, sources };
  } finally {
    if (repository.cleanup) {
      try {
        repository.cleanup();
      } catch (error) {
        onCleanupError(error);
      }
    }
  }
}

function startStage(logger, number, description) {
  logger.log(`[${number}/6] ${description}`);
  return performance.now();
}

function finishStage(logger, startedAt, result) {
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(2);
  logger.log(`${result} (completed in ${seconds}s)`);
}

import { analyzeRepository } from "./analyze.js";
import { formatSources } from "./sources.js";

const [rootPath, ...argumentsAfterPath] = process.argv.slice(2);
const topKFlagIndex = argumentsAfterPath.indexOf("--top-k");
let topK = 5;
let questionArguments = argumentsAfterPath;

if (topKFlagIndex !== -1) {
  const value = argumentsAfterPath[topKFlagIndex + 1];
  topK = Number(value);
  questionArguments = argumentsAfterPath.filter((_, index) =>
    index !== topKFlagIndex && index !== topKFlagIndex + 1
  );
}

const question = questionArguments.join(" ").trim();

if (!rootPath || !question || !Number.isInteger(topK) || topK < 1) {
  console.error('Usage: npm start -- <repository-path-or-url> "<question>" [--top-k <count>]');
  process.exitCode = 1;
} else {
  try {
    const { answer, sources } = await analyzeRepository(rootPath, question, {
      topK,
      onCleanupError: (error) => {
        console.error(`Could not remove temporary repository: ${error.message}`);
        process.exitCode = 1;
      },
    });
    console.log(`\nAnswer:\n${answer}`);
    const sourceSection = formatSources(sources);
    if (sourceSection) {
      console.log(`\n${sourceSection}`);
    }
  } catch (error) {
    console.error(`Could not answer question: ${error.message}`);
    process.exitCode = 1;
  }
}

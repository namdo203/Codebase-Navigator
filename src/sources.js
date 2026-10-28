export function selectSources(contextItems, { limit = 5 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }

  const sources = [];
  const seen = new Set();

  for (const item of contextItems) {
    if (!item.filePath || !Number.isInteger(item.startLine) || !Number.isInteger(item.endLine)) {
      continue;
    }

    const source = {
      filePath: item.filePath,
      startLine: item.startLine,
      endLine: item.endLine,
      symbolName: item.symbolName,
    };
    const key = `${source.filePath}\0${source.startLine}\0${source.endLine}`;

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sources.push(source);

    if (sources.length >= limit) {
      break;
    }
  }

  return sources;
}

export function formatSources(sources) {
  if (sources.length === 0) {
    return "";
  }

  return [
    "Sources",
    ...sources.map(({ filePath, startLine, endLine }) =>
      `- \`${filePath}:${startLine}-${endLine}\``
    ),
  ].join("\n");
}

export function splitIntoChunks(text, maxChunkChars, {
  maxChunks = Number.POSITIVE_INFINITY,
} = {}) {
  const chunks = [];
  let start = 0;

  while (start < text.length && chunks.length < maxChunks) {
    let end = Math.min(start + maxChunkChars, text.length);

    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end - 1);
      const midpoint = start + Math.floor(maxChunkChars / 2);

      if (newline >= midpoint) {
        end = newline + 1;
      } else if (newline > start) {
        end = newline + 1;
      }
    }

    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}

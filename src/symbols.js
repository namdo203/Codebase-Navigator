function lineNumberAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function getLineOffsets(source) {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function findMatchingBrace(source, openingBrace) {
  let depth = 0;
  let quote;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;

  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && nextCharacter === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      lineComment = true;
      index += 1;
    } else if (character === "/" && nextCharacter === "*") {
      blockComment = true;
      index += 1;
    } else if (character === "\"" || character === "'" || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return source.length - 1;
}

function createSymbol(source, filePath, name, kind, startOffset, bodyOffset) {
  const endOffset = bodyOffset === undefined
    ? Math.max(startOffset, source.indexOf("\n", startOffset) - 1)
    : findMatchingBrace(source, bodyOffset);
  const safeEndOffset = endOffset < startOffset ? startOffset : endOffset;

  return {
    name,
    kind,
    filePath,
    startLine: lineNumberAt(source, startOffset),
    endLine: lineNumberAt(source, safeEndOffset),
  };
}

function collectMatches(source, filePath, pattern, kind, nameGroup, bodyFromEnd = false) {
  const symbols = [];
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const name = match[nameGroup];
    const nameOffset = match.index + match[0].indexOf(name);
    const declarationStart = match.index + match[0].search(/\S/);
    let bodyOffset = source.indexOf("{", match.index + match[0].length);

    if (!bodyFromEnd && match[0].endsWith("{")) {
      bodyOffset = match.index + match[0].length - 1;
    } else if (bodyFromEnd) {
      const definitionEnd = match.index + match[0].length;
      const nextNonSpace = source.slice(definitionEnd).search(/\S/);
      const nextCharacterOffset = nextNonSpace === -1
        ? source.length
        : definitionEnd + nextNonSpace;

      bodyOffset = source[nextCharacterOffset] === "{"
        ? nextCharacterOffset
        : undefined;
    }

    symbols.push(createSymbol(
      source,
      filePath,
      name,
      kind,
      Math.min(declarationStart, nameOffset),
      bodyOffset,
    ));
  }

  return symbols;
}

export function extractSymbols(source, filePath) {
  const functionSymbols = collectMatches(
    source,
    filePath,
    /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    "function",
    1,
  );
  const variableSymbols = collectMatches(
    source,
    filePath,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b(?:\s*\*)?(?:\s*[A-Za-z_$][\w$]*)?\s*\([^)]*\)|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g,
    "function",
    1,
    true,
  );
  const classSymbols = collectMatches(
    source,
    filePath,
    /\b(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/g,
    "class",
    1,
  );
  const methodSymbols = [];
  const lineOffsets = getLineOffsets(source);
  const nonMethodNames = new Set(["catch", "for", "function", "if", "return", "switch", "while"]);

  for (const classSymbol of classSymbols) {
    const classStartOffset = lineOffsets[classSymbol.startLine - 1];
    const classOpeningBrace = source.indexOf("{", classStartOffset);
    const classClosingBrace = findMatchingBrace(source, classOpeningBrace);
    const classBody = source.slice(classOpeningBrace + 1, classClosingBrace);
    const methodPattern = /(?:^|[;{}\n])\s*(?:(?:static|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
    let match;

    while ((match = methodPattern.exec(classBody)) !== null) {
      const name = match[1];
      if (nonMethodNames.has(name)) {
        continue;
      }
      const nameOffset = classOpeningBrace + 1 + match.index + match[0].indexOf(name);
      const methodOpeningBrace = classOpeningBrace + 1 + match.index + match[0].lastIndexOf("{");
      methodSymbols.push(createSymbol(
        source,
        filePath,
        name,
        "method",
        nameOffset,
        methodOpeningBrace,
      ));
    }
  }

  return [...functionSymbols, ...variableSymbols, ...classSymbols, ...methodSymbols]
    .sort((left, right) => left.startLine - right.startLine || left.name.localeCompare(right.name));
}

export function getSymbolSource(source, symbol, maxChars = 1000) {
  const lines = source.split(/\r?\n/);
  const code = lines.slice(symbol.startLine - 1, symbol.endLine).join("\n");
  if (code.length <= maxChars) {
    return code;
  }
  return `${code.slice(0, maxChars)}\n... [symbol source truncated]`;
}

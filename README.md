# Codebase Navigator

Codebase Navigator is a Node.js tool for exploring unfamiliar repositories. It
retrieves relevant source and asks an OpenAI-compatible language model to
explain how the code works, with source locations derived by the application.

## Pipeline

1. Accept a local repository path or HTTPS Git URL; clone remote repositories
   temporarily and clean them up after analysis.
2. Discover usable files and build a lightweight symbol index.
3. Retrieve keyword-matching chunks and question-matching symbols, then follow
   simple function references to related definitions.
4. Rank and deduplicate candidates, then limit the context sent to the model.
5. Return the answer and source locations from the selected context.

The symbol index scans discovered files, while chunking and final LLM context
are bounded. The model receives the question and selected source text. The
application, not the model, builds source references from file and line
metadata.

## Requirements and configuration

Requires Node.js 20.6 or newer and Git for HTTPS repositories. Install
dependencies with `npm install`. Create your local environment file from the
template:

```sh
cp .env.example .env
```

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`. The npm CLI and web scripts
load `.env` using Node's built-in `--env-file` option. Keep `.env` private; it
is ignored by Git. Alternatively, set the variables in your shell.

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `OPENAI_API_KEY` | Yes | — | API key for the configured provider |
| `OPENAI_MODEL` | Yes | — | Provider model name |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `CODEBASE_MAX_FILES` | No | `500` | Files used for chunk retrieval |
| `CODEBASE_MAX_CHUNKS` | No | `2000` | Chunks retained for retrieval |
| `CODEBASE_MAX_RELATED_DEFINITIONS` | No | `20` | Relationship expansion and symbol retrieval limit |
| `CODEBASE_MAX_CONTEXT_ITEMS` | No | `12` | Final context items sent to the model |
| `CODEBASE_MAX_SOURCES` | No | `5` | Source locations returned with the answer |
| `PORT` | No | `3000` | Web server port |

Limit values must be positive integers; missing or invalid values use defaults.
The provider API key is sent in the request authorization header, not included
in the model prompt, answer metadata, or web API response. Selected repository
source is sent to the configured provider; only analyze code you are
authorized to share with that provider.

## CLI

Analyze a local repository (from PowerShell):

```sh
Copy-Item .env.example .env
$env:OPENAI_API_KEY = "your-api-key"
$env:OPENAI_MODEL = "your-model-name"
npm start -- "C:\path\to\repository" "How does authentication work?"
```

Analyze a public HTTPS Git repository:

```sh
npm start -- https://github.com/owner/repository "How does authentication work?"
```

Change the number of initial keyword results with `--top-k`:

```sh
npm start -- . "How are files discovered?" --top-k 3
```

Git URLs use a shallow clone in a temporary directory, with progress reporting
and interactive prompts disabled. The URL must use HTTPS. Private repositories
require Git credentials already configured on the machine. Local paths are
resolved by the process running Codebase Navigator.

## Web interface

Start the local web server:

```sh
npm run web
```

Open [http://localhost:3000](http://localhost:3000). Enter a repository URL or
path and a question; the page displays the answer and structured sources.
`POST /api/analyze` accepts `{ "repository": "...", "question": "..." }`.
Missing inputs return HTTP 400; analysis failures return a generic HTTP 500
response. The server binds to loopback by default. Local paths refer to the
machine running the server.

## Retrieval and sources

Keyword retrieval scores chunks by distinct term overlap, including
camelCase-split terms. The symbol index extracts common JavaScript functions,
assignments, classes, and methods using source-text patterns. It helps retrieve
relevant definitions outside the chunk-file cap; it is not a full parser.
Relationship expansion follows simple function-call references while
preventing repeated symbols and chunks.

The context ranker deduplicates and prioritizes direct keyword matches,
question-matching symbols, project metadata for overview questions, and then
related definitions. All selected context and source counts are bounded by the
limits above. Sources contain repository-relative file paths and inclusive
line ranges from retrieved chunks or indexed symbols; they are not parsed from
the model's answer.

## Project structure

```text
public/              Static HTML, CSS, and browser JavaScript
src/analyze.js       Shared analysis pipeline
src/cli.js           CLI entry point
src/server.js        Express server and POST /api/analyze
src/discover.js      File discovery and exclusions
src/fileTypes.js     Supported text/source file filtering
src/readChunks.js    Text reading and chunk metadata
src/symbols.js       Lightweight symbol extraction
src/symbolIndex.js   Symbol indexing and retrieval
src/retrieve.js      Keyword and relationship retrieval
src/context.js       Context ranking and deduplication
src/limits.js        Configurable processing limits
src/llm.js           OpenAI-compatible API client and prompt
src/repository.js    Local path and Git URL handling
src/sources.js       Application-generated source references
test/                Node.js test suite
```

## Tests

Run the complete test suite:

```sh
npm test
```

## Limitations

Retrieval is lexical rather than semantic. Symbol extraction and call
relationship detection use lightweight patterns, so complex syntax and
non-JavaScript relationships may be missed. File and context caps can omit
relevant code. Source ranges are approximate for some constructs. The tool
does not redact secrets embedded in repository source; selected context is sent
to the configured LLM provider.

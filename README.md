# TypeDefLib

A Node.js pipeline to extract, chunk, sanitize, refine, and store TypeScript definition signatures from npm libraries, enhancing ParticleGraph’s user graph enrichment.

## Directory Structure & File Descriptions

- **`signature_chunk.js`**: Splits large signature JSON files into smaller chunks (e.g., 5 functions per chunk) for processing and reassembles them into a final `.graph.json`.
- **`dts_finder.js`**: Scans `package.json` dependencies, updates them to the latest version via npm, installs missing `@types/` packages, and locates `.d.ts` files.
- **`extract_classes.js`**: Extracts class definitions from TypeScript AST, including methods and properties.
- **`extract_constants.js`**: Extracts constant definitions from TypeScript AST.
- **`extract_enums.js`**: Extracts enum definitions from TypeScript AST.
- **`extract_functions.js`**: Extracts function signatures from TypeScript AST, including parameters and return types.
- **`extract_jsdoc.js`**: Parses JSDoc comments from TypeScript AST nodes.
- **`extract_namespaces.js`**: Extracts namespace definitions from TypeScript AST.
- **`extract_types.js`**: Extracts type alias and interface definitions from TypeScript AST.
- **`main.js`**: Orchestrates the pipeline: finds `.d.ts` files, extracts signatures, and skips if already in R2.
- **`package.json`**: Defines project dependencies (e.g., `@aws-sdk/client-s3`, `axios`) and library versions to process.
- **`signature_extraction.js`**: Combines extraction modules to generate a unified signature JSON from `.d.ts` files.
- **`signature_refinement.js`**: Uses xAI to add concise JSDoc to signatures, uploads to R2, and cleans up intermediates.
- **`signature_sanitization.js`**: Cleans signature JSON by removing nulls, deduping constants, and sanitizing strings.
- **`libraryDefs/`**:
  - **`finalized/`**: Holds final `.graph.json` files before R2 upload (e.g., `axios-1.8.4.graph.json`).

## Pipeline Flow

1. **`dts_finder.js`**:
   - Reads `package.json`, updates dependencies to latest (e.g., `axios` → 1.8.4), installs `@types/` if needed.
   - Outputs: List of `{ name, dtsPath, version }`.
2. **`main.js`**:
   - Checks R2 for existing `.graph.json` (e.g., `axios-1.8.4.graph.json`).
   - If missing, calls `signature_extraction.js` → `libraryDefs/extracted/<name>-<version>.signatures.json`.
3. **`signature_chunk.js`**:
   - Splits `.signatures.json` into chunks (e.g., `functions_0.chunk.json`) → `libraryDefs/chunked/`.
4. **`signature_sanitization.js`**:
   - Sanitizes chunks (dedupes, cleans) → `libraryDefs/cleaned/<name>-<version>.<section>_<n>.sanitized.json`.
5. **`signature_refinement.js`**:
   - Refines chunks with xAI JSDoc → `libraryDefs/refined/<name>-<version>.<section>_<n>.refined.json`.
   - Reassembles into `libraryDefs/finalized/<name>-<version>.graph.json`.
   - Uploads to R2 bucket `library-defs`.
   - Cleans up intermediate files matching `<name>-<version>` prefix.

## Relevant Information

- **Dependencies**: Requires `node`, `npm`, `@aws-sdk/client-s3`, `axios`, and xAI API key.
- **Environment**: Configure `.env` with:
  - `xAIKey`: For xAI API.
  - `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`: For R2 access.
- **Error Handling**: Failed chunks log to `libraryDefs/failed_chunks.json` and are skipped.
- **Cost**: ~$1 per library via xAI (e.g., $2500 for 2500 libs).
- **R2**: Stores final `.graph.json` files in `library-defs` bucket; existence check prevents reprocessing.
- **Cleanup**: Scoped to library prefix (e.g., `axios-1.8.4`), but concurrent runs need testing.

## Usage
```bash
node dts_finder.js && node main.js && node chunk_signatures.js && node signature_sanitization.js && node signature_refinement.js
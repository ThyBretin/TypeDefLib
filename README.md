# TypeDefLib

A Node.js pipeline to extract, chunk, sanitize, refine, and store TypeScript definition signatures from npm libraries, enhancing ParticleGraph’s user graph enrichment.

## Directory Structure & File Descriptions

- **`signature_chunk.js`**: Processes large signature JSON files into smaller chunks based on token count and outputs them for further processing.
- **`dts_finder.js`**: Scans `package.json` dependencies, updates them to the latest version via npm, installs missing `@types/` packages, and locates `.d.ts` files.
- **`extract_classes.js`**: Extracts class definitions from TypeScript AST, including methods and properties.
- **`extract_constants.js`**: Extracts constant definitions from TypeScript AST.
- **`extract_enums.js`**: Extracts enum definitions from TypeScript AST.
- **`extract_functions.js`**: Extracts function signatures from TypeScript AST, including parameters and return types.
- **`extract_jsdoc.js`**: Parses JSDoc comments from TypeScript AST nodes.
- **`extract_namespaces.js`**: Extracts namespace definitions from TypeScript AST.
- **`extract_types.js`**: Extracts type alias and interface definitions from TypeScript AST.
- **`main.js`**: Orchestrates the pipeline: finds `.d.ts` files, extracts signatures, and skips if already in R2.
- **`package.json`**: Defines project dependencies (e.g., `tiktoken`, `stream-json`) and library versions to process.
- **`signature_extraction.js`**: Combines extraction modules to generate a unified signature JSON from `.d.ts` files.
- **`signature_refinement.js`**: Reassembles chunks into a final `.graph.json` file and uploads it to R2.
- **`signature_sanitization.js`**: Cleans signature JSON chunks by removing nulls, deduping constants, and sanitizing data.
- **`libraryDefs/`**:
  - **`extracted/`**: Holds initial `.signatures.json` files (e.g., `expo-52.0.44.signatures.json`).
  - **`chunked/`**: Stores chunked files (e.g., `expo-52.0.44_0.chunk.json`).
  - **`cleaned/`**: Contains sanitized chunks (e.g., `expo-52.0.44_0.sanitized.json`).
  - **`refined/`**: Holds refined chunks (e.g., `expo-52.0.44_0.refined.json`).
  - **`finalized/`**: Holds final `.graph.json` files before R2 upload (e.g., `expo-52.0.44.graph.json`).

## Pipeline Flow

1. **`dts_finder.js`**:
   - Reads `package.json`, updates dependencies to latest versions (e.g., `expo` → 52.0.44), installs `@types/` if needed.
   - Outputs: List of `{ name, dtsPath, version }`.
2. **`main.js`**:
   - Checks R2 for existing `.graph.json` (e.g., `expo-52.0.44.graph.json`).
   - If missing, calls `signature_extraction.js` → `libraryDefs/extracted/<name>-<version>.signatures.json`.
3. **`signature_chunk.js`**:
   - Processes `.signatures.json` into chunks → `libraryDefs/chunked/<name>-<version>_<n>.chunk.json`.
4. **`signature_sanitization.js`**:
   - Sanitizes chunks → `libraryDefs/cleaned/<name>-<version>_<n>.sanitized.json`.
5. **`signature_refinement.js`**:
   - Reassembles chunks into `libraryDefs/refined/<name>-<version>.graph.json`.
   - Uploads to R2 bucket `library-defs`.

## Relevant Information

- **Dependencies**: Requires `node`, `npm`, `@aws-sdk/client-s3`, `tiktoken`, and `stream-json`.
- **Environment**: Configure `.env` with:
  - `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`: For R2 access.
- **R2**: Stores final `.graph.json` files in `library-defs` bucket; existence check prevents reprocessing.
- **Token Limit**: Chunks are limited to 6000 tokens (default), measured using `tiktoken` for `gpt-3.5-turbo`.

## Usage

```bash
node dts_finder.js && node main.js && node signature_chunk.js && node signature_sanitization.js && node signature_refinement.js
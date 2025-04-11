const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { encoding_for_model } = require("tiktoken");
const StreamObject = require("stream-json/streamers/StreamObject");
const { Writable } = require("stream");
const { splitLargeItemByTokens } = require("./signature_split");

const tokenizer = encoding_for_model("gpt-3.5-turbo");
const sections = ["functions", "enums", "types", "classes", "constants", "namespaces"];

async function chunkSignatures(inputFile, outputDir, maxTokens = 6000) {
  console.log(`Processing input file: ${inputFile}`);
  if (!fsSync.existsSync(inputFile)) {
    console.error(`Input file ${inputFile} does not exist`);
    return [];
  }

  // Extract version from filename
  const baseName = path.basename(inputFile, ".signatures.json");
  const versionMatch = baseName.match(/-(\d+\.\d+\.\d+)$/);
  const fallbackVersion = versionMatch ? versionMatch[1] : "unknown";

  await fs.mkdir(outputDir, { recursive: true });
  const chunks = [];
  let chunkIndex = 0;
  let version = null;
  let currentChunk = { functions: [], enums: [], types: [], classes: [], constants: [], namespaces: [] };
  let currentTokens = 0;

  const hasContent = (chunk) => {
    return chunk.version || sections.some(section => chunk[section].length > 0);
  };

  const writeChunk = async () => {
    if (currentTokens > 0 && hasContent(currentChunk)) {
      if (!currentChunk.version) currentChunk.version = version || fallbackVersion;
      const chunkStr = (() => {
        try {
          return JSON.stringify(currentChunk);
        } catch (e) {
          console.error(`Failed to serialize chunk ${chunkIndex}: ${e.message}`);
          return null;
        }
      })();
      if (!chunkStr) return;

      const finalTokens = tokenizer.encode(chunkStr).length;
      console.log(`Writing chunk ${chunkIndex}: ${finalTokens} tokens`);
      if (finalTokens > maxTokens) {
        console.warn(`Chunk ${chunkIndex} exceeds ${maxTokens}: ${finalTokens} tokens—re-splitting`);
        const splitChunks = await splitLargeItemByTokens(currentChunk, maxTokens);
        for (const splitChunk of splitChunks) {
          if (hasContent(splitChunk)) {
            const splitChunkStr = (() => {
              try {
                return JSON.stringify(splitChunk, null, 2);
              } catch (e) {
                console.error(`Invalid split chunk ${chunkIndex}: ${e.message}`);
                return null;
              }
            })();
            if (!splitChunkStr) continue;

            const splitFile = `${outputDir}/${baseName}_${chunkIndex}.chunk.json`;
            const splitTokens = tokenizer.encode(splitChunkStr).length;
            if (splitTokens > maxTokens) {
              console.warn(`Split chunk ${splitFile} still exceeds ${maxTokens}: ${splitTokens} tokens`);
              continue;
            }
            await fs.writeFile(splitFile, splitChunkStr);
            console.log(`Chunk ${splitFile} head: ${splitChunkStr.slice(0, 100)}`);
            chunks.push(splitFile);
            console.log(`Chunked ${chunkIndex} → ${splitFile} (${splitTokens} tokens)`);
            chunkIndex++;
          } else {
            console.log(`Skipping empty split chunk ${chunkIndex}`);
          }
        }
      } else {
        try {
          JSON.parse(chunkStr);
        } catch (e) {
          console.error(`Invalid JSON for chunk ${chunkIndex}: ${e.message}`);
          return;
        }
        const chunkFile = `${outputDir}/${baseName}_${chunkIndex}.chunk.json`;
        await fs.writeFile(chunkFile, chunkStr);
        console.log(`Chunk ${chunkFile} head: ${chunkStr.slice(0, 100)}`);
        chunks.push(chunkFile);
        console.log(`Chunked ${chunkIndex} → ${chunkFile} (${finalTokens} tokens)`);
        chunkIndex++;
      }
      currentChunk = { functions: [], enums: [], types: [], classes: [], constants: [], namespaces: [] };
      currentTokens = 0;
    } else {
      console.log(`Skipping chunk ${chunkIndex} - no content`);
    }
  };

  const processItem = async (section, item) => {
    const itemStr = JSON.stringify(item);
    const tokens = tokenizer.encode(itemStr).length;
    console.log(`Item in ${section}: ${tokens} tokens`);

    if (tokens > maxTokens) {
      console.warn(`Single ${section} item exceeds ${maxTokens}: ${tokens}`);
      const splitItems = await splitLargeItemByTokens(item, maxTokens);
      console.log(`Split into ${splitItems.length} parts`);
      for (const splitItem of splitItems) {
        const splitTokens = tokenizer.encode(JSON.stringify(splitItem)).length;
        if (currentTokens + splitTokens > maxTokens) await writeChunk();
        currentChunk[section].push(splitItem);
        currentTokens += splitTokens;
      }
    } else {
      if (currentTokens + tokens > maxTokens) await writeChunk();
      currentChunk[section].push(item);
      currentTokens += tokens;
    }
  };

  return new Promise((resolve, reject) => {
    const jsonStream = fsSync.createReadStream(inputFile).pipe(StreamObject.withParser());
    jsonStream.pipe(new Writable({
      objectMode: true,
      async write({ key, value }, _, done) {
        if (key === "version" && !version) {
          version = value;
          console.log(`Version set to: ${version}`);
        } else if (sections.includes(key) && Array.isArray(value)) {
          console.log(`${key} has ${value.length} items`);
          for (const item of value) {
            await processItem(key, item);
          }
        } else if (key === "contents" && typeof value === "object") {
          for (const [subKey, subValue] of Object.entries(value)) {
            if (sections.includes(subKey) && Array.isArray(subValue)) {
              console.log(`Nested ${subKey} has ${subValue.length} items`);
              for (const item of subValue) {
                await processItem(subKey, item);
              }
            }
          }
        }
        done();
      },
      async final(done) {
        await writeChunk();
        resolve(chunks);
        done();
      }
    })).on("error", reject);
  });
}

async function main() {
  console.log("Step 2: Chunking extracted signatures...");
  const extractedDir = "./libraryDefs/extracted";
  const outputDir = "./libraryDefs/chunked";
  await fs.mkdir(outputDir, { recursive: true });
  const files = await fs.readdir(extractedDir);
  console.log(`Found ${files.length} files in ${extractedDir}:`, files);

  let allChunks = [];
  for (const file of files) {
    if (file.endsWith(".signatures.json")) {
      const inputFile = `${extractedDir}/${file}`;
      const chunks = await chunkSignatures(inputFile, outputDir);
      console.log(`Chunked ${file} into ${chunks.length} parts`);
      allChunks = allChunks.concat(chunks);
    }
  }
}

if (require.main === module) main().catch(error => {
  console.error("Chunking failed:", error);
  process.exit(1);
});

module.exports = { chunkSignatures };
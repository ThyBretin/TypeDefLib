const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { encoding_for_model } = require("tiktoken");
const StreamObject = require("stream-json/streamers/StreamObject");
const { Writable } = require("stream");

const tokenizer = encoding_for_model("gpt-3.5-turbo");
const sections = ["functions", "enums", "types", "classes", "constants", "namespaces"];

async function chunkSignatures(inputFile, outputDir, maxTokens = 5000) { // Lowered to 5000
  console.log(`Processing input file: ${inputFile}`);
  if (!fsSync.existsSync(inputFile)) {
    console.error(`Input file ${inputFile} does not exist`);
    return [];
  }

  await fs.mkdir(outputDir, { recursive: true });
  const baseName = path.basename(inputFile, ".signatures.json");
  const chunks = [];
  let chunkIndex = 0;
  let version = null;
  let currentChunk = { functions: [], enums: [], types: [], classes: [], constants: [], namespaces: [] };
  let currentTokens = 0;

  const writeChunk = async () => {
    if (currentTokens > 0) {
      if (version) currentChunk.version = version;
      const chunkStr = JSON.stringify(currentChunk);
      const finalTokens = tokenizer.encode(chunkStr).length;
      if (finalTokens > maxTokens) {
        console.warn(`Chunk ${chunkIndex} exceeds ${maxTokens}: ${finalTokens} tokens—re-splitting`);
        const splitChunks = await splitLargeItemByTokens(currentChunk, maxTokens);
        for (const splitChunk of splitChunks) {
          const splitFile = `${outputDir}/${baseName}_${chunkIndex}.chunk.json`;
          await fs.writeFile(splitFile, JSON.stringify(splitChunk, null, 2));
          chunks.push(splitFile);
          console.log(`Chunked part ${chunkIndex} → ${splitFile} (${tokenizer.encode(JSON.stringify(splitChunk)).length} tokens)`);
          chunkIndex++;
        }
      } else {
        const chunkFile = `${outputDir}/${baseName}_${chunkIndex}.chunk.json`;
        await fs.writeFile(chunkFile, chunkStr);
        chunks.push(chunkFile);
        console.log(`Chunked part ${chunkIndex} → ${chunkFile} (${finalTokens} tokens)`);
        chunkIndex++;
      }
      currentChunk = { functions: [], enums: [], types: [], classes: [], constants: [], namespaces: [] };
      currentTokens = 0;
    }
  };

  const processItem = async (section, item) => {
    const itemStr = JSON.stringify(item);
    const tokens = tokenizer.encode(itemStr).length;
    console.log(`Item in ${section}: ${tokens} tokens`);

    if (tokens > maxTokens) {
      console.warn(`Single ${section} item exceeds ${maxTokens} tokens: ${tokens}`);
      const splitItems = await splitLargeItemByTokens(item, maxTokens);
      console.log(`Split into ${splitItems.length} parts`);
      for (const splitItem of splitItems) {
        const splitTokens = tokenizer.encode(JSON.stringify(splitItem)).length;
        if (currentTokens + splitTokens > maxTokens) await writeChunk();
        currentChunk[section].push(splitItem);
        currentTokens += splitTokens;
        if (section === "namespaces" && splitItem.contents?.types?.length) {
          console.log(`Split namespace types: ${splitItem.contents.types.length}, name: ${splitItem.name || 'unnamed'}`);
        }
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
        } else {
          console.log(`Skipping key: ${key}`);
        }
        done();
      },
      async final(done) {
        await writeChunk();
        resolve(chunks);
        done();
      }
    })).on("error", reject).on("finish", () => console.log("Stream finished"));
  }).catch(err => {
    console.error("Chunking promise rejected:", err);
    throw err;
  });
}

async function splitLargeItemByTokens(item, maxTokens) {
  const totalTokens = tokenizer.encode(JSON.stringify(item)).length;
  if (totalTokens <= maxTokens) return [item];

  const parts = [];
  const name = item.name;

  if (Array.isArray(item)) {
    let currentPart = [];
    let currentTokens = 0;
    for (const subItem of item) {
      const subTokens = tokenizer.encode(JSON.stringify(subItem)).length;
      if (currentTokens + subTokens > maxTokens && currentPart.length > 0) {
        parts.push([...currentPart]);
        currentPart = [subItem];
        currentTokens = subTokens;
      } else {
        currentPart.push(subItem);
        currentTokens += subTokens;
      }
    }
    if (currentPart.length > 0) parts.push(currentPart);
  } else if (typeof item === "object" && item !== null) {
    const entries = Object.entries(item);
    console.log(`Splitting ${entries.length} entries`);
    let currentPart = name ? { name } : {};
    let currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;

    for (const [key, value] of entries) {
      if (key === "name") continue;
      const entryTokens = tokenizer.encode(JSON.stringify({ [key]: value })).length;
      console.log(`Entry ${key}: ${entryTokens} tokens`);

      if (entryTokens > maxTokens) {
        console.log(`Recursing into ${key} (${entryTokens} tokens)`);
        const subParts = await splitLargeItemByTokens(value, maxTokens);
        for (const subPart of subParts) {
          const subTokens = tokenizer.encode(JSON.stringify(subPart)).length;
          if (currentTokens + subTokens > maxTokens && Object.keys(currentPart).length > (name ? 1 : 0)) {
            parts.push({ ...currentPart });
            console.log(`Part ${parts.length - 1} tokens: ${tokenizer.encode(JSON.stringify(currentPart)).length}`);
            currentPart = name ? { name } : {};
            currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;
          }
          currentPart[key] = subPart;
          currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;
          if (currentTokens > maxTokens) {
            parts.push({ ...(name ? { name } : {}), [key]: subPart });
            console.log(`Part ${parts.length - 1} tokens: ${subTokens}`);
            currentPart = name ? { name } : {};
            currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;
          }
        }
      } else {
        if (currentTokens + entryTokens > maxTokens && Object.keys(currentPart).length > (name ? 1 : 0)) {
          parts.push({ ...currentPart });
          console.log(`Part ${parts.length - 1} tokens: ${tokenizer.encode(JSON.stringify(currentPart)).length}`);
          currentPart = name ? { name } : {};
          currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;
        }
        currentPart[key] = value;
        currentTokens += entryTokens;
      }
    }
    if (Object.keys(currentPart).length > (name ? 1 : 0)) {
      parts.push({ ...currentPart });
      console.log(`Part ${parts.length - 1} tokens: ${currentTokens}`);
    }
  } else {
    parts.push(item);
  }

  console.log(`Split parts token counts: ${parts.map(p => tokenizer.encode(JSON.stringify(p)).length).join(", ")}`);
  return parts;
}

async function reassembleChunks(chunkFiles, outputFile) {
  const merged = { functions: [], enums: [], types: [], classes: [], constants: [], namespaces: [], version: null };
  const namespaceMap = new Map();

  const mergeArraysDeep = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (Array.isArray(value) && Array.isArray(target[key])) {
        target[key] = [...new Set([...target[key], ...value])];
      } else if (typeof value === "object" && value !== null && target[key]) {
        mergeArraysDeep(target[key], value);
      } else {
        target[key] = value;
      }
    }
  };

  for (const file of chunkFiles) {
    const chunk = JSON.parse(await fs.readFile(file, "utf-8"));
    for (const [key, value] of Object.entries(chunk)) {
      if (key === "version" && value && !merged.version) {
        merged.version = value;
      } else if (key === "namespaces" && Array.isArray(value)) {
        for (const ns of value) {
          const nsName = ns.name || "express";
          if (!namespaceMap.has(nsName)) {
            namespaceMap.set(nsName, { 
              name: nsName, 
              contents: { functions: [], enums: [], types: [], classes: [], constants: [] },
              jsdoc: null,
              isExported: false
            });
          }
          const targetNs = namespaceMap.get(nsName);
          mergeArraysDeep(targetNs, ns);
        }
      } else if (sections.includes(key) && Array.isArray(value)) {
        merged[key] = merged[key].concat(value);
      }
    }
  }

  merged.namespaces = Array.from(namespaceMap.values());
  await fs.writeFile(outputFile, JSON.stringify(merged, null, 2));
  console.log(`Reassembled → ${outputFile}, namespaces merged: ${merged.namespaces.length}, version: ${merged.version}`);
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
      allChunks = allChunks.concat(chunks);
    }
  }

  const outputFile = `${outputDir}/express-5.0.1.reassembled.json`;
  await reassembleChunks(allChunks, outputFile);
}

if (require.main === module) main().catch(error => {
  console.error("Chunking failed:", error);
  process.exit(1);
});

module.exports = { chunkSignatures, reassembleChunks };
const fs = require("fs").promises;
const path = require("path");

async function chunkSignatures(inputFile, outputDir, maxTokens = 3500) {
  const output = await fs.readFile(inputFile, "utf-8");
  const data = JSON.parse(output);
  const version = data.version || "unknown";
  const estimateTokens = (str) => Math.ceil(str.length / 4); // ~4 chars per token
  const chunks = [];
  let chunkCount = 0;

  // Helper for writing a chunk with metadata
  async function writeMetaChunk(chunkType, items, chunkIndex, totalChunks, parentName = null) {
    const chunkData = {
      chunkType,
      chunkIndex,
      totalChunks,
      version,
      parentName,
      items
    };
    const fname = `${outputDir}/${path.basename(inputFile, ".signatures.json")}_${chunkType}${parentName ? `_${parentName}` : ''}_${chunkIndex}.chunk.json`;
    await fs.writeFile(fname, JSON.stringify(chunkData, null, 2));
    chunks.push({ file: fname, chunkType, chunkIndex, totalChunks, parentName });
  }

  // Recursively chunk any object with array properties
  async function chunkObjectArrays(obj, parentType, parentName) {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value) && value.length > 0) {
        let currentChunk = [];
        let currentTokens = 0;
        let chunkIndex = 0;
        let wasChunked = false;
        for (const item of value) {
          const itemStr = JSON.stringify(item);
          const tokens = estimateTokens(itemStr);
          const tempChunk = [...currentChunk, item];
          const tempTokens = estimateTokens(JSON.stringify(tempChunk));
          if (tempTokens <= maxTokens && tokens <= maxTokens) {
            currentChunk = tempChunk;
            currentTokens = tempTokens;
          } else {
            if (currentChunk.length > 0) {
              await writeMetaChunk(`${parentType}.${key}`, currentChunk, chunkIndex, null, parentName);
              chunkIndex++;
              wasChunked = true;
            }
            if (tokens > maxTokens) {
              // If the item is itself an object with array properties, recurse
              if (typeof item === 'object' && item !== null) {
                await chunkObjectArrays(item, `${parentType}.${key}`, item.name || null);
              }
              await writeMetaChunk(`${parentType}.${key}`, [item], chunkIndex, null, parentName);
              chunkIndex++;
              wasChunked = true;
            } else {
              currentChunk = [item];
              currentTokens = tokens;
            }
          }
        }
        if (currentChunk.length > 0) {
          await writeMetaChunk(`${parentType}.${key}`, currentChunk, chunkIndex, null, parentName);
          chunkIndex++;
          wasChunked = true;
        }
        // Fill in totalChunks for this property
        for (let i = chunkCount; i < chunkCount + chunkIndex; ++i) {
          chunks[i].totalChunks = chunkIndex;
          // Update file with totalChunks
          const chunkFile = chunks[i].file;
          const chunkData = JSON.parse(await fs.readFile(chunkFile, "utf-8"));
          chunkData.totalChunks = chunkIndex;
          await fs.writeFile(chunkFile, JSON.stringify(chunkData, null, 2));
        }
        chunkCount += chunkIndex;
        // PATCH: replace large arrays in parent object with unique stub
        if (wasChunked) {
          const chunkId = `${parentType}.${key}`;
          obj[key] = { "__chunked__": chunkId };
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recurse into nested objects
        await chunkObjectArrays(value, `${parentType}.${key}`, value.name || null);
      }
    }
  }

  // For each top-level section, split into token-limited chunks and recursively chunk objects
  for (const [sectionName, section] of Object.entries({
    functions: data.functions,
    enums: data.enums,
    types: data.types,
    classes: data.classes,
    constants: data.constants,
    namespaces: data.namespaces
  })) {
    if (!section || section.length === 0) continue;
    const items = Array.isArray(section) ? section : [section];
    let currentChunk = [];
    let currentTokens = 0;
    let chunkIndex = 0;
    for (const item of items) {
      const itemStr = JSON.stringify(item);
      const tokens = estimateTokens(itemStr);
      const tempChunk = [...currentChunk, item];
      const tempTokens = estimateTokens(JSON.stringify(tempChunk));
      if (tempTokens <= maxTokens && tokens <= maxTokens) {
        currentChunk = tempChunk;
        currentTokens = tempTokens;
      } else {
        if (currentChunk.length > 0) {
          await writeMetaChunk(sectionName, currentChunk, chunkIndex, null);
          chunkIndex++;
        }
        if (tokens > maxTokens) {
          // Recursively chunk object if possible
          if (typeof item === 'object' && item !== null) {
            await chunkObjectArrays(item, sectionName, item.name || null);
          }
          await writeMetaChunk(sectionName, [item], chunkIndex, null);
          chunkIndex++;
        } else {
          currentChunk = [item];
          currentTokens = tokens;
        }
      }
    }
    if (currentChunk.length > 0) {
      await writeMetaChunk(sectionName, currentChunk, chunkIndex, null);
      chunkIndex++;
    }
    // Fill in totalChunks for this section
    for (let i = chunkCount; i < chunkCount + chunkIndex; ++i) {
      chunks[i].totalChunks = chunkIndex;
      // Update file with totalChunks
      const chunkFile = chunks[i].file;
      const chunkData = JSON.parse(await fs.readFile(chunkFile, "utf-8"));
      chunkData.totalChunks = chunkIndex;
      await fs.writeFile(chunkFile, JSON.stringify(chunkData, null, 2));
    }
    chunkCount += chunkIndex;
  }
  return chunks;
}

async function main() {
  // console.log("Step 2: Chunking extracted signatures...");
  const extractedDir = "./libraryDefs/extracted";
  const outputDir = "./libraryDefs/chunked";
  await fs.mkdir(outputDir, { recursive: true });
  const files = await fs.readdir(extractedDir);
  // console.log(`Found ${files.length} files in ${extractedDir}:`, files);

  let allChunks = [];
  for (const file of files) {
    if (file.endsWith(".signatures.json")) {
      const inputFile = `${extractedDir}/${file}`;
      const stats = await fs.stat(inputFile);
      // console.log(`Processing ${file} (${stats.size} bytes)`);
      const chunks = await chunkSignatures(inputFile, outputDir);
      // console.log(`Chunked ${file} into ${chunks.length} parts`);
      allChunks = allChunks.concat(chunks);
    }
  }
  // console.log(`Total chunks created: ${allChunks.length}`);
}

main().catch(e => {
  console.error("Chunking failed:", e);
  process.exit(1);
});

module.exports = { chunkSignatures };
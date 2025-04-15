const fs = require("fs").promises;
const path = require("path");

async function chunkSignatures(inputFile, outputDir, maxTokens = 3500) {
  const output = await fs.readFile(inputFile, "utf-8");
  const data = JSON.parse(output);
  const version = data.version || "unknown";
  // console.log(`Version set to: ${version}`);

  const estimateTokens = (str) => Math.ceil(str.length / 4); // ~4 chars per token

  const chunks = [];
  let chunkCount = 0;

  const forceSplitItem = async (item, max, depth = 0) => {
    const str = JSON.stringify(item);
    const tokens = estimateTokens(str);
    if (tokens <= max) return [item];

    const key = Object.keys(item)[0];
    const value = item[key];

    // Prevent infinite recursion: if not array or array of length 1, can't split further
    if (!Array.isArray(value) || value.length <= 1) {
      console.warn(`Cannot split further at depth ${depth} for key ${key} (tokens: ${tokens})`);
      return [item];
    }

    // Optionally, set a very high recursion limit as a safeguard
    const MAX_RECURSION_DEPTH = 10000;
    if (depth > MAX_RECURSION_DEPTH) {
      console.warn(`Max recursion depth (${MAX_RECURSION_DEPTH}) reached at depth ${depth} for key ${key}`);
      return [item];
    }

    // console.log(`Force splitting item (depth ${depth}): ${tokens} tokens`);
    const results = [];

    let current = [];
    let currentTokens = 0;
    for (const subItem of value) {
      const temp = [...current, subItem];
      const tempTokens = estimateTokens(JSON.stringify({ [key]: temp }));
      if (tempTokens <= max) {
        current = temp;
        currentTokens = tempTokens;
      } else {
        if (current.length > 0) {
          results.push({ [key]: current });
          // console.log(`Split part: ${current.length} items, ${currentTokens} tokens`);
        }
        const subItemTokens = estimateTokens(JSON.stringify(subItem));
        if (subItemTokens > max) {
          // Only recurse if subItem is splittable
          if (typeof subItem === 'object' && subItem !== null && Object.keys(subItem).length > 0) {
            const splitSubItems = await forceSplitItem({ temp: [subItem] }, max, depth + 1);
            results.push(...splitSubItems.map(s => ({ [key]: s.temp })));
          } else {
            console.warn(`Subitem at depth ${depth + 1} is not splittable (tokens: ${subItemTokens})`);
            results.push({ [key]: [subItem] });
          }
        } else {
          current = [subItem];
          currentTokens = subItemTokens;
        }
      }
    }
    if (current.length > 0) {
      results.push({ [key]: current });
      // console.log(`Split part: ${current.length} items, ${currentTokens} tokens`);
    }
    return results;
  };

  const processSection = async (section, sectionName) => {
    if (!section || section.length === 0) {
      // console.log(`${sectionName} has 0 items`);
      return;
    }

    const items = Array.isArray(section) ? section : [section];
    // console.log(`${sectionName} has ${items.length} items`);

    let currentChunk = [];
    let currentTokens = 0;

    for (const item of items) {
      const itemStr = JSON.stringify(item);
      const tokens = estimateTokens(itemStr);
      // console.log(`Item in ${sectionName}: ${tokens} tokens`);

      const tempChunk = [...currentChunk, item];
      const tempTokens = estimateTokens(JSON.stringify(tempChunk));

      if (tempTokens <= maxTokens && tokens <= maxTokens) {
        currentChunk = tempChunk;
        currentTokens = tempTokens;
      } else {
        // Save current chunk if it has items
        if (currentChunk.length > 0) {
          // console.log(`Preparing chunk ${chunkCount}: ${currentTokens} tokens`);
          chunks.push({ chunk: currentChunk, chunkId: chunkCount, version });
          await fs.writeFile(
            `${outputDir}/${path.basename(inputFile, ".signatures.json")}_${chunkCount}.chunk.json`,
            JSON.stringify(currentChunk, null, 2)
          );
          // console.log(
          //   `Chunked ${chunkCount} → ${outputDir}/${path.basename(inputFile, ".signatures.json")}_${chunkCount}.chunk.json (${currentTokens} tokens)`
          // );
          chunkCount++;
        }

        if (tokens > maxTokens) {
          // Split oversized item
          // console.log(`Oversized item in ${sectionName}: ${tokens} tokens—force splitting`);
          const splitItems = await forceSplitItem(
            sectionName === "namespaces" ? { [item.name]: item.contents } : item,
            maxTokens
          );
          await fs.appendFile(
            "./libraryDefs/forced_splits.json",
            JSON.stringify({
              file: inputFile,
              section: sectionName,
              item: item.name || "anonymous",
              parts: splitItems.length,
              tokens
            }) + "\n"
          );

          for (const splitItem of splitItems) {
            const splitTokens = estimateTokens(JSON.stringify(splitItem));
            // console.log(`Preparing chunk ${chunkCount}: ${splitTokens} tokens`);
            chunks.push({ chunk: [splitItem], chunkId: chunkCount, version });
            await fs.writeFile(
              `${outputDir}/${path.basename(inputFile, ".signatures.json")}_${chunkCount}.chunk.json`,
              JSON.stringify([splitItem], null, 2)
            );
            // console.log(
            //   `Chunked ${chunkCount} → ${outputDir}/${path.basename(inputFile, ".signatures.json")}_${chunkCount}.chunk.json (${splitTokens} tokens)`
            // );
            chunkCount++;
          }
        } else {
          // Start new chunk with current item
          currentChunk = [item];
          currentTokens = tokens;
        }
      }
    }

    // Save final chunk if it has items
    if (currentChunk.length > 0) {
      // console.log(`Preparing chunk ${chunkCount}: ${currentTokens} tokens`);
      chunks.push({ chunk: currentChunk, chunkId: chunkCount, version });
      await fs.writeFile(
        `${outputDir}/${path.basename(inputFile, ".signatures.json")}_${chunkCount}.chunk.json`,
        JSON.stringify(currentChunk, null, 2)
      );
      // console.log(
      //   `Chunked ${chunkCount} → ${outputDir}/${path.basename(inputFile, ".signatures.json")}_${chunkCount}.chunk.json (${currentTokens} tokens)`
      // );
      chunkCount++;
    }
  };

  await fs.mkdir(outputDir, { recursive: true });
  for (const section of [
    ["functions", data.functions],
    ["enums", data.enums],
    ["types", data.types],
    ["classes", data.classes],
    ["constants", data.constants],
    ["namespaces", data.namespaces]
  ]) {
    await processSection(section[1], section[0]);
  }

  // console.log(`Total chunks created: ${chunks.length}`);
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
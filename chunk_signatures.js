const fs = require("fs").promises;
const path = require("path");

async function chunkSignatures(inputFile, outputDir, maxItems = 5) { // Reduced to 5
  const json = JSON.parse(await fs.readFile(inputFile, "utf-8"));
  await fs.mkdir(outputDir, { recursive: true });

  const sections = ["functions", "enums", "types", "classes", "constants", "namespaces"];
  const chunks = [];
  const baseName = path.basename(inputFile, ".signatures.json");

  for (const section of sections) {
    if (json[section]?.length > 0) {
      if (section === "functions" && json[section].length > maxItems) {
        for (let i = 0; i < json[section].length; i += maxItems) {
          const chunk = {
            [section]: json[section].slice(i, i + maxItems),
            version: json.version
          };
          const chunkFile = `${outputDir}/${baseName}.${section}_${Math.floor(i / maxItems)}.chunk.json`;
          await fs.writeFile(chunkFile, JSON.stringify(chunk, null, 2));
          chunks.push(chunkFile);
          console.log(`Chunked ${section} part ${Math.floor(i / maxItems)} → ${chunkFile}`);
        }
      } else {
        const chunk = { [section]: json[section], version: json.version };
        const chunkFile = `${outputDir}/${baseName}.${section}.chunk.json`;
        await fs.writeFile(chunkFile, JSON.stringify(chunk, null, 2));
        chunks.push(chunkFile);
        console.log(`Chunked ${section} → ${chunkFile}`);
      }
    }
  }

  return chunks;
}

async function reassembleChunks(chunkFiles, outputFile) {
  const merged = { functions: [], enums: [], types: [], classes: [], constants: [], namespaces: [], version: "unknown" };
  for (const file of chunkFiles) {
    const chunk = JSON.parse(await fs.readFile(file, "utf-8"));
    for (const [key, value] of Object.entries(chunk)) {
      if (key === "version") merged.version = value;
      else if (value?.length) merged[key] = merged[key].concat(value);
    }
  }
  await fs.writeFile(outputFile, JSON.stringify(merged, null, 2));
  console.log(`Reassembled → ${outputFile}`);
}

async function main() {
  const testFile = "./libraryDefs/extracted/axios-1.8.4.signatures.json";
  const chunks = await chunkSignatures(testFile, "./libraryDefs/splited", 5);
  console.log("Chunks:", chunks);
}

if (require.main === module) main().catch(console.error);

module.exports = { chunkSignatures, reassembleChunks };
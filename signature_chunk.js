const fs = require("fs").promises;
const path = require("path");
const _ = require("lodash");

async function chunkSignatures(inputFile, outputDir, maxItems = 50) { // Bump to 50
  console.log(`Processing input file: ${inputFile}`);
  if (!(await fs.stat(inputFile).catch(() => false))) {
    console.error(`Input file ${inputFile} does not exist`);
    return [];
  }

  const json = JSON.parse(await fs.readFile(inputFile, "utf-8"));
  console.log(`Parsed JSON from ${inputFile}, sections: ${Object.keys(json)}`);
  await fs.mkdir(outputDir, { recursive: true });
  const sections = ["functions", "enums", "types", "classes", "constants", "namespaces"];
  const chunks = [];
  const baseName = path.basename(inputFile, ".signatures.json");

  for (const section of sections) {
    if (json[section]?.length > 0) {
      console.log(`${section} has ${json[section].length} items`);
      const sectionChunks = _.chunk(json[section], section === "functions" ? maxItems : Infinity);
      sectionChunks.forEach((chunk, i) => {
        const chunkData = { [section]: chunk, version: json.version };
        const chunkFile = `${outputDir}/${baseName}.${section}${i > 0 ? `_${i}` : ""}.chunk.json`;
        fs.writeFile(chunkFile, JSON.stringify(chunkData, null, 2));
        chunks.push(chunkFile);
        console.log(`Chunked ${section} part ${i} → ${chunkFile}`);
      });
    } else {
      console.log(`${section} is empty or missing`);
    }
  }

  return chunks;
}

async function main() {
  console.log("Step 3: Chunking signatures...");
  const extractedDir = "./libraryDefs/extracted";
  const outputDir = "./libraryDefs/chunked";
  const files = await fs.readdir(extractedDir);
  console.log(`Found ${files.length} files in ${extractedDir}:`, files);

  for (const file of files) {
    if (file.endsWith(".signatures.json")) {
      const inputFile = `${extractedDir}/${file}`;
      await chunkSignatures(inputFile, outputDir);
    }
  }
}

if (require.main === module) main().catch(error => {
  console.error("Chunking failed:", error);
  process.exit(1);
});

module.exports = { chunkSignatures };
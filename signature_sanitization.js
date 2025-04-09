const fs = require("fs").promises;
const path = require("path");

function cleanObject(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => [k, typeof v === "object" && !Array.isArray(v) ? cleanObject(v) : v])
  );
}

function dedupeConstants(constants) {
  const seen = new Map();
  return constants.filter(c => {
    const key = `${c.name}:${c.value}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

async function sanitizeSignatures(inputFile) {
  console.log(`Sanitizing input file: ${inputFile}`);
  if (!(await fs.stat(inputFile).catch(() => false))) {
    console.error(`Input file ${inputFile} does not exist`);
    return;
  }

  const json = JSON.parse(await fs.readFile(inputFile, "utf-8"));
  const outputDir = "./libraryDefs/cleaned";
  await fs.mkdir(outputDir, { recursive: true });

  if (json.constants) json.constants = dedupeConstants(json.constants);
  const cleanedJson = cleanObject(json);
  const baseName = path.basename(inputFile, ".chunk.json");
  const outputPath = `${outputDir}/${baseName}.sanitized.json`;
  await fs.writeFile(outputPath, JSON.stringify(cleanedJson, null, 2));
  console.log(`Sanitized chunk → ${outputPath}`);
}

async function main() {
  console.log("Step 4: Sanitizing chunks...");
  const chunkedDir = "./libraryDefs/chunked";
  const files = await fs.readdir(chunkedDir);
  console.log(`Found ${files.length} files in ${chunkedDir}:`, files);

  for (const file of files) {
    if (file.endsWith(".chunk.json")) {
      await sanitizeSignatures(`${chunkedDir}/${file}`);
    }
  }
}

if (require.main === module) main().catch(error => {
  console.error("Sanitization failed:", error);
  process.exit(1);
});

module.exports = { sanitizeSignatures };
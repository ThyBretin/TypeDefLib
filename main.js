require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const { extractSignatures } = require("./signature_extraction");
const { crawlDtsFiles } = require("./dts_finder");
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

async function checkR2Exists(key) {
  console.log(`Checking R2 for key: ${key}, Bucket: ${process.env.R2_BUCKET}`);
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key
    }));
    return true;
  } catch (e) {
    if (e.name === "NotFound") return false;
    throw e;
  }
}

function mergeDefs(defsArray) {
  const merged = { 
    functions: [], 
    enums: [], 
    types: [], 
    classes: [], 
    constants: [], 
    namespaces: [], 
    version: defsArray[0]?.version || "unknown" 
  };
  
  defsArray.forEach(defs => {
    merged.functions.push(...(defs.functions || []));
    merged.enums.push(...(defs.enums || []));
    merged.types.push(...(defs.types || []));
    merged.classes.push(...(defs.classes || []));
    merged.constants.push(...(defs.constants || []));
    merged.namespaces.push(...(defs.namespaces || []));
  });

  const dedupeByName = (array, key) => {
    const seen = new Set();
    return array.filter(item => {
      const id = item[key];
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  merged.functions = dedupeByName(merged.functions, "name");
  merged.enums = dedupeByName(merged.enums, "name");
  merged.types = dedupeByName(merged.types, "name");
  merged.classes = dedupeByName(merged.classes, "name");
  merged.constants = dedupeByName(merged.constants, "name");
  merged.namespaces = dedupeByName(merged.namespaces, "name");

  return merged;
}

async function main() {
  console.log("Step 2: Starting extraction...");
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) {
    throw new Error("Missing R2 credentials in .env! Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET");
  }

  const libraryData = JSON.parse(await fs.readFile("./library.json", "utf-8"));
  const packages = libraryData.packages;
  const pendingPackage = Object.entries(packages).find(([_, pkg]) => pkg.status === "pending");

  if (!pendingPackage) {
    console.log("No pending packages to process in library.json");
    return;
  }

  const [name, { version }] = pendingPackage;
  const baseName = name.split("/").pop();
  const outputFile = `./libraryDefs/extracted/${baseName}-${version}.signatures.json`;
  const r2Key = `${baseName}-${version}.graph.json`;

  if (await checkR2Exists(r2Key)) {
    console.log(`Skipping ${name}-${version}—exists in R2`);
    packages[name].status = "done";
    await fs.writeFile("./library.json", JSON.stringify(libraryData, null, 2));
    return;
  }

  packages[name].status = "processing";
  await fs.writeFile("./library.json", JSON.stringify(libraryData, null, 2));

  const dtsStorePath = `./libraryDefs/dts_store/${name}-${version}.json`;
  let dtsFiles = [];
  if (await fs.stat(dtsStorePath).catch(() => false)) {
    dtsFiles = JSON.parse(await fs.readFile(dtsStorePath, "utf-8")).files;
    console.log(`Loaded ${dtsFiles.length} .d.ts files from store:`, dtsFiles);
  } else {
    const { dtsFiles: crawledFiles, logs } = await crawlDtsFiles(name, version);
    console.log("Crawl logs:", logs);
    dtsFiles = crawledFiles;
  }

  if (dtsFiles.length === 0) {
    console.error(`No .d.ts files found for ${name}-${version}`);
    packages[name].status = "failed";
    await fs.writeFile("./library.json", JSON.stringify(libraryData, null, 2));
    return;
  }

  console.log(`Extracting signatures from ${dtsFiles.length} .d.ts files for ${name}:`, dtsFiles);
  const allDefs = [];
  for (const dtsPath of dtsFiles) {
    console.log(`Processing ${dtsPath}`);
    try {
      const defs = extractSignatures(dtsPath, name, version);
      allDefs.push(defs);
    } catch (e) {
      console.error(`Failed to extract ${dtsPath}:`, e);
    }
  }

  const mergedDefs = mergeDefs(allDefs);
  await fs.mkdir("./libraryDefs/extracted", { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(mergedDefs, null, 2));
  console.log(`Signatures extracted for ${name} to ${outputFile}`);

  packages[name].status = "done";
  await fs.writeFile("./library.json", JSON.stringify(libraryData, null, 2));
}

if (require.main === module) main().catch(error => {
  console.error("Extraction failed:", error);
  process.exit(1);
});
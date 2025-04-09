require("dotenv").config(); // Add this to load .env
const fs = require("fs").promises;
const path = require("path");
const { extractSignatures } = require("./signature_extraction");
const { findDtsFiles } = require("./dts_finder");
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
  console.log(`Checking R2 for key: ${key}, Bucket: ${process.env.R2_BUCKET}`); // Debug
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

async function main() {
  console.log("Step 2: Starting extraction...");
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) {
    throw new Error("Missing R2 credentials in .env! Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET");
  }

  const { libraries } = await findDtsFiles("./package.json");
  await fs.mkdir("./libraryDefs/extracted", { recursive: true });

  for (const lib of libraries) {
    const { name, dtsPath, version } = lib;
    const baseName = name.split("/").pop();
    const outputFile = `./libraryDefs/finalized/${baseName}-${version}.graph.json`;
    const r2Key = `${baseName}-${version}.graph.json`;

    if (await checkR2Exists(r2Key)) {
      console.log(`Skipping ${name}-${version}—exists in R2`);
      continue;
    }

    if (!await fs.stat(dtsPath).catch(() => false)) {
      console.error(`No .d.ts file at ${dtsPath} for ${name}`);
      continue;
    }
    const defs = extractSignatures(dtsPath, name, version);
    await fs.writeFile(`./libraryDefs/extracted/${baseName}-${version}.signatures.json`, JSON.stringify(defs, null, 2));
    console.log(`Signatures extracted for ${name}`);
  }
}

if (require.main === module) main().catch(error => {
  console.error("Extraction failed:", error);
  process.exit(1);
});
require("dotenv").config();
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// New reassembleChunks function
async function reassembleChunks(chunkFiles, outputFile) {
  console.log(`Reassembling ${chunkFiles.length} chunks into ${outputFile}`);
  const combined = {
    version: null,
    functions: [],
    enums: [],
    types: [],
    classes: [],
    constants: [],
    namespaces: []
  };
  const namespaceMap = new Map();

  for (const chunkFile of chunkFiles) {
    let chunkData;
    try {
      const fileContent = await fs.readFile(chunkFile, "utf-8");
      chunkData = JSON.parse(fileContent);
      console.log(`Processing ${chunkFile}: ${fileContent.slice(0, 200)}...`);
    } catch (e) {
      console.error(`Error parsing ${chunkFile}: ${e.message}`);
      continue;
    }

    // If numeric-keyed object, treat as array
    if (typeof chunkData === "object" && !Array.isArray(chunkData) && chunkData !== null) {
      const keys = Object.keys(chunkData);
      if (keys.every(k => !isNaN(Number(k)))) {
        chunkData = keys.map(k => chunkData[k]);
      } else if (keys.length === 1 && typeof chunkData[keys[0]] === "object") {
        // Unwrap single-key object (e.g., { "0": { ... } })
        chunkData = [chunkData[keys[0]]];
      }
    }

    // Now, chunkData is either an array or a single object
    const items = Array.isArray(chunkData) ? chunkData : [chunkData];

    for (const item of items) {
      if (!item) continue;
      // If this is a namespace-like object (has functions/types/etc.), merge into combined
      let mergedNamespace = false;
      if (item.functions || item.types || item.enums || item.classes || item.constants) {
        for (const key of ["functions", "types", "enums", "classes", "constants"]) {
          if (item[key]) combined[key].push(...item[key]);
        }
        if (item.name) {
          combined.namespaces.push(item);
          mergedNamespace = true;
        }
      }
      if (!mergedNamespace) {
        if (item.name && item.contents) {
          combined.namespaces.push(item);
        } else if (item.name && item.type) {
          combined.types.push(item);
        } else if (item.name && Array.isArray(item.parameters)) {
          combined.functions.push(item);
        } else if (item.name && Array.isArray(item.methods)) {
          combined.classes.push(item);
        } else if (item.name && item.value !== undefined) {
          combined.constants.push(item);
        } else if (item.name && Array.isArray(item.members)) {
          combined.enums.push(item);
        }
      }
    }
  }

  // Remove duplicates in arrays (by name)
  function dedupe(arr) {
    const seen = new Set();
    return arr.filter(x => x && x.name && !seen.has(x.name) && seen.add(x.name));
  }
  for (const key of ["functions", "types", "enums", "classes", "constants", "namespaces"]) {
    combined[key] = dedupe(combined[key]);
  }

  console.log(`Combined data: ${JSON.stringify(combined, null, 2).slice(0, 500)}...`);
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(combined, null, 2));
  console.log(`Assembled chunks into ${outputFile}`);
}

async function refineWithXAI(filePath, apiKey, failedChunks, retries = 2) {
  const refinedPath = `./libraryDefs/refined/${path.basename(filePath).replace(".sanitized.json", ".refined.json")}`;
  if (await fs.stat(refinedPath).catch(() => false)) {
    console.log(`Skipping ${filePath}—already refined`);
    return refinedPath;
  }

  console.log(`Starting refinement for ${filePath}`);
  const json = JSON.parse(await fs.readFile(filePath, "utf-8"));
  const prompt = `
You’re Grok from xAI. Refine this JSON chunk from ${json.version || "a library"}:
${JSON.stringify(json, null, 2)}

Add concise JSDoc (max 20 words) for functions, methods, classes, and types if missing or vague (as "xaiDescription"). Skip simple constants/enums unless undocumented. Link to types (e.g., "Uses List<T>"). Keep structure intact.

Return only raw JSON—no text, no Markdown, no \`\`\`.
`;
  console.log(`Prompt length for ${filePath}: ${prompt.length} chars`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Calling xAI API for ${filePath}, attempt ${attempt + 1}`);
      const response = await axios.post("https://api.x.ai/v1/chat/completions", {
        model: "grok-3-mini-beta",
        messages: [
          { role: "system", content: "You are Grok from xAI. Return only JSON, no commentary, no Markdown." },
          { role: "user", content: prompt }
        ]
      }, {
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }
      });

      await fs.writeFile(`${filePath}.raw`, JSON.stringify(response.data, null, 2));

      if (!response.data.choices || !response.data.choices[0]) {
        throw new Error("No choices returned from xAI API");
      }

      let refinedText = response.data.choices[0].message.content;
      refinedText = refinedText.replace(/```json/g, "").replace(/```/g, "").trim();
      let refinedJson;
      try {
        refinedJson = JSON.parse(refinedText);
      } catch (e) {
        console.warn(`Invalid JSON from xAI for ${filePath}: ${e.message}`);
        let salvagedText = refinedText;
        const lastBracket = salvagedText.lastIndexOf("]");
        const lastBrace = salvagedText.lastIndexOf("}");
        if (lastBracket > lastBrace && lastBracket < salvagedText.length - 1) {
          salvagedText = salvagedText.substring(0, lastBracket + 1) + "}";
        } else if (lastBrace > 0) {
          salvagedText = salvagedText.substring(0, lastBrace + 1);
        }
        try {
          refinedJson = JSON.parse(salvagedText);
          console.log(`Salvaged JSON for ${filePath}`);
        } catch (e2) {
          console.warn(`Salvage failed: ${e2.message}, raw: ${salvagedText.slice(-50)}`);
          if (attempt === retries) {
            failedChunks.push({ file: filePath, error: e.message });
            console.log(`Skipping ${filePath} due to unrecoverable JSON error after ${retries + 1} attempts`);
            return null;
          }
          continue;
        }
      }

      await fs.mkdir("./libraryDefs/refined", { recursive: true });
      await fs.writeFile(refinedPath, JSON.stringify(refinedJson, null, 2));
      console.log(`Refined ${filePath} → ${refinedPath}`);
      return refinedPath;
    } catch (error) {
      console.error(`Failed to refine ${filePath} (attempt ${attempt + 1}): ${error.message}`);
      if (error.response) console.error("Response body:", JSON.stringify(error.response.data, null, 2));
      if (attempt === retries) {
        failedChunks.push({ file: filePath, error: error.message });
        console.log(`Skipping ${filePath} due to API error after ${retries + 1} attempts`);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  console.log(`All retries failed for ${filePath}`);
  return null;
}

async function moveRefinedFilesToBin(baseName) {
  const refinedDir = "./libraryDefs/refined";
  const binDir = "./libraryDefs/bin";
  await fs.mkdir(binDir, { recursive: true });
  if (await fs.stat(refinedDir).catch(() => false)) {
    const files = await fs.readdir(refinedDir);
    for (const file of files) {
      if (file.startsWith(baseName)) {
        const src = path.join(refinedDir, file);
        const dest = path.join(binDir, file);
        try {
          await fs.rename(src, dest);
          console.log(`Moved refined file ${src} to ${dest}`);
        } catch (e) {
          console.error(`Failed to move ${src} to ${dest}: ${e.message}`);
        }
      }
    }
  }
}

async function cleanupIntermediates(baseName) {
  const dirs = ["extracted", "chunked", "cleaned", "refined"];
  for (const dir of dirs) {
    const fullDir = `./libraryDefs/${dir}`;
    if (await fs.stat(fullDir).catch(() => false)) {
      const files = await fs.readdir(fullDir);
      for (const file of files) {
        if (file.startsWith(baseName)) {
          if (dir === "refined") {
            // Move to bin instead of deleting
            await moveRefinedFilesToBin(baseName);
          } else {
            await fs.rm(path.join(fullDir, file), { recursive: true, force: true });
            console.log(`Cleaned up ${path.join(fullDir, file)}`);
          }
        }
      }
    }
  }
}

async function uploadToR2(outputFile) {
  const fileContent = await fs.readFile(outputFile);
  const key = path.basename(outputFile);
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: fileContent,
    ContentType: "application/json"
  });
  await s3Client.send(command);
  console.log(`Uploaded ${outputFile} to R2 at ${key}`);
}

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

async function main() {
  console.log("Step 5: Refining with xAI...");
  const apiKey = process.env.xAIKey;
  if (!apiKey) throw new Error("Please set xAIKey in .env file!");
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) {
    throw new Error("Missing R2 credentials in .env!");
  }

  const cleanedDir = "./libraryDefs/cleaned";
  // Ensure cleanedDir exists before reading
  try {
    await fs.mkdir(cleanedDir, { recursive: true });
  } catch (err) {
    console.error(`Failed to create directory ${cleanedDir}:`, err);
    throw err;
  }
  const files = await fs.readdir(cleanedDir);
  console.log(`Found ${files.length} files in ${cleanedDir}:`, files);
  const refinedFiles = [];
  const failedChunks = [];

  for (const file of files) {
    if (file.endsWith(".sanitized.json")) {
      const fullPath = `${cleanedDir}/${file}`;
      console.log(`Processing ${fullPath}`);
      const refinedFile = await refineWithXAI(fullPath, apiKey, failedChunks);
      console.log(`Refinement result for ${fullPath}: ${refinedFile}`);
      if (refinedFile) refinedFiles.push(refinedFile);
    }
  }

  console.log(`Refined files before finalization:`, refinedFiles);
  if (refinedFiles.length) {
    const baseNameMatch = path.basename(refinedFiles[0]).match(/^([a-z]+-\d+\.\d+\.\d+)/);
    if (!baseNameMatch) throw new Error(`Failed to parse baseName from ${refinedFiles[0]}`);
    const baseName = baseNameMatch[0];
    const outputFile = `./libraryDefs/finalized/${baseName}.graph.json`;
    const r2Key = `${baseName}.graph.json`;

    if (!(await checkR2Exists(r2Key))) {
      await fs.mkdir("./libraryDefs/finalized", { recursive: true });
      await reassembleChunks(refinedFiles, outputFile);
      await uploadToR2(outputFile);
      await cleanupIntermediates(baseName);
    } else {
      console.log(`Skipping ${baseName}—exists in R2`);
    }
  } else {
    console.log("No refined files to finalize—check failed chunks or refinement step.");
  }

  if (failedChunks.length > 0) {
    console.log("\nFailed Chunks Summary:");
    failedChunks.forEach(failure => {
      console.log(`- ${failure.file}: ${failure.error}`);
    });
    await fs.writeFile("./libraryDefs/failed_chunks.json", JSON.stringify(failedChunks, null, 2));
    console.log("Failed chunks logged to ./libraryDefs/failed_chunks.json");
  } else {
    console.log("\nAll chunks refined successfully!");
  }
}

if (require.main === module) main().catch(error => {
  console.error("Refinement failed unexpectedly:", error);
  process.exit(1);
});
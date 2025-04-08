require("dotenv").config();
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { reassembleChunks } = require("./chunk_signatures");

async function refineWithXAI(filePath, apiKey, failedChunks) {
  const refinedPath = `./libraryDefs/refined/${path.basename(filePath).replace(".sanitized.json", ".refined.json")}`;
  if (await fs.stat(refinedPath).catch(() => false)) {
    console.log(`Skipping ${filePath}—already refined`);
    return refinedPath;
  }

  const json = JSON.parse(await fs.readFile(filePath, "utf-8"));
  const prompt = `
You’re Grok from xAI. Refine this JSON chunk from ${json.version || "a library"}:
${JSON.stringify(json, null, 2)}

Add concise JSDoc (max 20 words) for functions, methods, classes, and types if missing or vague (as "xaiDescription"). Skip simple constants/enums unless undocumented. Link to types (e.g., "Uses List<T>"). Keep structure intact.

Return only raw JSON—no text, no Markdown, no \`\`\`.
`;
  try {
    const response = await axios.post("https://api.x.ai/v1/chat/completions", {
      model: "grok-2-1212",
      messages: [
        { role: "system", content: "You are Grok from xAI. Return only JSON, no commentary, no Markdown." },
        { role: "user", content: prompt }
      ]
    }, {
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }
    });

    let refinedText = response.data.choices[0].message.content;
    await fs.writeFile(`${filePath}.raw`, refinedText);
    console.log(`Raw xAI response dumped to ${filePath}.raw`);

    refinedText = refinedText.replace(/```json/g, "").replace(/```/g, "").trim();
    let refinedJson;
    try {
      refinedJson = JSON.parse(refinedText);
    } catch (e) {
      console.warn(`Invalid JSON from xAI for ${filePath}: ${e.message}`);
      const lastBrace = refinedText.lastIndexOf("}");
      if (lastBrace > 0) {
        refinedText = refinedText.substring(0, lastBrace + 1);
        try {
          refinedJson = JSON.parse(refinedText);
          console.log(`Salvaged partial JSON for ${filePath}`);
        } catch (e2) {
          console.warn(`Salvage failed: ${e2.message}`);
          failedChunks.push({ file: filePath, error: e.message });
          console.log(`Skipping ${filePath} due to unrecoverable JSON error`);
          return null;
        }
      } else {
        failedChunks.push({ file: filePath, error: e.message });
        console.log(`Skipping ${filePath} due to unrecoverable JSON error`);
        return null;
      }
    }

    await fs.mkdir("./libraryDefs/refined", { recursive: true });
    await fs.writeFile(refinedPath, JSON.stringify(refinedJson, null, 2));
    console.log(`Refined ${filePath} → ${refinedPath}`);
    return refinedPath;
  } catch (error) {
    console.error(`Failed to refine ${filePath}: ${error.message}`);
    if (error.response) console.error("Body:", error.response.data);
    failedChunks.push({ file: filePath, error: error.message });
    console.log(`Skipping ${filePath} due to API error`);
    return null;
  }
}

async function cleanupIntermediates() {
  const dirs = ["extracted", "splited", "cleaned", "refined"];
  for (const dir of dirs) {
    const fullDir = `./libraryDefs/${dir}`;
    if (await fs.stat(fullDir).catch(() => false)) {
      await fs.rm(fullDir, { recursive: true, force: true });
      console.log(`Cleaned up ${fullDir}`);
    }
  }
}

async function main() {
  console.log("Step 4: Refining with xAI...");
  const apiKey = process.env.xAIKey;
  if (!apiKey) throw new Error("Please set xAIKey in .env file!");

  const cleanedDir = "./libraryDefs/cleaned";
  const files = await fs.readdir(cleanedDir);
  const refinedFiles = [];
  const failedChunks = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.endsWith(".sanitized.json")) {
      const refinedFile = await refineWithXAI(`${cleanedDir}/${file}`, apiKey, failedChunks);
      if (refinedFile) refinedFiles.push(refinedFile);
    }
  }

  if (refinedFiles.length) {
    // Use the full base name including version (e.g., axios-1.8.4)
    const baseName = path.basename(refinedFiles[0]).match(/^(axios-\d+\.\d+\.\d+)/)[0];
    const outputFile = `./libraryDefs/finalized/${baseName}.graph.json`;
    if (!await fs.stat(outputFile).catch(() => false)) {
      await fs.mkdir("./libraryDefs/finalized", { recursive: true }); // Create finalized dir
      await reassembleChunks(refinedFiles, outputFile);
    } else {
      console.log(`Skipping reassembly—${outputFile} already exists`);
    }

    const cleanup = false;
    if (cleanup) await cleanupIntermediates();
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
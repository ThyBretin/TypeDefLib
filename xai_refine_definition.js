require("dotenv").config();
const axios = require("axios");
const fs = require("fs").promises;

async function refineWithXAI(filePath, apiKey) {
  const json = JSON.parse(await fs.readFile(filePath, "utf-8"));
  const prompt = `
You’re Grok from xAI. Here’s JSON signatures from ${json.version || "a library"}:
- "functions": [{name, parameters[{name, type, optional}], returnType, jsdoc}]
- "enums": [{name, members[{name, value}], jsdoc}]
- "types": [{name, type, properties[{name, type, optional}], extends, jsdoc}]
- "classes": [{name, constructors, methods, properties, extends, implements, jsdoc}]
- "constants": [{name, type, value, jsdoc}]
- "namespaces": [{name, contents{functions, enums, types, classes, constants}, jsdoc}]

Refine it—add JSDoc for functions, methods, types, etc. Use existing jsdoc (as "originalDescription") or craft concise ones (as "xaiDescription"). Link to types/enums/classes (e.g., "Uses List<T>"). Keep the structure intact—same keys, just enhanced with JSDoc.

Output:
- Refined JSON with added JSDoc fields.
`;
  try {
    const response = await axios.post("https://api.x.ai/v1/chat/completions", {
      model: "grok-2-1212", // Grok 2 API model—stable and available
      messages: [
        { role: "system", content: "You are Grok from xAI." },
        { role: "user", content: prompt + JSON.stringify(json) }
      ]
    }, {
      headers: { 
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error("Invalid response from xAI: no refined JSON");
    }

    const refinedJson = JSON.parse(response.data.choices[0].message.content);

    // Circular Check
    const missing = validateRefinement(json, refinedJson);
    if (missing.length > 0) {
      console.warn(`xAI missed stuff in ${filePath}: ${missing.join(", ")}. Retrying...`);
      const retryPrompt = `${prompt}\n\nLast time, you missed JSDoc for: ${missing.join(", ")}. Fix it.`;
      const retryResponse = await axios.post("https://api.x.ai/v1/chat/completions", {
        model: "grok-2-1212",
        messages: [
          { role: "system", content: "You are Grok from xAI." },
          { role: "user", content: retryPrompt + JSON.stringify(json) }
        ],
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }
      });
      const retryJson = JSON.parse(retryResponse.data.choices[0].message.content);
      const retryMissing = validateRefinement(json, retryJson);
      if (retryMissing.length > 0) {
        throw new Error(`Retry failed—still missing: ${retryMissing.join(", ")}`);
      }
      return retryJson;
    }

    await fs.mkdir("./libraryDefs/refined", { recursive: true });
    const outputPath = `./libraryDefs/refined/${filePath.split("/").pop().replace(".cleaned.json", ".refined.json")}`;
    await fs.writeFile(outputPath, JSON.stringify(refinedJson, null, 2));
    console.log(`Refined ${filePath} → ${outputPath}`);
    return refinedJson;
  } catch (error) {
    console.error(`Failed to refine ${filePath}: ${error.message}`);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Body:", error.response.data);
    }
    throw error;
  }
}

function validateRefinement(original, refined) {
  const missing = [];
  const checkSection = (orig, ref, section, parent = "") => {
    if (!orig[section] || !Array.isArray(orig[section])) return;
    orig[section].forEach((item, i) => {
      const refItem = ref[section]?.[i];
      const name = item.name || `${section}[${i}]`;
      if (!refItem) {
        missing.push(`${parent}${name}`);
      } else if (!refItem.jsdoc || (!refItem.jsdoc.originalDescription && !refItem.jsdoc.xaiDescription)) {
        missing.push(`${parent}${name}.jsdoc`);
      }
    });
  };

  checkSection(original, refined, "functions");
  checkSection(original, refined, "enums");
  checkSection(original, refined, "types");
  checkSection(original, refined, "classes");
  checkSection(original, refined, "constants");
  if (original.namespaces) {
    original.namespaces.forEach((ns, i) => {
      const refNs = refined.namespaces?.[i];
      if (refNs && ns.contents) {
        checkSection(ns.contents, refNs.contents, "functions", `${ns.name}.`);
        checkSection(ns.contents, refNs.contents, "enums", `${ns.name}.`);
        checkSection(ns.contents, refNs.contents, "types", `${ns.name}.`);
        checkSection(ns.contents, refNs.contents, "classes", `${ns.name}.`);
        checkSection(ns.contents, refNs.contents, "constants", `${ns.name}.`);
      }
    });
  }
  return missing;
}

async function main() {
  console.log("Step 4: Refining with xAI...");
  const apiKey = process.env.xAIKey;
  if (!apiKey) {
    console.error("Please set xAIKey in .env file!");
    return;
  }

  const testFile = "./libraryDefs/clean/axios-1.8.4.cleaned.json";
  if (!await fs.stat(testFile).catch(() => false)) {
    console.error(`Test file not found: ${testFile}`);
    return;
  }
  await refineWithXAI(testFile, apiKey);
}

main().catch(error => {
  console.error("Refinement failed:", error);
  process.exit(1);
});
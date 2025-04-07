const axios = require("axios");
const fs = require("fs").promises;

async function refineWithXAI(filePath, apiKey) {
  const json = JSON.parse(await fs.readFile(filePath, "utf-8"));
  const prompt = `
You’re Grok 3 from xAI. I’ve got JSON signatures from ${json.version ? json.version : "a library"}:
- "functions": [{name, parameters[{name, type, optional}], returnType, jsdoc}]
- "enums": [{name, members[{name, value}], jsdoc}]
- "types": [{name, type, properties[{name, type, optional}], extends, jsdoc}]
- "classes": [{name, constructors, methods, properties, extends, implements, jsdoc}]
- "constants": [{name, type, value, jsdoc}]
- "namespaces": [{name, contents{functions, enums, types, classes, constants}, jsdoc}]

For this:
1. Generate JSDoc for functions, methods—use existing jsdoc (as "originalDescription") or craft concise ones (as "xaiDescription"). Link to types/enums/classes (e.g., "Uses List<T>").
2. Build ParticleGraph nodes (e.g., "useState:Function", "AxiosError:Class") and edges (e.g., "map -> List").

Output:
- JSDoc text (\`refined/${filePath.split("/").pop().replace(".cleaned.json", ".jsdoc.txt")}\`).
- Graph JSON (\`refined/${filePath.split("/").pop().replace(".cleaned.json", ".graph.json")}\`) with { nodes: [{ id, label, type }], edges: [{ from, to }] }.
`;
  const response = await axios.post("https://api.xai.com/grok", { // Replace with real endpoint
    prompt,
    data: json
  }, {
    headers: { "Authorization": `Bearer ${apiKey}` }
  });

  const { jsdoc, graph } = response.data;
  if (!fs.existsSync("./libraryDefs/refined")) {
    fs.mkdirSync("./libraryDefs/refined", { recursive: true });
  }
  await fs.writeFile(`./libraryDefs/refined/${filePath.split("/").pop().replace(".cleaned.json", ".jsdoc.txt")}`, jsdoc);
  await fs.writeFile(`./libraryDefs/refined/${filePath.split("/").pop().replace(".cleaned.json", ".graph.json")}`, JSON.stringify(graph, null, 2));
  console.log(`Refined ${filePath}`);
}

async function main() {
  console.log("Step 4: Refining with xAI...");
  const apiKey = "your-xai-api-key-here";
  const libraries = JSON.parse(await fs.readFile("./libraries.json", "utf8"));
  for (const lib of libraries) {
    const { name, version } = lib;
    const baseName = name.split("/").pop();
    const filePath = `./libraryDefs/clean/${baseName}-${version}.cleaned.json`;
    if (!await fs.stat(filePath).catch(() => false)) {
      console.error(`File not found: ${filePath}`);
      continue;
    }
    await refineWithXAI(filePath, apiKey);
  }
}

main().catch(console.error);
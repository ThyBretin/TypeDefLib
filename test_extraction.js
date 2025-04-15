const { extractSignatures } = require("./signature_extraction");

async function test() {
  const dtsFiles = [
    "/Users/Thy/TypeDefLib/node_modules/react/index.d.ts" // Adjust to your .d.ts path
  ];
  const defs = await extractSignatures(dtsFiles, "react", "19.1.0");
  await require("fs").promises.writeFile("extraction_test.json", JSON.stringify(defs, null, 2));
  console.log("Extraction output written to extraction_test.json");
  console.log(`Namespaces: ${defs.namespaces.length}, Types: ${defs.namespaces[0]?.contents.types.length || 0}`);
}

test().catch(e => {
  console.error("Extraction test failed:", e);
  process.exit(1);
});
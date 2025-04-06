const ts = require("typescript");

function extractJSDoc(node) {
  const jsDoc = node?.jsDoc?.[0];
  if (!jsDoc) return null;
  const description = typeof jsDoc.comment === "string" ? jsDoc.comment : jsDoc.comment?.map(c => c.text).join(" ") || "";
  return {
    description,
    params: jsDoc.tags?.filter(t => t.tagName.text === "param").map(t => ({
      name: t.name?.text,
      description: typeof t.comment === "string" ? t.comment : t.comment?.map(c => c.text).join(" ")
    })),
    returns: typeof jsDoc.tags?.find(t => t.tagName.text === "returns")?.comment === "string" 
      ? jsDoc.tags?.find(t => t.tagName.text === "returns")?.comment 
      : jsDoc.tags?.find(t => t.tagName.text === "returns")?.comment?.map(c => c.text).join(" "),
    deprecated: !!jsDoc.tags?.find(t => t.tagName.text === "deprecated")
  };
}

module.exports = { extractJSDoc };
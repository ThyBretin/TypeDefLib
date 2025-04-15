const { SyntaxKind } = require("ts-morph");

function extractJSDoc(node) {
  // Find the closest node with JSDoc (parent or self)
  let jsDocNode = node;
  while (jsDocNode && !jsDocNode.getJsDocs?.().length) {
    jsDocNode = jsDocNode.getParent?.();
    if (!jsDocNode || jsDocNode.getKind?.() === SyntaxKind.SourceFile) {
      return null;
    }
  }

  const jsDocs = jsDocNode?.getJsDocs?.();
  if (!jsDocs || jsDocs.length === 0) {
    return null;
  }

  // Take the last JSDoc comment (closest to declaration)
  const jsDoc = jsDocs[jsDocs.length - 1];
  const description = jsDoc.getDescription()?.trim() || "";
  const tags = jsDoc.getTags().map(tag => ({
    tagName: tag.getTagName(),
    name: tag.getName?.() || "",
    text: tag.getCommentText()?.trim() || ""
  }));

  return {
    description,
    tags
  };
}

module.exports = { extractJSDoc };
const { encoding_for_model } = require("tiktoken");

const tokenizer = encoding_for_model("gpt-3.5-turbo");

async function splitLargeItemByTokens(item, maxTokens) {
  const totalTokens = tokenizer.encode(JSON.stringify(item)).length;
  if (totalTokens <= maxTokens) return [item];

  const parts = [];
  const name = item.name;

  if (Array.isArray(item)) {
    let currentPart = [];
    let currentTokens = 0;
    for (const subItem of item) {
      const subTokens = tokenizer.encode(JSON.stringify(subItem)).length;
      if (currentTokens + subTokens > maxTokens || currentPart.length >= 50) { // Cap at 50 items
        if (currentPart.length > 0) parts.push([...currentPart]);
        currentPart = [subItem];
        currentTokens = subTokens;
      } else {
        currentPart.push(subItem);
        currentTokens += subTokens;
      }
    }
    if (currentPart.length > 0) parts.push(currentPart);
  } else if (typeof item === "object" && item !== null) {
    const entries = Object.entries(item);
    // Only keep high-level progress and warnings/errors
    // Remove or comment out verbose logs
    // console.log(`Splitting ${entries.length} entries`);
    let currentPart = name ? { name } : {};
    let currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;

    for (const [key, value] of entries) {
      if (key === "name") continue;
      const entryTokens = tokenizer.encode(JSON.stringify({ [key]: value })).length;
      // console.log(`Entry ${key}: ${entryTokens} tokens`);

      if (entryTokens > maxTokens) {
        // console.log(`Recursing into ${key} (${entryTokens} tokens)`);
        const subParts = await splitLargeItemByTokens(value, maxTokens);
        for (const subPart of subParts) {
          const subTokens = tokenizer.encode(JSON.stringify(subPart)).length;
          if (currentTokens + subTokens > maxTokens && Object.keys(currentPart).length > (name ? 1 : 0)) {
            parts.push({ ...currentPart });
            // console.log(`Part ${parts.length - 1} tokens: ${tokenizer.encode(JSON.stringify(currentPart)).length}`);
            currentPart = name ? { name } : {};
            currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;
          }
          currentPart[key] = subPart;
          currentTokens += subTokens;
          if (currentTokens > maxTokens) {
            parts.push({ ...(name ? { name } : {}), [key]: subPart });
            // console.log(`Part ${parts.length - 1} tokens: ${subTokens}`);
            currentPart = name ? { name } : {};
            currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;
          }
        }
      } else {
        if (currentTokens + entryTokens > maxTokens && Object.keys(currentPart).length > (name ? 1 : 0)) {
          parts.push({ ...currentPart });
          // console.log(`Part ${parts.length - 1} tokens: ${tokenizer.encode(JSON.stringify(currentPart)).length}`);
          currentPart = name ? { name } : {};
          currentTokens = tokenizer.encode(JSON.stringify(currentPart)).length;
        }
        currentPart[key] = value;
        currentTokens += entryTokens;
      }
    }
    if (Object.keys(currentPart).length > (name ? 1 : 0)) {
      parts.push({ ...currentPart });
      // console.log(`Part ${parts.length - 1} tokens: ${currentTokens}`);
    }
  } else {
    parts.push(item);
  }

    // console.log(`Split parts tokens: ${parts.map(p => tokenizer.encode(JSON.stringify(p)).length).join(", ")}`);
  return parts.filter(part => {
    const tokens = tokenizer.encode(JSON.stringify(part)).length;
    if (tokens > maxTokens) {
      console.warn(`Split part exceeds ${maxTokens}: ${tokens} tokens`);
      return false;
    }
    const hasData = typeof part === "object" && Object.keys(part).some(k => Array.isArray(part[k]) && part[k].length > 0);
    // console.log(`Filtered empty split part: ${JSON.stringify(part)}`);
    return hasData;
  });
}

module.exports = { splitLargeItemByTokens };
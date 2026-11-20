// Sample delivery modes. "links" serves links in place of code, for clients
// such as chat widgets whose replies cannot carry code: tools and resources
// still return docs and sample links, but no code blocks or file contents.
const DELIVERY_FULL = "full";
const DELIVERY_LINKS = "links";

const CODE_OMITTED_NOTE = "(Code omitted on this connection. Share the sample source or documentation link instead.)";

function normalizeDelivery(value) {
  return String(value || "").trim().toLowerCase() === DELIVERY_LINKS ? DELIVERY_LINKS : DELIVERY_FULL;
}

// Install commands stay readable: a short shell block (npm, pip, dotnet add
// package) tells the user how to get the SDK and carries no sample code.
const INSTALL_FENCE_LANGUAGES = new Set(["bash", "sh", "shell", "console", "powershell", "ps", "cmd"]);
const INSTALL_FENCE_MAX_LINES = 3;

// Replaces fenced code blocks (``` or ~~~, any length, closed or running to
// the end of the text) with a short note, including fences that search
// snippets flattened onto one line. Short install blocks are kept as plain
// lines, and inline `code` spans are kept: they carry identifiers and commands
// that a reply can quote safely.
function stripCodeBlocks(text) {
  if (typeof text !== "string" || !text) return text;
  const output = [];
  let fence = null;
  for (const line of text.split("\n")) {
    const match = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
    if (fence) {
      if (match && match[1][0] === fence.marker[0] && match[1].length >= fence.marker.length && line.trim() === match[1]) {
        const keep = INSTALL_FENCE_LANGUAGES.has(fence.language) && fence.body.length <= INSTALL_FENCE_MAX_LINES;
        output.push(...(keep ? fence.body : [CODE_OMITTED_NOTE]));
        fence = null;
      } else {
        fence.body.push(line);
      }
      continue;
    }
    if (match) {
      fence = { marker: match[1], language: match[2].toLowerCase(), body: [] };
      continue;
    }
    output.push(line);
  }
  if (fence) output.push(CODE_OMITTED_NOTE);
  return output
    .join("\n")
    .replace(/(`{3,}|~{3,})[\s\S]*?(?:\1|$)/g, CODE_OMITTED_NOTE);
}

// Applies links-only delivery to a tool result: every text item and link
// description loses its code blocks.
function stripCodeFromToolResult(result) {
  if (!result || !Array.isArray(result.content)) return result;
  return {
    ...result,
    content: result.content.map((item) => ({
      ...item,
      ...(typeof item.text === "string" ? { text: stripCodeBlocks(item.text) } : {}),
      ...(typeof item.description === "string" ? { description: stripCodeBlocks(item.description) } : {})
    }))
  };
}

// Applies links-only delivery to a resource read. Sample resources are raw
// source files with no fences, so they are replaced by their public link;
// documents keep their prose and lose their code blocks.
function toLinksOnlyResource(resource, { getSampleUriSourceUrl = () => "" } = {}) {
  if (!resource) return resource;
  if (String(resource.uri || "").startsWith("sample://")) {
    const sourceUrl = getSampleUriSourceUrl(resource.uri);
    return {
      uri: resource.uri,
      mimeType: "text/markdown",
      text: sourceUrl
        ? `Sample source: ${sourceUrl}\n\nFile contents are not returned on this connection; share the Sample source link.`
        : "File contents are not returned on this connection. Use search or list_samples to find the sample's source link."
    };
  }
  return typeof resource.text === "string" ? { ...resource, text: stripCodeBlocks(resource.text) } : resource;
}

export {
  DELIVERY_FULL,
  DELIVERY_LINKS,
  CODE_OMITTED_NOTE,
  normalizeDelivery,
  stripCodeBlocks,
  stripCodeFromToolResult,
  toLinksOnlyResource
};

import assert from "node:assert/strict";
import test from "node:test";
import {
  CODE_OMITTED_NOTE,
  normalizeDelivery,
  stripCodeBlocks,
  toLinksOnlyResource
} from "../../src/server/helpers/delivery.js";

test("links-only delivery is opt-in; anything but 'links' keeps full delivery", () => {
  assert.equal(normalizeDelivery(" Links "), "links");
  for (const value of [undefined, "", "full", "code", ["links", "full"]]) {
    assert.equal(normalizeDelivery(value), "full", JSON.stringify(value));
  }
});

test("code blocks are replaced by one note each; prose and inline code stay", () => {
  const text = [
    "Install with `dotnet add package X`.",
    "```csharp",
    "static void Main() {}",
    "```",
    "Then run it.",
    "~~~",
    "<script src=\"x.js\"></script>",
    "~~~"
  ].join("\n");

  assert.equal(stripCodeBlocks(text), [
    "Install with `dotnet add package X`.",
    CODE_OMITTED_NOTE,
    "Then run it.",
    CODE_OMITTED_NOTE
  ].join("\n"));
});

test("a fence closes only on a matching marker at least as long, and an unclosed fence hides the rest", () => {
  const nested = ["````md", "```js", "alert(1)", "```", "````", "after"].join("\n");
  assert.equal(stripCodeBlocks(nested), [CODE_OMITTED_NOTE, "after"].join("\n"));

  const unclosed = ["before", "```python", "import os", "os.system('x')"].join("\n");
  assert.equal(stripCodeBlocks(unclosed), ["before", CODE_OMITTED_NOTE].join("\n"));
});

test("sample resources become their source link; documents lose only their code", () => {
  const sample = toLinksOnlyResource(
    { uri: "sample://dbr/server/dotnet/11/HelloWorld", mimeType: "text/plain", text: "using System;\nclass Program {}" },
    { getSampleUriSourceUrl: () => "https://github.com/Dynamsoft/x/tree/main/HelloWorld" }
  );
  assert.match(sample.text, /^Sample source: https:\/\/github\.com\/Dynamsoft\/x\/tree\/main\/HelloWorld/);
  assert.ok(!sample.text.includes("class Program"));

  const doc = toLinksOnlyResource({ uri: "doc://dbr/server/dotnet/11/user-guide", mimeType: "text/markdown", text: "Intro\n```cs\nx();\n```" });
  assert.equal(doc.text, `Intro\n${CODE_OMITTED_NOTE}`);
});

test("fences flattened onto one line by search snippets are removed too", () => {
  const snippet = "SetFile > Sets the file using `ImageData`. ```csharp int SetFile(string path); ``` **Parameters** ```cs int";
  assert.equal(
    stripCodeBlocks(snippet),
    `SetFile > Sets the file using \`ImageData\`. ${CODE_OMITTED_NOTE} **Parameters** ${CODE_OMITTED_NOTE}`
  );
});

test("short install commands stay as plain lines; long shell scripts are omitted", () => {
  const install = ["## Install", "```bash", "dotnet add package Dynamsoft.DotNet.BarcodeReader.Bundle", "```"].join("\n");
  assert.equal(stripCodeBlocks(install), "## Install\ndotnet add package Dynamsoft.DotNet.BarcodeReader.Bundle");

  const script = ["```bash", "a", "b", "c", "d", "```"].join("\n");
  assert.equal(stripCodeBlocks(script), CODE_OMITTED_NOTE);
});

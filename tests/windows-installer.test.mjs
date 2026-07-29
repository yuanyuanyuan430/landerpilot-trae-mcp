import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(
  new URL("../scripts/install-windows.ps1", import.meta.url),
  "utf8"
);

test("Windows installer resolves global npm bins and keeps Trae secrets global", () => {
  assert.match(script, /npm install -g \$Package/);
  assert.match(script, /npm prefix -g/);
  assert.match(script, /Join-Path \$npmPrefix "landerpilot-mcp-setup\.cmd"/);
  assert.match(script, /Join-Path \$npmPrefix "landerpilot-mcp-doctor\.cmd"/);
  assert.match(script, /\$setupArgs = @\("--client", "trae", "--scope", "global"\)/);
  assert.doesNotMatch(script, /--allow-project-secret/);
  assert.doesNotMatch(script, /\$ApiKey|--api-key/);
});

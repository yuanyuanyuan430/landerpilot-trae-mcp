#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const tempRoot = mkdtempSync(join(tmpdir(), "landerpilot-mcp-dist-"));
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

try {
  const packDryRun = npm(["pack", "--dry-run", "--json"], packageRoot);
  const packInfo = JSON.parse(packDryRun.stdout)[0];
  const badFiles = packInfo.files
    .map((file) => file.path)
    .filter((file) => file.includes("node_modules") || file.endsWith(".tgz"));
  if (badFiles.length > 0) {
    throw new Error(`Package contains files that should not ship: ${badFiles.join(", ")}`);
  }

  const pack = npm(["pack", "--silent"], packageRoot);
  const tarballName = pack.stdout.trim().split(/\r?\n/).at(-1);
  if (!tarballName) throw new Error("npm pack did not return a tarball name.");
  const tarballPath = resolve(packageRoot, tarballName);
  npm(["install", "-g", tarballPath, "--prefix", tempRoot, "--ignore-scripts"], packageRoot);

  const installedRoot = join(tempRoot, "lib", "node_modules", packageJson.name);
  const localBinary = join(tempRoot, "bin", "landerpilot-local-mcp");
  const cloudBinary = join(tempRoot, "bin", "landerpilot-cloud-mcp");
  const smokeScript = join(installedRoot, ".distribution-smoke.mjs");
  writeFileSync(
    smokeScript,
    `
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'distribution-smoke', version: '0.1.0' });
const transport = new StdioClientTransport({ command: ${JSON.stringify(localBinary)}, args: [] });
await client.connect(transport);
const tools = await client.listTools();
const result = await client.callTool({ name: 'list_template_slots', arguments: {} });
const parsed = JSON.parse(result.content?.[0]?.text ?? '{}');
console.log(JSON.stringify({
  ok: true,
  toolCount: tools.tools.length,
  tools: tools.tools.map((tool) => tool.name),
  templates: parsed.templates.map((template) => template.id),
  cloudServerName: parsed.cloudMcp.serverName
}, null, 2));
await client.close();
`
  );
  const smoke = node([smokeScript], installedRoot);
  const cloudSmokeScript = join(installedRoot, ".distribution-cloud-smoke.mjs");
  writeFileSync(
    cloudSmokeScript,
    `
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'cloud-bridge-smoke', version: '0.1.0' });
const transport = new StdioClientTransport({ command: ${JSON.stringify(cloudBinary)}, args: [] });
await client.connect(transport);
const tools = await client.listTools();
const status = await client.callTool({ name: 'landerpilot_connection_status', arguments: {} });
console.log(JSON.stringify({
  ok: true,
  toolCount: tools.tools.length,
  tools: tools.tools.map((tool) => tool.name),
  statusIsError: status.isError === true
}, null, 2));
await client.close();
`
  );
  const cloudSmoke = node([cloudSmokeScript], installedRoot);
  rmSync(tarballPath, { force: true });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        pack: {
          fileCount: packInfo.files.length,
          unpackedSize: packInfo.unpackedSize,
          badFiles,
        },
        smoke: JSON.parse(smoke.stdout),
        cloudBridgeWithoutKey: JSON.parse(cloudSmoke.stdout),
      },
      null,
      2
    )}\n`
  );
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}

function npm(args, cwd) {
  return run("npm", args, cwd);
}

function node(args, cwd) {
  return run(process.execPath, args, cwd);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with code ${result.status}\n${result.stdout}\n${result.stderr}`
    );
  }
  return result;
}

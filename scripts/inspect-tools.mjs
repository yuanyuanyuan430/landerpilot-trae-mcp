#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const serverPath = resolve(packageRoot, "server.mjs");

const client = new Client({
  name: "landerpilot-local-mcp-inspector",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: packageRoot,
});

await client.connect(transport);
const tools = await client.listTools();
process.stdout.write(`${JSON.stringify(tools, null, 2)}\n`);
await client.close();

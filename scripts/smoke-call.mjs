#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const serverPath = resolve(packageRoot, "server.mjs");

const client = new Client({
  name: "landerpilot-local-mcp-smoke",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: packageRoot,
});

await client.connect(transport);

const tools = await client.listTools();
const templateResult = await client.callTool({
  name: "list_template_slots",
  arguments: {},
});
const templateText = templateResult.content?.[0]?.text ?? "{}";
const templateJson = JSON.parse(templateText);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      toolCount: tools.tools.length,
      tools: tools.tools.map((tool) => tool.name),
      templates: templateJson.templates?.map((template) => template.id) ?? [],
      cloudMcp: templateJson.cloudMcp ?? null,
    },
    null,
    2
  )}\n`
);

await client.close();

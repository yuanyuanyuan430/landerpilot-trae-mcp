#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const cwd = resolve(getArgValue("--project") || process.cwd());
const configPath = resolve(cwd, ".trae", "mcp.json");
const apiKeyArg = getArgValue("--api-key");
const remoteUrl = getArgValue("--url") || "https://landerpilot.com/api/mcp";

const apiKey = apiKeyArg || (await promptApiKey());
if (!apiKey.trim()) {
  console.error("没有输入 API Key，已取消。");
  process.exit(1);
}

const current = readJsonIfExists(configPath) ?? {};
const mcpServers = isRecord(current.mcpServers) ? current.mcpServers : {};

mcpServers.landerpilot = {
  command: "landerpilot-cloud-mcp",
  args: [],
  env: {
    LANDERPILOT_API_KEY: apiKey.trim(),
    LANDERPILOT_MCP_URL: remoteUrl,
  },
};

const next = {
  ...current,
  mcpServers,
};

mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);

console.log(`已写入 Trae MCP 配置：${configPath}`);
console.log("下一步：重启 Trae，打开 MCP 面板，确认 landerpilot 已启用。");

async function promptApiKey() {
  const rl = createInterface({ input, output });
  try {
    return await rl.question("请粘贴 LanderPilot API Key（输入后回车）：");
  } finally {
    rl.close();
  }
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "";
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

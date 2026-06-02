#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cloudProxyPath = resolve(packageRoot, "cloud-proxy.mjs");
const cwd = resolve(getArgValue("--project") || process.cwd());
const projectConfigPath = resolve(cwd, ".trae", "mcp.json");
const apiKeyArg = getArgValue("--api-key");
const remoteUrl = getArgValue("--url") || "https://landerpilot.com/api/mcp";

const apiKey = apiKeyArg || (await promptApiKey());
if (!apiKey.trim()) {
  console.error("没有输入 API Key，已取消。");
  process.exit(1);
}

const landerpilotServer = {
  command: process.execPath,
  args: [cloudProxyPath],
  env: {
    LANDERPILOT_API_KEY: apiKey.trim(),
    LANDERPILOT_MCP_URL: remoteUrl,
  },
};

// Keep the older short-command flow out of the generated config. Trae often
// launches MCP servers without the user's interactive shell PATH, so absolute
// Node + script paths are more reliable for beginners.

const written = [];
written.push(writeMcpConfig(projectConfigPath, landerpilotServer));
for (const globalPath of getGlobalConfigPaths()) {
  written.push(writeMcpConfig(globalPath, landerpilotServer));
}

console.log("");
console.log("LanderPilot MCP 配置完成。");
for (const filePath of written) {
  console.log(`- 已写入：${filePath}`);
}
console.log("");
console.log("下一步只需要做两件事：");
console.log("1. 完全退出 Trae，然后重新打开 Trae。");
console.log("2. 打开项目后，在 Trae 聊天框粘贴：请调用 landerpilot_connection_status 检查连接。");
console.log("");
console.log("如果还是看不到工具，运行：landerpilot-trae-doctor");

function writeMcpConfig(configPath, serverConfig) {
  const current = readJsonIfExists(configPath) ?? {};
  const mcpServers = isRecord(current.mcpServers) ? current.mcpServers : {};
  mcpServers.landerpilot = serverConfig;

  const next = {
    ...current,
    mcpServers,
  };

  mkdirSync(dirname(configPath), { recursive: true });
  backupIfExists(configPath);
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
  return configPath;
}

async function promptApiKey() {
  output.write("请粘贴 LanderPilot API Key（输入后回车，屏幕不会显示）：");
  const mutedOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!mutedOutput.muted) output.write(chunk, encoding);
      callback();
    },
  });
  mutedOutput.muted = true;
  const rl = createInterface({ input, output: mutedOutput, terminal: true });
  try {
    const answer = await rl.question("");
    output.write("\n");
    return answer;
  } finally {
    rl.close();
  }
}

function getGlobalConfigPaths() {
  const explicitPath = getArgValue("--global-config");
  if (explicitPath) return [resolve(explicitPath)];

  const home = homedir();
  const candidates = uniquePaths([
    join(home, "Library", "Application Support", "Trae CN", "User", "mcp.json"),
    join(home, "Library", "Application Support", "TRAE CN", "User", "mcp.json"),
    join(home, "Library", "Application Support", "Trae", "User", "mcp.json"),
    join(home, ".trae", "mcp.json"),
  ]);

  const existing = candidates.filter((filePath) => existsSync(filePath));
  return existing.length > 0 ? existing : [candidates[0]];
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

function backupIfExists(filePath) {
  if (!existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(filePath, `${filePath}.bak-${stamp}`);
}

function uniquePaths(paths) {
  const seen = new Set();
  return paths.filter((filePath) => {
    const key = filePath.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

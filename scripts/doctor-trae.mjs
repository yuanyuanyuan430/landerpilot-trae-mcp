#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const cwd = resolve(getArgValue("--project") || process.cwd());
const projectConfigPath = resolve(cwd, ".trae", "mcp.json");
const configPaths = uniquePaths([projectConfigPath, ...getGlobalConfigPaths()]);

const reports = configPaths.map(checkConfig);
const ok = reports.some((report) => report.ok);

for (const report of reports) {
  console.log(`${report.ok ? "OK" : "NO"} ${report.label}: ${report.path}`);
  for (const line of report.lines) console.log(`  ${line}`);
}

console.log("");
if (ok) {
  console.log("配置看起来已经写好。请完全退出 Trae，再重新打开项目。");
  console.log("然后在 Trae 聊天框输入：请调用 landerpilot_connection_status 检查连接。");
} else {
  console.log("还没有找到可用配置。请在项目目录重新运行：landerpilot-trae-setup");
}

function checkConfig(filePath, index) {
  const label = index === 0 ? "项目配置" : "Trae 全局配置";
  if (!existsSync(filePath)) {
    return { ok: false, label, path: filePath, lines: ["文件不存在"] };
  }

  let config;
  try {
    config = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    return { ok: false, label, path: filePath, lines: [`JSON 格式错误：${message(error)}`] };
  }

  const server = config.mcpServers?.landerpilot;
  if (!server) {
    return { ok: false, label, path: filePath, lines: ["没有 landerpilot 配置"] };
  }

  const lines = [];
  const commandOk = typeof server.command === "string" && existsSync(server.command);
  const scriptPath = Array.isArray(server.args) ? server.args[0] : "";
  const scriptOk = typeof scriptPath === "string" && existsSync(scriptPath);
  const keyOk = Boolean(server.env?.LANDERPILOT_API_KEY);

  lines.push(commandOk ? `Node 命令存在：${server.command}` : `Node 命令不存在：${server.command || "(空)"}`);
  lines.push(scriptOk ? `MCP 脚本存在：${scriptPath}` : `MCP 脚本不存在：${scriptPath || "(空)"}`);
  lines.push(keyOk ? "API Key 已配置" : "API Key 未配置");

  return {
    ok: commandOk && scriptOk && keyOk,
    label,
    path: filePath,
    lines,
  };
}

function getGlobalConfigPaths() {
  const explicitPath = getArgValue("--global-config");
  if (explicitPath) return [resolve(explicitPath)];

  const home = homedir();
  return [
    join(home, "Library", "Application Support", "Trae CN", "User", "mcp.json"),
    join(home, "Library", "Application Support", "TRAE CN", "User", "mcp.json"),
    join(home, "Library", "Application Support", "Trae", "User", "mcp.json"),
    join(home, ".trae", "mcp.json"),
  ];
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "";
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

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

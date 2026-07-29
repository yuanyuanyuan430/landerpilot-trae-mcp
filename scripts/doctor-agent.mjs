#!/usr/bin/env node
import { resolve } from "node:path";
import {
  checkTargetConfig,
  defaultServerName,
  getArgValue,
  hasFlag,
  resolveTargets,
  usage,
  validateServerName,
} from "./shared/agent-config.mjs";

const argv = process.argv.slice(2);

if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
  console.log(usage(process.argv[1]));
  process.exit(0);
}

const cwd = resolve(getArgValue(argv, "--project") || process.cwd());
const platform = getArgValue(argv, "--platform") || process.platform;
const serverName = getArgValue(argv, "--server-name") || defaultServerName;
try {
  validateServerName(serverName);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const targets = resolveTargets({
  argv,
  cwd,
  platform,
  invocationName: process.argv[1],
  configPath: getArgValue(argv, "--config"),
  globalConfigPath: getArgValue(argv, "--global-config"),
  format: getArgValue(argv, "--format"),
});

const reports = targets.map((target) => checkTargetConfig(target, serverName));
const ok = reports.some((report) => report.ok);

for (const report of reports) {
  console.log(`${report.ok ? "OK" : "NO"} ${report.target.label}: ${report.target.path}`);
  for (const line of report.lines) console.log(`  ${line}`);
}

console.log("");
if (ok) {
  console.log("配置看起来已经写好。请重启对应 agent/IDE，再调用 landerpilot_connection_status 检查连接。");
} else {
  console.log("还没有找到可用配置。请重新运行 landerpilot-mcp-setup，并带上同样的 --client / --project 参数。");
  process.exitCode = 1;
}

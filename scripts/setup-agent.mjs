#!/usr/bin/env node
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Writable } from "node:stream";
import {
  assertSecretTargetsAllowed,
  assertStableInstallPath,
  defaultRemoteUrl,
  defaultServerName,
  getArgValue,
  hasFlag,
  makeServerConfig,
  resolveTargets,
  usage,
  validateServerName,
  writeTargetConfig,
} from "./shared/agent-config.mjs";
import { validateRemoteUrl } from "./shared/remote-session.mjs";

const argv = process.argv.slice(2);

if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
  console.log(usage(process.argv[1]));
  process.exit(0);
}

if (argv.some((value) => value === "--api-key" || value.startsWith("--api-key="))) {
  console.error(
    "拒绝从命令行参数读取 API Key，因为它会暴露在进程列表或 shell 历史中。请使用隐藏输入，或为自动化设置 LANDERPILOT_SETUP_API_KEY。"
  );
  process.exit(1);
}

try {
  assertStableInstallPath();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
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
const allowCustomUrl = hasFlag(argv, "--allow-custom-url");
let remoteUrl;
try {
  remoteUrl = validateRemoteUrl(getArgValue(argv, "--url") || defaultRemoteUrl, {
    allowCustomUrl,
  });
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

if (targets.length === 0) {
  console.error("没有找到要写入的 agent 配置目标。");
  process.exit(1);
}

try {
  assertSecretTargetsAllowed(targets, hasFlag(argv, "--allow-project-secret"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const apiKey = process.env.LANDERPILOT_SETUP_API_KEY || (await promptApiKey());

if (!apiKey.trim()) {
  console.error("没有输入 API Key，已取消。");
  process.exit(1);
}

let serverConfig;
try {
  serverConfig = makeServerConfig({ apiKey, remoteUrl, allowCustomUrl });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const written = targets.map((target) => ({
  target,
  path: writeTargetConfig(target, serverName, serverConfig),
}));

console.log("");
console.log("LanderPilot MCP 配置完成。");
for (const item of written) {
  console.log(`- ${item.target.label}：${item.path}`);
}
console.log("");
console.log("下一步：重启对应的 agent/IDE，然后让它调用 landerpilot_connection_status 检查连接。");
console.log("如果还是看不到工具，运行：landerpilot-mcp-doctor，并带上同样的 --client / --project 参数。");

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

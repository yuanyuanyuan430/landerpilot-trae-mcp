import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, userInfo } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
} from "jsonc-parser";
import {
  defaultRemoteUrl,
  validateRemoteUrl,
} from "./remote-session.mjs";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const cloudProxyPath = resolve(packageRoot, "cloud-proxy.mjs");
export { defaultRemoteUrl };
export const defaultServerName = "landerpilot";

export function resolveTargets({
  argv,
  cwd,
  platform,
  invocationName,
  configPath,
  globalConfigPath,
  format,
}) {
  if (configPath) {
    return [
      withTrustRoot({
        client: "custom",
        label: "自定义 MCP 配置",
        path: resolve(configPath),
        format: normalizeFormat(format, configPath),
        secretScope: "custom",
      }, cwd),
    ];
  }

  const explicitClient = getArgValue(argv, "--client") || getArgValue(argv, "--agent");
  const clients = parseList(explicitClient || inferClientFromInvocation(invocationName));
  const targets = [];

  for (const rawClient of clients) {
    const client = normalizeClient(rawClient);
    const scope = getArgValue(argv, "--scope") || defaultScopeForClient(client);
    targets.push(...targetsForClient({ client, scope, cwd, platform, globalConfigPath }));
  }

  return uniqueTargets(targets).map((target) => withTrustRoot(target, cwd));
}

export function makeServerConfig({
  apiKey,
  remoteUrl = defaultRemoteUrl,
  allowCustomUrl = false,
}) {
  assertStableInstallPath();
  const validatedRemoteUrl = validateRemoteUrl(remoteUrl, { allowCustomUrl });
  return {
    type: "stdio",
    command: process.execPath,
    args: [cloudProxyPath],
    env: {
      LANDERPILOT_API_KEY: apiKey.trim(),
      LANDERPILOT_MCP_URL: validatedRemoteUrl,
      ...(allowCustomUrl ? { LANDERPILOT_ALLOW_CUSTOM_MCP_URL: "1" } : {}),
    },
  };
}

export function assertStableInstallPath(path = cloudProxyPath) {
  if (String(path).split(/[\\/]+/).includes("_npx")) {
    throw new Error(
      "检测到临时包执行器的易失安装路径，未写入配置。请先运行 npm install -g landerpilot-mcp，再运行 landerpilot-mcp-setup。"
    );
  }
}

export function assertSecretTargetsAllowed(targets, allowProjectSecret) {
  const unsafeTargets = targets.filter((target) => target.secretScope !== "global");
  if (unsafeTargets.length > 0 && !allowProjectSecret) {
    throw new Error(
      `拒绝把明文 API Key 写入项目级或自定义配置：${unsafeTargets
        .map((target) => target.path)
        .join(", ")}。确认文件不会提交到版本库后，显式添加 --allow-project-secret。`
    );
  }
}

export function validateServerName(serverName) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(serverName)) {
    throw new Error(
      "--server-name 必须是 1–64 位，只能包含英文字母、数字、下划线和连字符。"
    );
  }
  return serverName;
}

export function writeTargetConfig(target, serverName, serverConfig) {
  validateServerName(serverName);
  assertSafeConfigTarget(target.path, target.trustRoot);
  if (target.format === "codex-toml") {
    writeCodexToml(target, serverName, serverConfig);
    return target.path;
  }

  const currentText = existsSync(target.path) ? readFileSync(target.path, "utf8") : "{}\n";
  const current = parseJsonc(currentText);
  const rootKey = rootKeyForFormat(target.format);
  const path = isRecord(current?.[rootKey]) ? [rootKey, serverName] : [rootKey];
  const value = path.length === 2
    ? serverForFormat(target.format, serverConfig)
    : { [serverName]: serverForFormat(target.format, serverConfig) };
  const edits = modify(currentText, path, value, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: currentText.includes("\r\n") ? "\r\n" : "\n",
    },
  });
  const next = applyEdits(currentText, edits);

  mkdirSync(dirname(target.path), { recursive: true });
  if (target.secretScope === "global") backupIfExists(target.path);
  writeSecureFile(target.path, next.endsWith("\n") ? next : `${next}\n`);
  return target.path;
}

export function checkTargetConfig(target, serverName) {
  if (!existsSync(target.path)) {
    return { ok: false, target, lines: ["文件不存在"] };
  }
  try {
    assertSafeConfigTarget(target.path, target.trustRoot);
  } catch (error) {
    return { ok: false, target, lines: [message(error)] };
  }

  if (target.format === "codex-toml") {
    return checkCodexToml(target, serverName);
  }

  let config;
  try {
    config = parseJsonc(readFileSync(target.path, "utf8"));
  } catch (error) {
    return { ok: false, target, lines: [`JSON/JSONC 格式错误：${message(error)}`] };
  }

  const rootKey = rootKeyForFormat(target.format);
  const server = config[rootKey]?.[serverName];
  if (!server) {
    return { ok: false, target, lines: [`没有 ${rootKey}.${serverName} 配置`] };
  }

  return checkServerObject(target, server);
}

export function getArgValue(argv, name) {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === name) {
      const next = argv[index + 1];
      return next && !next.startsWith("--") ? next : "";
    }
    if (value.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return "";
}

export function hasFlag(argv, name) {
  return argv.includes(name);
}

export function usage(commandName) {
  return `Usage:
  ${commandName} --client <agent> [--scope project|global|all]
  ${commandName} --config /path/to/mcp.json --allow-project-secret [--format mcp-json|vscode-json]

Agents:
  generic          project .mcp.json
  trae            Trae global mcp.json
  cursor          ~/.cursor/mcp.json or project .cursor/mcp.json
  claude-code     project .mcp.json
  claude-desktop  Claude Desktop global claude_desktop_config.json
  vscode          project .vscode/mcp.json
  codex           project/global .codex/config.toml marker block
  codewhale       CodeWhale ~/.codewhale/mcp.json
  opencode        OpenCode ~/.config/opencode/opencode.json or existing opencode.jsonc

Options:
  --url <url>           Override LanderPilot MCP URL. Custom hosts require --allow-custom-url.
  --allow-custom-url    Confirm that a trusted custom HTTPS/loopback endpoint may receive the API Key.
  --server-name <name>  Default: landerpilot. Allowed: 1-64 letters, digits, _ or -.
  --project <path>      Project root for project-scoped configs.
  --global-config <p>   Exact override path. Treated as custom and requires secret confirmation.
  --allow-project-secret
                        Allow plaintext API Key in project/custom config. Such files can be committed accidentally.

Automation:
  Set LANDERPILOT_SETUP_API_KEY in the setup process environment. API Keys in command-line arguments are rejected.`;
}

function targetsForClient({ client, scope, cwd, platform, globalConfigPath }) {
  const targets = [];

  if (client === "generic" || client === "claude-code") {
    if (includesProject(scope)) {
      targets.push({
        client,
        label: client === "claude-code" ? "Claude Code 项目配置" : "通用项目 MCP 配置",
        path: resolve(cwd, ".mcp.json"),
        format: "mcp-json",
        secretScope: "project",
      });
    }
    return targets;
  }

  if (client === "trae") {
    if (includesProject(scope)) {
      targets.push({
        client,
        label: "Trae 项目配置",
        path: resolve(cwd, ".trae", "mcp.json"),
        format: "mcp-json",
        secretScope: "project",
      });
    }
    if (includesGlobal(scope)) {
      for (const path of globalConfigPath ? [resolve(globalConfigPath)] : getTraeGlobalConfigPaths(platform)) {
        targets.push({
          client,
          label: "Trae 全局配置",
          path,
          format: "mcp-json",
          secretScope: globalConfigPath ? "custom" : "global",
        });
      }
    }
    return targets;
  }

  if (client === "cursor") {
    if (includesProject(scope)) {
      targets.push({
        client,
        label: "Cursor 项目配置",
        path: resolve(cwd, ".cursor", "mcp.json"),
        format: "mcp-json",
        secretScope: "project",
      });
    }
    if (includesGlobal(scope)) {
      targets.push({
        client,
        label: "Cursor 全局配置",
        path: globalConfigPath ? resolve(globalConfigPath) : join(homedir(), ".cursor", "mcp.json"),
        format: "mcp-json",
        secretScope: globalConfigPath ? "custom" : "global",
      });
    }
    return targets;
  }

  if (client === "claude-desktop") {
    if (includesGlobal(scope)) {
      targets.push({
        client,
        label: "Claude Desktop 全局配置",
        path: globalConfigPath ? resolve(globalConfigPath) : getClaudeDesktopConfigPath(platform),
        format: "mcp-json",
        secretScope: globalConfigPath ? "custom" : "global",
      });
    }
    return targets;
  }

  if (client === "vscode") {
    if (includesProject(scope)) {
      targets.push({
        client,
        label: "VS Code/Copilot 项目配置",
        path: resolve(cwd, ".vscode", "mcp.json"),
        format: "vscode-json",
        secretScope: "project",
      });
    }
    return targets;
  }

  if (client === "codex") {
    if (includesProject(scope)) {
      targets.push({
        client,
        label: "Codex 项目配置",
        path: resolve(cwd, ".codex", "config.toml"),
        format: "codex-toml",
        secretScope: "project",
      });
    }
    if (includesGlobal(scope)) {
      targets.push({
        client,
        label: "Codex 全局配置",
        path: globalConfigPath ? resolve(globalConfigPath) : join(homedir(), ".codex", "config.toml"),
        format: "codex-toml",
        secretScope: globalConfigPath ? "custom" : "global",
      });
    }
    return targets;
  }

  if (client === "codewhale") {
    if (includesProject(scope)) {
      targets.push({
        client,
        label: "CodeWhale 项目配置",
        path: resolve(cwd, ".codewhale", "mcp.json"),
        format: "codewhale-json",
        secretScope: "project",
      });
    }
    if (includesGlobal(scope)) {
      targets.push({
        client,
        label: "CodeWhale 全局配置",
        path: globalConfigPath ? resolve(globalConfigPath) : join(homedir(), ".codewhale", "mcp.json"),
        format: "codewhale-json",
        secretScope: globalConfigPath ? "custom" : "global",
      });
    }
    return targets;
  }

  if (client === "opencode") {
    if (includesProject(scope)) {
      const defaultPath = resolve(cwd, "opencode.json");
      targets.push({
        client,
        label: "OpenCode 项目配置",
        path: preferOpenCodeJsonc(defaultPath),
        format: "opencode-json",
        secretScope: "project",
      });
    }
    if (includesGlobal(scope)) {
      const defaultPath = join(homedir(), ".config", "opencode", "opencode.json");
      targets.push({
        client,
        label: "OpenCode 全局配置",
        path: globalConfigPath ? resolve(globalConfigPath) : preferOpenCodeJsonc(defaultPath),
        format: "opencode-json",
        secretScope: globalConfigPath ? "custom" : "global",
      });
    }
    return targets;
  }

  throw new Error(`不支持的 agent/client：${client}`);
}

function normalizeClient(value) {
  const key = String(value || "generic").trim().toLowerCase();
  if (!key || key === "project" || key === "mcp") return "generic";
  if (key === "trae-cn" || key === "trae_cn") return "trae";
  if (key === "claude" || key === "claude_code" || key === "claude-code") return "claude-code";
  if (key === "claude-desktop" || key === "claude_desktop") return "claude-desktop";
  if (key === "copilot" || key === "vs-code" || key === "vscode") return "vscode";
  if (key === "codewhale" || key === "code-whale" || key === "code_whale") return "codewhale";
  if (key === "open-code" || key === "open_code" || key === "opencode") return "opencode";
  return key;
}

function inferClientFromInvocation(invocationName) {
  const name = basename(invocationName || "").toLowerCase();
  if (name.includes("trae")) return "trae";
  if (name.includes("codewhale")) return "codewhale";
  if (name.includes("opencode")) return "opencode";
  return "generic";
}

function defaultScopeForClient(client) {
  if (client === "trae") return "global";
  if (
    client === "cursor" ||
    client === "claude-desktop" ||
    client === "codex" ||
    client === "codewhale" ||
    client === "opencode"
  ) {
    return "global";
  }
  return "project";
}

function includesProject(scope) {
  return scope === "project" || scope === "all";
}

function includesGlobal(scope) {
  return scope === "global" || scope === "all";
}

function getTraeGlobalConfigPaths(platform) {
  if (platform === "win32") return getWindowsTraeGlobalConfigPaths();
  if (platform === "linux") return getLinuxTraeGlobalConfigPaths();
  return getMacTraeGlobalConfigPaths();
}

function getMacTraeGlobalConfigPaths() {
  const home = homedir();
  const candidates = uniquePaths([
    join(home, "Library", "Application Support", "Trae CN", "User", "mcp.json"),
    join(home, "Library", "Application Support", "TRAE CN", "User", "mcp.json"),
    join(home, "Library", "Application Support", "Trae", "User", "mcp.json"),
    join(home, ".trae", "mcp.json"),
  ]);
  const existing = candidates.filter((path) => existsSync(path));
  return existing.length > 0 ? existing : [candidates[0]];
}

function getWindowsTraeGlobalConfigPaths() {
  const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  const userProfile = process.env.USERPROFILE || homedir();
  const defaults = [
    join(appData, "Trae CN", "User", "mcp.json"),
    join(appData, "Trae", "User", "mcp.json"),
    join(appData, "Trae", "User", "settings", "mcp.json"),
  ];
  const candidates = uniquePaths([
    ...defaults,
    join(appData, "TRAE CN", "User", "mcp.json"),
    join(userProfile, ".trae", "mcp.json"),
  ]);
  const existing = candidates.filter((path) => existsSync(path));
  return existing.length > 0 ? existing : defaults;
}

function getLinuxTraeGlobalConfigPaths() {
  const home = homedir();
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, ".config");
  const candidates = uniquePaths([
    join(xdgConfig, "Trae CN", "User", "mcp.json"),
    join(xdgConfig, "Trae", "User", "mcp.json"),
    join(home, ".trae", "mcp.json"),
  ]);
  const existing = candidates.filter((path) => existsSync(path));
  return existing.length > 0 ? existing : [candidates[0], candidates[1]];
}

function getClaudeDesktopConfigPath(platform) {
  const home = homedir();
  if (platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  if (platform === "linux") return join(home, ".config", "Claude", "claude_desktop_config.json");
  return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
}

function normalizeFormat(format, configPath) {
  const value = String(format || "").trim().toLowerCase();
  const pathParts = configPath.split(/[\\/]/);
  if (value === "vscode" || value === "vscode-json" || pathParts.includes(".vscode")) {
    return "vscode-json";
  }
  if (value === "codewhale" || value === "codewhale-json") return "codewhale-json";
  if (value === "opencode" || value === "opencode-json") return "opencode-json";
  if (value === "codex" || value === "toml" || value === "codex-toml") return "codex-toml";
  return "mcp-json";
}

function rootKeyForFormat(format) {
  if (format === "vscode-json") return "servers";
  if (format === "codewhale-json") return "servers";
  if (format === "opencode-json") return "mcp";
  return "mcpServers";
}

function serverForFormat(format, serverConfig) {
  if (format === "vscode-json") return { ...serverConfig, type: "stdio" };
  if (format === "codewhale-json") {
    return {
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
      url: null,
      connect_timeout: null,
      execute_timeout: null,
      read_timeout: null,
      disabled: false,
      enabled: true,
      required: false,
      enabled_tools: [],
      disabled_tools: [],
    };
  }
  if (format === "opencode-json") {
    return {
      type: "local",
      enabled: true,
      command: [serverConfig.command, ...serverConfig.args],
      environment: serverConfig.env,
    };
  }
  const { type, ...rest } = serverConfig;
  return rest;
}

function writeCodexToml(target, serverName, serverConfig) {
  const configPath = target.path;
  const start = codexMarkerStart(serverName);
  const end = codexMarkerEnd(serverName);
  const block = makeCodexBlock(serverName, serverConfig);
  const current = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";

  let next;
  if (current.includes(start) && current.includes(end)) {
    const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
    next = current.replace(pattern, block);
  } else if (hasUnmarkedCodexServer(current, serverName)) {
    throw new Error(
      `${configPath} 已经有未标记的 [mcp_servers.${serverName}]。请换 --server-name，或手动移除旧块后再运行。`
    );
  } else {
    next = `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}`;
  }

  mkdirSync(dirname(configPath), { recursive: true });
  if (target.secretScope === "global") backupIfExists(configPath);
  writeSecureFile(configPath, next);
}

function makeCodexBlock(serverName, serverConfig) {
  const customUrlLine = serverConfig.env.LANDERPILOT_ALLOW_CUSTOM_MCP_URL
    ? `LANDERPILOT_ALLOW_CUSTOM_MCP_URL = ${tomlString(serverConfig.env.LANDERPILOT_ALLOW_CUSTOM_MCP_URL)}\n`
    : "";
  return `${codexMarkerStart(serverName)}
[mcp_servers.${serverName}]
command = ${tomlString(serverConfig.command)}
args = [${serverConfig.args.map(tomlString).join(", ")}]

[mcp_servers.${serverName}.env]
LANDERPILOT_API_KEY = ${tomlString(serverConfig.env.LANDERPILOT_API_KEY)}
LANDERPILOT_MCP_URL = ${tomlString(serverConfig.env.LANDERPILOT_MCP_URL)}
${customUrlLine}${codexMarkerEnd(serverName)}
`;
}

function checkCodexToml(target, serverName) {
  const text = readFileSync(target.path, "utf8");
  const start = codexMarkerStart(serverName);
  const end = codexMarkerEnd(serverName);
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    return { ok: false, target, lines: [`没有 ${start} 受管配置块`] };
  }

  const block = text.slice(startIndex, endIndex + end.length);
  const hasServer = block.includes(`[mcp_servers.${serverName}]`);
  const hasCommand = block.includes(`command = ${tomlString(process.execPath)}`);
  const hasKey = /LANDERPILOT_API_KEY\s*=/.test(block);
  const hasScript = block.includes(tomlString(cloudProxyPath));
  const scriptExists = existsSync(cloudProxyPath);
  return {
    ok: hasServer && hasCommand && hasKey && hasScript && scriptExists,
    target,
    lines: [
      hasServer ? `MCP server 已配置：${serverName}` : `MCP server 未配置：${serverName}`,
      hasCommand ? `Node 命令已配置：${process.execPath}` : "Node 命令未正确配置",
      hasScript ? `MCP 脚本已配置：${cloudProxyPath}` : "MCP 脚本未配置",
      scriptExists ? "本地 MCP 脚本存在" : "本地 MCP 脚本不存在",
      hasKey ? "API Key 已配置" : "API Key 未配置",
    ],
  };
}

function checkServerObject(target, server) {
  if (typeof server.url === "string") {
    const hasAuth = Boolean(server.headers?.Authorization || server.env?.LANDERPILOT_API_KEY);
    return {
      ok: hasAuth,
      target,
      lines: [
        `远程 URL 已配置：${server.url}`,
        hasAuth ? "API Key/Authorization 已配置" : "API Key/Authorization 未配置",
      ],
    };
  }

  const command = Array.isArray(server.command) ? server.command[0] : server.command;
  const commandOk = typeof command === "string" && commandExists(command);
  const scriptPath = Array.isArray(server.command) ? server.command[1] : Array.isArray(server.args) ? server.args[0] : "";
  const scriptOk = typeof scriptPath === "string" && existsSync(scriptPath);
  const env = server.env || server.environment;
  const keyOk = Boolean(env?.LANDERPILOT_API_KEY || env?.LP_API_KEY);

  return {
    ok: commandOk && scriptOk && keyOk,
    target,
    lines: [
      commandOk ? `Node 命令存在：${command}` : `Node 命令不存在：${command || "(空)"}`,
      scriptOk ? `MCP 脚本存在：${scriptPath}` : `MCP 脚本不存在：${scriptPath || "(空)"}`,
      keyOk ? "API Key 已配置" : "API Key 未配置",
    ],
  };
}

function commandExists(command) {
  if (!command) return false;
  if (existsSync(command)) return true;
  return basename(command) === command;
}

function hasUnmarkedCodexServer(text, serverName) {
  const name = escapeRegExp(serverName);
  const pattern = new RegExp(
    `^\\[\\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\\s*\\.\\s*(?:${name}|"${name}"|'${name}')\\s*\\]\\s*(?:#.*)?$`,
    "m"
  );
  return pattern.test(text);
}

function codexMarkerStart(serverName) {
  return `# BEGIN landerpilot-mcp:${serverName}`;
}

function codexMarkerEnd(serverName) {
  return `# END landerpilot-mcp:${serverName}`;
}

function backupIfExists(path) {
  if (!existsSync(path)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${path}.bak-${stamp}`;
  copyFileSync(path, backupPath);
  chmodSync(backupPath, 0o600);
}

function writeSecureFile(path, contents) {
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(tempPath, contents, { mode: 0o600, flag: "wx" });
    chmodSync(tempPath, 0o600);
    renameSync(tempPath, path);
    chmodSync(path, 0o600);
  } finally {
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }
}

function assertSafeConfigTarget(path, trustRoot) {
  const targetPath = resolve(path);
  const rootPath = resolve(trustRoot || filesystemRoot(targetPath));
  if (!isPathInside(rootPath, targetPath)) {
    throw new Error(`MCP 配置超出可信根目录 ${rootPath}：${targetPath}`);
  }
  if (existsSync(rootPath) && lstatSync(rootPath).isSymbolicLink()) {
    throw new Error(`拒绝通过符号链接读写 MCP 配置：${rootPath}`);
  }

  let current = rootPath;
  for (const part of relative(rootPath, targetPath).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`拒绝通过符号链接读写 MCP 配置：${current}`);
    }
  }
}

function withTrustRoot(target, cwd) {
  const targetPath = resolve(target.path);
  const cwdPath = resolve(cwd || process.cwd());
  const accountHome = resolve(userInfo().homedir);
  const cwdIsAccountHome = sameExistingPath(cwdPath, accountHome);
  const globalPathIsUnsafe =
    !isPathInside(accountHome, targetPath) ||
    (isPathInside(cwdPath, targetPath) && !cwdIsAccountHome) ||
    isInsideGitWorktree(targetPath);
  const secretScope =
    target.secretScope === "global" && globalPathIsUnsafe
      ? "custom"
      : target.secretScope;
  return {
    ...target,
    secretScope,
    trustRoot: findTrustRoot(target.path, cwd),
  };
}

function findTrustRoot(path, cwd) {
  const targetPath = resolve(path);
  const candidates = [
    cwd,
    homedir(),
    process.env.APPDATA,
    process.env.USERPROFILE,
    process.env.XDG_CONFIG_HOME,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const root = resolve(candidate);
    if (isPathInside(root, targetPath)) return root;
  }
  return filesystemRoot(targetPath);
}

function filesystemRoot(path) {
  let current = resolve(path);
  while (dirname(current) !== current) current = dirname(current);
  return current;
}

function sameExistingPath(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

function isInsideGitWorktree(path) {
  let current = existsSync(path) && lstatSync(path).isDirectory() ? resolve(path) : dirname(resolve(path));
  while (true) {
    if (existsSync(join(current, ".git"))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function isPathInside(root, path) {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function preferOpenCodeJsonc(jsonPath) {
  const jsoncPath = jsonPath.replace(/\.json$/i, ".jsonc");
  return existsSync(jsoncPath) ? jsoncPath : jsonPath;
}

function parseList(value) {
  return String(value || "generic")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.format}:${resolve(target.path).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniquePaths(paths) {
  const seen = new Set();
  return paths.filter((path) => {
    const key = path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

export function parseJsonc(value) {
  const text = String(value).replace(/^\uFEFF/, "");
  const errors = [];
  const result = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    const first = errors[0];
    throw new SyntaxError(
      `${printParseErrorCode(first.error)} at offset ${first.offset}`
    );
  }
  return result;
}

export function samePath(left, right) {
  return realpathSync(left) === realpathSync(right);
}

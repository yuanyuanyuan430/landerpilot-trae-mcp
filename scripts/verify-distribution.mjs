#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const tempRoot = mkdtempSync(join(tmpdir(), "landerpilot-mcp-dist-"));
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
let tarballPath = "";

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
  tarballPath = resolve(packageRoot, tarballName);
  npm(
    [
      "install",
      "-g",
      tarballPath,
      "--prefix",
      tempRoot,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    packageRoot
  );

  const installedRoot = join(tempRoot, "lib", "node_modules", packageJson.name);

  const localBinary = join(tempRoot, "bin", "landerpilot-local-mcp");
  const cloudBinary = join(tempRoot, "bin", "landerpilot-cloud-mcp");
  const universalSetupBinary = join(tempRoot, "bin", "landerpilot-mcp-setup");
  const universalDoctorBinary = join(tempRoot, "bin", "landerpilot-mcp-doctor");
  const setupBinary = join(tempRoot, "bin", "landerpilot-trae-setup");
  const doctorBinary = join(tempRoot, "bin", "landerpilot-trae-doctor");
  const tempHome = join(tempRoot, "home");
  const tempProject = join(tempRoot, "project");
  const tempGenericProject = join(tempRoot, "generic-project");
  const tempCursorHome = join(tempRoot, "cursor-home");
  const tempCodeWhaleHome = join(tempRoot, "codewhale-home");
  const tempOpenCodeHome = join(tempRoot, "opencode-home");
  const tempWindowsHome = join(tempRoot, "win-home");
  const tempWindowsAppData = join(tempWindowsHome, "AppData", "Roaming");
  const tempWindowsProject = join(tempRoot, "win-project");
  mkdirSync(tempHome, { recursive: true });
  mkdirSync(tempProject, { recursive: true });
  mkdirSync(tempGenericProject, { recursive: true });
  mkdirSync(tempCursorHome, { recursive: true });
  mkdirSync(tempCodeWhaleHome, { recursive: true });
  mkdirSync(tempOpenCodeHome, { recursive: true });
  mkdirSync(tempWindowsAppData, { recursive: true });
  mkdirSync(tempWindowsProject, { recursive: true });

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

  run(
    universalSetupBinary,
    [
      "--project",
      tempGenericProject,
      "--allow-project-secret",
    ],
    packageRoot,
    { HOME: tempHome, LANDERPILOT_SETUP_API_KEY: "lp_test_generic" }
  );
  const genericConfigPath = join(tempGenericProject, ".mcp.json");
  const genericConfig = JSON.parse(readFileSync(genericConfigPath, "utf8"));
  const genericDoctor = run(
    universalDoctorBinary,
    ["--project", tempGenericProject],
    packageRoot,
    { HOME: tempHome }
  );

  run(
    universalSetupBinary,
    ["--client", "cursor", "--allow-project-secret"],
    packageRoot,
    { HOME: tempCursorHome, LANDERPILOT_SETUP_API_KEY: "lp_test_cursor" }
  );
  const cursorConfigPath = join(tempCursorHome, ".cursor", "mcp.json");
  const cursorConfig = JSON.parse(readFileSync(cursorConfigPath, "utf8"));
  const cursorDoctor = run(
    universalDoctorBinary,
    ["--client", "cursor"],
    packageRoot,
    { HOME: tempCursorHome }
  );

  run(
    universalSetupBinary,
    ["--client", "codewhale", "--allow-project-secret"],
    packageRoot,
    { HOME: tempCodeWhaleHome, LANDERPILOT_SETUP_API_KEY: "lp_test_codewhale" }
  );
  const codeWhaleConfigPath = join(tempCodeWhaleHome, ".codewhale", "mcp.json");
  const codeWhaleConfig = JSON.parse(readFileSync(codeWhaleConfigPath, "utf8"));
  const codeWhaleDoctor = run(
    universalDoctorBinary,
    ["--client", "codewhale"],
    packageRoot,
    { HOME: tempCodeWhaleHome }
  );

  run(
    universalSetupBinary,
    ["--client", "opencode", "--allow-project-secret"],
    packageRoot,
    { HOME: tempOpenCodeHome, LANDERPILOT_SETUP_API_KEY: "lp_test_opencode" }
  );
  const openCodeConfigPath = join(tempOpenCodeHome, ".config", "opencode", "opencode.json");
  const openCodeConfig = JSON.parse(readFileSync(openCodeConfigPath, "utf8"));
  const openCodeDoctor = run(
    universalDoctorBinary,
    ["--client", "opencode"],
    packageRoot,
    { HOME: tempOpenCodeHome }
  );

  run(
    universalSetupBinary,
    [
      "--client",
      "codex",
      "--allow-project-secret",
    ],
    packageRoot,
    { HOME: tempHome, LANDERPILOT_SETUP_API_KEY: "lp_test_codex" }
  );
  const codexConfigPath = join(tempHome, ".codex", "config.toml");
  const codexConfig = readFileSync(codexConfigPath, "utf8");
  const codexDoctor = run(
    universalDoctorBinary,
    ["--client", "codex"],
    packageRoot,
    { HOME: tempHome }
  );

  run(
    setupBinary,
    [
      "--scope",
      "all",
      "--project",
      tempProject,
      "--allow-project-secret",
    ],
    packageRoot,
    { HOME: tempHome, LANDERPILOT_SETUP_API_KEY: "lp_test_distribution" }
  );
  const projectConfigPath = join(tempProject, ".trae", "mcp.json");
  const globalConfigPath = join(tempHome, "Library", "Application Support", "Trae CN", "User", "mcp.json");
  const projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf8"));
  const globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf8"));
  const setupCheck = checkGeneratedConfig(projectConfig, installedRoot);
  const globalSetupCheck = checkGeneratedConfig(globalConfig, installedRoot);
  const doctor = run(
    doctorBinary,
    ["--scope", "all", "--project", tempProject],
    packageRoot,
    { HOME: tempHome }
  );

  run(
    setupBinary,
    [
      "--scope",
      "all",
      "--project",
      tempWindowsProject,
      "--platform",
      "win32",
      "--allow-project-secret",
    ],
    packageRoot,
    {
      APPDATA: tempWindowsAppData,
      USERPROFILE: tempWindowsHome,
      LANDERPILOT_SETUP_API_KEY: "lp_test_windows",
    }
  );
  const windowsProjectConfigPath = join(tempWindowsProject, ".trae", "mcp.json");
  const windowsCnConfigPath = join(tempWindowsAppData, "Trae CN", "User", "mcp.json");
  const windowsTraeConfigPath = join(tempWindowsAppData, "Trae", "User", "mcp.json");
  const windowsTraeSettingsConfigPath = join(tempWindowsAppData, "Trae", "User", "settings", "mcp.json");
  const windowsProjectConfig = JSON.parse(readFileSync(windowsProjectConfigPath, "utf8"));
  const windowsCnConfig = JSON.parse(readFileSync(windowsCnConfigPath, "utf8"));
  const windowsTraeConfig = JSON.parse(readFileSync(windowsTraeConfigPath, "utf8"));
  const windowsTraeSettingsConfig = JSON.parse(readFileSync(windowsTraeSettingsConfigPath, "utf8"));
  const windowsDoctor = run(
    doctorBinary,
    ["--scope", "all", "--project", tempWindowsProject, "--platform", "win32"],
    packageRoot,
    {
      APPDATA: tempWindowsAppData,
      USERPROFILE: tempWindowsHome,
    }
  );

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
        universalSetup: {
          genericConfigPath,
          generic: checkGeneratedConfig(genericConfig, installedRoot, "lp_test_generic"),
          genericDoctorMentionsOk: checkDoctorOutput(genericDoctor, "OK 通用项目 MCP 配置"),
          cursorConfigPath,
          cursor: checkGeneratedConfig(cursorConfig, installedRoot, "lp_test_cursor"),
          cursorDoctorMentionsOk: checkDoctorOutput(cursorDoctor, "OK Cursor 全局配置"),
          codeWhaleConfigPath,
          codeWhale: checkGeneratedCodeWhaleConfig(codeWhaleConfig, installedRoot, "lp_test_codewhale"),
          codeWhaleDoctorMentionsOk: checkDoctorOutput(codeWhaleDoctor, "OK CodeWhale 全局配置"),
          openCodeConfigPath,
          openCode: checkGeneratedOpenCodeConfig(openCodeConfig, installedRoot, "lp_test_opencode"),
          openCodeDoctorMentionsOk: checkDoctorOutput(openCodeDoctor, "OK OpenCode 全局配置"),
          codexConfigPath,
          codex: checkGeneratedCodexConfig(codexConfig, "lp_test_codex"),
          codexDoctorMentionsOk: checkDoctorOutput(codexDoctor, "OK Codex 全局配置"),
        },
        setup: {
          projectConfigPath,
          globalConfigPath,
          project: setupCheck,
          global: globalSetupCheck,
          doctorMentionsOk: checkDoctorOutput(doctor, "OK Trae 项目配置"),
        },
        windowsSetup: {
          projectConfigPath: windowsProjectConfigPath,
          cnConfigPath: windowsCnConfigPath,
          traeConfigPath: windowsTraeConfigPath,
          traeSettingsConfigPath: windowsTraeSettingsConfigPath,
          project: checkGeneratedConfig(windowsProjectConfig, installedRoot, "lp_test_windows"),
          cnGlobal: checkGeneratedConfig(windowsCnConfig, installedRoot, "lp_test_windows"),
          traeGlobal: checkGeneratedConfig(windowsTraeConfig, installedRoot, "lp_test_windows"),
          traeSettingsGlobal: checkGeneratedConfig(windowsTraeSettingsConfig, installedRoot, "lp_test_windows"),
          doctorMentionsOk: checkDoctorOutput(windowsDoctor, "OK Trae 项目配置"),
        },
      },
      null,
      2
    )}\n`
  );
} finally {
  if (tarballPath) rmSync(tarballPath, { force: true });
  rmSync(tempRoot, { force: true, recursive: true });
}

function npm(args, cwd) {
  return run("npm", args, cwd, { npm_config_cache: join(tempRoot, "npm-cache") });
}

function node(args, cwd) {
  return run(process.execPath, args, cwd);
}

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...extraEnv,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    timeout: 180000,
  });
  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with code ${result.status}\n${result.stdout}\n${result.stderr}`
    );
  }
  return result;
}

function checkGeneratedConfig(config, installedRoot, expectedApiKey = "lp_test_distribution") {
  const server = config.mcpServers?.landerpilot;
  if (!server) throw new Error("generated config is missing mcpServers.landerpilot");
  const expectedScript = join(installedRoot, "cloud-proxy.mjs");
  const ok =
    typeof server.command === "string" &&
    existsSync(server.command) &&
    existsSync(server.args[0]) &&
    samePath(server.args[0], expectedScript) &&
    server.env?.LANDERPILOT_API_KEY === expectedApiKey;
  if (!ok) {
    throw new Error(`generated config did not match expected shape: ${JSON.stringify(server, null, 2)}`);
  }
  return {
    command: server.command,
    script: server.args[0],
    apiKeyConfigured: true,
  };
}

function checkDoctorOutput(result, expected) {
  if (!result.stdout.includes(expected)) {
    throw new Error(`doctor output is missing ${JSON.stringify(expected)}:\n${result.stdout}`);
  }
  return true;
}

function checkGeneratedCodexConfig(configText, expectedApiKey) {
  const ok =
    configText.includes("# BEGIN landerpilot-mcp:landerpilot") &&
    configText.includes("[mcp_servers.landerpilot]") &&
    configText.includes("[mcp_servers.landerpilot.env]") &&
    configText.includes(`LANDERPILOT_API_KEY = "${expectedApiKey}"`) &&
    configText.includes("cloud-proxy.mjs");
  if (!ok) {
    throw new Error(`generated Codex config did not match expected shape:\n${configText}`);
  }
  return {
    markerConfigured: true,
    apiKeyConfigured: true,
  };
}

function checkGeneratedOpenCodeConfig(config, installedRoot, expectedApiKey) {
  const server = config.mcp?.landerpilot;
  if (!server) throw new Error("generated config is missing mcp.landerpilot");
  const expectedScript = join(installedRoot, "cloud-proxy.mjs");
  const ok =
    server.type === "local" &&
    server.enabled === true &&
    Array.isArray(server.command) &&
    existsSync(server.command[0]) &&
    existsSync(server.command[1]) &&
    samePath(server.command[1], expectedScript) &&
    server.environment?.LANDERPILOT_API_KEY === expectedApiKey;
  if (!ok) {
    throw new Error(`generated OpenCode config did not match expected shape: ${JSON.stringify(server, null, 2)}`);
  }
  return {
    command: server.command[0],
    script: server.command[1],
    apiKeyConfigured: true,
  };
}

function checkGeneratedCodeWhaleConfig(config, installedRoot, expectedApiKey) {
  const server = config.servers?.landerpilot;
  if (!server) throw new Error("generated config is missing servers.landerpilot");
  const expectedScript = join(installedRoot, "cloud-proxy.mjs");
  const ok =
    typeof server.command === "string" &&
    Array.isArray(server.args) &&
    existsSync(server.command) &&
    existsSync(server.args[0]) &&
    samePath(server.args[0], expectedScript) &&
    server.env?.LANDERPILOT_API_KEY === expectedApiKey &&
    server.enabled === true &&
    server.disabled === false;
  if (!ok) {
    throw new Error(`generated CodeWhale config did not match expected shape: ${JSON.stringify(server, null, 2)}`);
  }
  return {
    command: server.command,
    script: server.args[0],
    apiKeyConfigured: true,
  };
}

function samePath(left, right) {
  return realpathSync(left) === realpathSync(right);
}

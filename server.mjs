#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const localToolsScript = resolve(
  packageRoot,
  "skills",
  "landerpilot",
  "scripts",
  "local-tools.mjs"
);
const pluginManifestPath = resolve(packageRoot, "ganhuo-plugin.json");

const server = new McpServer(
  {
    name: "landerpilot-local-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: { listChanged: false },
    },
  }
);

server.registerTool(
  "list_sites",
  {
    title: "List LanderPilot Sites",
    description:
      "List LanderPilot Astro sites in a workspace. Read-only wrapper around skills/landerpilot/scripts/local-tools.mjs list-sites.",
    annotations: {
      title: "列出本地站点",
      readOnlyHint: true,
    },
    inputSchema: {
      workspace: z
        .string()
        .optional()
        .describe("Workspace directory. Defaults to the MCP server process cwd."),
      scan: z
        .boolean()
        .optional()
        .describe("Whether to scan child folders in addition to the .ganhuo index. Defaults to true."),
    },
  },
  async ({ workspace, scan = true }) =>
    localToolResult(["list-sites", ...workspaceArg(workspace), ...(scan ? [] : ["--no-scan"])])
);

server.registerTool(
  "inspect_site",
  {
    title: "Inspect LanderPilot Site",
    description:
      "Inspect one local LanderPilot site: package scripts, Astro pages, manifests, dist status, preview state, and deployment handoff.",
    annotations: {
      title: "检查本地站点",
      readOnlyHint: true,
    },
    inputSchema: {
      workspace: z
        .string()
        .optional()
        .describe("Workspace directory. Defaults to the MCP server process cwd."),
      site: z
        .string()
        .min(1)
        .describe("Site path inside the workspace, or an absolute path inside the workspace."),
    },
  },
  async ({ workspace, site }) =>
    localToolResult(["inspect-site", ...workspaceArg(workspace), "--site", site])
);

server.registerTool(
  "list_template_slots",
  {
    title: "List LanderPilot Templates",
    description:
      "List extracted LanderPilot blueprint/template slots and the cloud MCP deployment tool contract advertised by the plugin.",
    annotations: {
      title: "列出模板和云端工具",
      readOnlyHint: true,
    },
    inputSchema: {},
  },
  async () => localToolResult(["list-template-slots"])
);

server.registerTool(
  "prepare_deployment_handoff",
  {
    title: "Prepare Deployment Handoff",
    description:
      "Create or preview a local deployment handoff JSON for a built LanderPilot site. This does not call Cloudflare or deploy anything.",
    annotations: {
      title: "准备部署交接包",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      workspace: z
        .string()
        .optional()
        .describe("Workspace directory. Defaults to the MCP server process cwd."),
      site: z
        .string()
        .min(1)
        .describe("Site path inside the workspace, or an absolute path inside the workspace."),
      operation: z
        .enum(["new_deploy", "update_existing", "rollback", "unknown"])
        .optional()
        .describe("Deployment intent. Defaults to unknown."),
      domain: z
        .string()
        .optional()
        .describe("Custom domain explicitly supplied by the user, if any."),
      remoteProjectHint: z
        .string()
        .optional()
        .describe("Optional remote project name mentioned by the user."),
      notes: z.string().optional().describe("Optional handoff notes."),
      write: z
        .boolean()
        .optional()
        .describe("Write .ganhuo/deployment-handoff.json. Defaults to true; false previews only."),
    },
  },
  async ({ workspace, site, operation, domain, remoteProjectHint, notes, write = true }) => {
    const args = [
      "prepare-deployment-handoff",
      ...workspaceArg(workspace),
      "--site",
      site,
      "--operation",
      operation ?? "unknown",
      ...(domain ? ["--domain", domain] : []),
      ...(remoteProjectHint ? ["--remote-project-hint", remoteProjectHint] : []),
      ...(notes ? ["--notes", notes] : []),
      ...(write ? [] : ["--no-write"]),
    ];
    return localToolResult(args);
  }
);

server.registerTool(
  "get_cloud_mcp_connection",
  {
    title: "Get LanderPilot Cloud MCP Connection",
    description:
      "Return the extracted Ganhuo plugin's remote Streamable HTTP MCP connection settings. Requires a LanderPilot API key to use in a client.",
    annotations: {
      title: "查看云端 MCP 连接",
      readOnlyHint: true,
    },
    inputSchema: {},
  },
  async () => {
    const manifest = readJson(pluginManifestPath);
    return toolJson({
      serverName: manifest.serverName ?? "landerpilot",
      transport: manifest.transport,
      credentialHeaders: manifest.credentialHeaders,
      toolPolicy: manifest.toolPolicy,
      note:
        "Cloud deployment tools are live tools from https://landerpilot.com/api/mcp. Set Authorization: Bearer <LANDERPILOT_API_KEY> in your MCP client.",
      example: {
        mcpServers: {
          landerpilot: {
            type: "http",
            url: manifest.transport?.url ?? "https://landerpilot.com/api/mcp",
            headers: {
              Authorization: "Bearer ${LANDERPILOT_API_KEY}",
            },
          },
        },
      },
    });
  }
);

if (!existsSync(localToolsScript)) {
  process.stderr.write(`Missing local tools script: ${localToolsScript}\n`);
  process.exit(1);
}

const transport = new StdioServerTransport();
await server.connect(transport);

function workspaceArg(workspace) {
  return workspace ? ["--workspace", workspace] : [];
}

function toolJson(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function toolError(message) {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
}

async function localToolResult(args) {
  try {
    return toolJson(await runLocalTool(args));
  } catch (error) {
    return toolError(error instanceof Error ? error.message : String(error));
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function runLocalTool(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [localToolsScript, ...args], {
      cwd: packageRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`LanderPilot local tool timed out.\n${stderr || stdout}`));
    }, 30_000);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`LanderPilot local tool failed with code ${code}.\n${stderr || stdout}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch (error) {
        resolvePromise({
          raw: stdout,
          parseError: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
}

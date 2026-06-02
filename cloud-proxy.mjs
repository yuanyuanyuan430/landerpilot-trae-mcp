#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const remoteUrl = process.env.LANDERPILOT_MCP_URL || "https://landerpilot.com/api/mcp";
const apiKey = process.env.LANDERPILOT_API_KEY || process.env.LP_API_KEY || "";

let remoteClientPromise;

const server = new Server(
  {
    name: "landerpilot-cloud-stdio-bridge",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {
        listChanged: true,
      },
    },
    instructions:
      "Trae stdio bridge for LanderPilot cloud MCP. Set LANDERPILOT_API_KEY in the MCP env config.",
  }
);

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  if (!apiKey.trim()) {
    return { tools: [connectionStatusTool("missing_api_key")] };
  }

  try {
    const client = await getRemoteClient();
    const result = await client.listTools(request.params);
    return {
      ...result,
      tools: [connectionStatusTool("connected"), ...result.tools],
    };
  } catch (error) {
    return {
      tools: [connectionStatusTool("remote_connection_failed", errorMessage(error))],
    };
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "landerpilot_connection_status") {
    return connectionStatusResult();
  }

  if (!apiKey.trim()) {
    return toolError(
      "没有配置 LanderPilot API Key。请在 Trae 项目的 .trae/mcp.json 里设置 env.LANDERPILOT_API_KEY，或重新运行 landerpilot-trae-setup。"
    );
  }

  try {
    const client = await getRemoteClient();
    return client.callTool({
      name: request.params.name,
      arguments: request.params.arguments,
    });
  } catch (error) {
    return toolError(
      `调用 LanderPilot 云端 MCP 失败：${errorMessage(error)}\n\n请检查 API Key 是否正确、订阅是否有效，以及网络是否能访问 ${remoteUrl}。`
    );
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

function getRemoteClient() {
  if (!remoteClientPromise) {
    remoteClientPromise = connectRemoteClient();
  }
  return remoteClientPromise;
}

async function connectRemoteClient() {
  const client = new Client({
    name: "landerpilot-trae-cloud-proxy",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(remoteUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });
  await client.connect(transport);
  return client;
}

function connectionStatusTool(status, detail = "") {
  return {
    name: "landerpilot_connection_status",
    title: "LanderPilot 连接状态",
    description:
      status === "connected"
        ? "查看 LanderPilot 云端 MCP 连接状态。"
        : "LanderPilot 云端 MCP 未连接。调用本工具查看配置方法和错误原因。",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "连接状态",
      readOnlyHint: true,
    },
    _meta: {
      status,
      detail,
    },
  };
}

function connectionStatusResult() {
  const configured = Boolean(apiKey.trim());
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ok: configured,
            remoteUrl,
            apiKeyConfigured: configured,
            setup: configured
              ? "API Key 已配置。如果云端工具没有出现，请检查 Key、订阅和网络。"
              : "请在 Trae 项目的 .trae/mcp.json 里设置 env.LANDERPILOT_API_KEY，或在项目目录运行 landerpilot-trae-setup。",
          },
          null,
          2
        ),
      },
    ],
    isError: !configured,
  };
}

function toolError(text) {
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

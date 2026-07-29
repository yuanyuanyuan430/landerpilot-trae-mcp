#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createRemoteSession,
  probeRemoteConnection,
  validateRemoteUrl,
} from "./scripts/shared/remote-session.mjs";

const remoteUrl = process.env.LANDERPILOT_MCP_URL || "https://landerpilot.com/api/mcp";
const apiKey = process.env.LANDERPILOT_API_KEY || process.env.LP_API_KEY || "";
const allowCustomUrl = process.env.LANDERPILOT_ALLOW_CUSTOM_MCP_URL === "1";

const remoteSession = createRemoteSession(connectRemoteClient);

const server = new Server(
  {
    name: "landerpilot-cloud-stdio-bridge",
    version: "0.2.3",
  },
  {
    capabilities: {
      tools: {
        listChanged: true,
      },
    },
    instructions:
      "Stdio bridge for LanderPilot cloud MCP. Set LANDERPILOT_API_KEY in the MCP env config.",
  }
);

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  if (!apiKey.trim()) {
    return { tools: [connectionStatusTool("missing_api_key")] };
  }

  try {
    const result = await remoteSession.run((client) => client.listTools(request.params));
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
      "没有配置 LanderPilot API Key。请在当前 agent 的 MCP 配置里设置 env.LANDERPILOT_API_KEY，或重新运行 landerpilot-mcp-setup。"
    );
  }

  try {
    return await remoteSession.run((client) =>
      client.callTool({
        name: request.params.name,
        arguments: request.params.arguments,
      })
    );
  } catch (error) {
    return toolError(
      `调用 LanderPilot 云端 MCP 失败：${errorMessage(error)}\n\n请检查 API Key 是否正确、订阅是否有效，以及网络是否能访问 ${remoteUrl}。`
    );
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

async function connectRemoteClient() {
  const validatedRemoteUrl = validateRemoteUrl(remoteUrl, { allowCustomUrl });
  const client = new Client({
    name: "landerpilot-cloud-stdio-proxy",
    version: "0.2.3",
  });
  const transport = new StreamableHTTPClientTransport(new URL(validatedRemoteUrl), {
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

async function connectionStatusResult() {
  const status = await probeRemoteConnection({
    apiKey,
    remoteUrl,
    session: remoteSession,
  });
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ...status,
            setup: !status.apiKeyConfigured
              ? "请在当前 agent 的 MCP 配置里设置 env.LANDERPILOT_API_KEY，或运行 landerpilot-mcp-setup。"
              : status.ok
                ? "已成功调用云端 listTools。"
                : `云端连接失败：${status.error}。请检查 Key、订阅和网络。`,
          },
          null,
          2
        ),
      },
    ],
    isError: !status.ok,
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

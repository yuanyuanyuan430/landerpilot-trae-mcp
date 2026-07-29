import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  createRemoteSession,
  probeRemoteConnection,
} from "../scripts/shared/remote-session.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

test("a rejected connection is cleared so the next call retries", async () => {
  let attempts = 0;
  const session = createRemoteSession(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("first connect failed");
    return { listTools: async () => ({ tools: [{ name: "ready" }] }) };
  });

  await assert.rejects(() => session.run((client) => client.listTools()), /first connect failed/);
  const result = await session.run((client) => client.listTools());
  assert.equal(attempts, 2);
  assert.deepEqual(result.tools, [{ name: "ready" }]);
});

test("status calls remote listTools and retries after a remote call failure", async () => {
  let attempts = 0;
  const session = createRemoteSession(async () => {
    attempts += 1;
    const current = attempts;
    return {
      async listTools() {
        if (current === 1) throw new Error("remote list failed");
        return { tools: [{ name: "deploy" }, { name: "status" }] };
      },
    };
  });

  const failed = await probeRemoteConnection({
    apiKey: "lp_test",
    remoteUrl: "https://example.com/api/mcp",
    session,
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.apiKeyConfigured, true);
  assert.match(failed.error, /remote list failed/);

  const connected = await probeRemoteConnection({
    apiKey: "lp_test",
    remoteUrl: "https://example.com/api/mcp",
    session,
  });
  assert.equal(attempts, 2);
  assert.deepEqual(connected, {
    ok: true,
    remoteUrl: "https://example.com/api/mcp",
    apiKeyConfigured: true,
    remoteToolCount: 2,
  });
});

test("status without an API key fails without connecting", async () => {
  let attempts = 0;
  const session = createRemoteSession(async () => {
    attempts += 1;
    return { listTools: async () => ({ tools: [] }) };
  });

  const status = await probeRemoteConnection({
    apiKey: " ",
    remoteUrl: "https://example.com/api/mcp",
    session,
  });
  assert.deepEqual(status, {
    ok: false,
    remoteUrl: "https://example.com/api/mcp",
    apiKeyConfigured: false,
    error: "missing_api_key",
  });
  assert.equal(attempts, 0);
});

test("cloud bridge returns an MCP tool error when the remote call rejects", { timeout: 10_000 }, async () => {
  const client = new Client({
    name: "landerpilot-cloud-error-test",
    version: "0.1.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(packageRoot, "cloud-proxy.mjs")],
    cwd: packageRoot,
    env: {
      ...process.env,
      LANDERPILOT_API_KEY: "lp_test",
      LANDERPILOT_MCP_URL: "http://127.0.0.1:1/mcp",
      LANDERPILOT_ALLOW_CUSTOM_MCP_URL: "1",
    },
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "remote_failure",
      arguments: {},
    });
    assert.equal(result.isError, true);
    assert.match(result.content?.[0]?.text ?? "", /调用 LanderPilot 云端 MCP 失败/);
  } finally {
    await client.close();
  }
});

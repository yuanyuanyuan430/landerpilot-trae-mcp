export const defaultRemoteUrl = "https://landerpilot.com/api/mcp";

export function validateRemoteUrl(value, { allowCustomUrl = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`LanderPilot MCP URL 无效：${value}`);
  }

  if (url.username || url.password) {
    throw new Error("LanderPilot MCP URL 不允许包含用户名或密码。");
  }

  if (url.origin === "https://landerpilot.com") return url.href;

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const isLoopbackHttp = url.protocol === "http:" && loopbackHosts.has(url.hostname);
  if (url.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error("自定义 LanderPilot MCP URL 必须使用 HTTPS；仅回环地址允许 HTTP。");
  }
  if (!allowCustomUrl) {
    throw new Error(
      "自定义 LanderPilot MCP URL 会接收 Bearer API Key；确认端点可信后显式添加 --allow-custom-url。"
    );
  }

  return url.href;
}

export function createRemoteSession(connect) {
  let connectionPromise;

  function getConnection() {
    if (!connectionPromise) {
      const pending = Promise.resolve().then(connect);
      connectionPromise = pending;
      pending.catch(() => {
        if (connectionPromise === pending) connectionPromise = undefined;
      });
    }
    return connectionPromise;
  }

  async function run(operation) {
    const current = getConnection();
    const client = await current;
    try {
      return await operation(client);
    } catch (error) {
      if (connectionPromise === current) connectionPromise = undefined;
      throw error;
    }
  }

  return { run };
}

export async function probeRemoteConnection({ apiKey, remoteUrl, session }) {
  const apiKeyConfigured = Boolean(apiKey.trim());
  if (!apiKeyConfigured) {
    return {
      ok: false,
      remoteUrl,
      apiKeyConfigured: false,
      error: "missing_api_key",
    };
  }

  try {
    const result = await session.run((client) => client.listTools());
    return {
      ok: true,
      remoteUrl,
      apiKeyConfigured: true,
      remoteToolCount: Array.isArray(result?.tools) ? result.tools.length : 0,
    };
  } catch (error) {
    return {
      ok: false,
      remoteUrl,
      apiKeyConfigured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

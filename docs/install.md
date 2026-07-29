# 安装 LanderPilot MCP

## 1. 全局安装

需要 Node.js 22.12 或更高版本：

```bash
npm install -g landerpilot-mcp
```

setup 会把已安装包内 Cloud bridge 的绝对路径写进 MCP 配置。临时缓存路径可能随时消失，因此不支持用临时包执行器完成持久配置。

## 2. 选择 Agent

用户级配置：

```bash
landerpilot-mcp-setup --client trae
landerpilot-mcp-setup --client cursor
landerpilot-mcp-setup --client claude-desktop
landerpilot-mcp-setup --client codex
landerpilot-mcp-setup --client codewhale
landerpilot-mcp-setup --client opencode
```

Trae 默认只写用户级配置。OpenCode 若已存在 `opencode.jsonc`，setup 会合并到该文件，不会再静默创建并行的 `opencode.json`。

项目级或自定义配置会保存明文 API Key，默认拒绝。只有确认目标文件不会被提交后才能显式允许：

```bash
landerpilot-mcp-setup --client generic --project /path/to/project --allow-project-secret
landerpilot-mcp-setup --client claude-code --project /path/to/project --allow-project-secret
landerpilot-mcp-setup --client vscode --project /path/to/project --allow-project-secret
landerpilot-mcp-setup --config /path/to/mcp.json --allow-project-secret
```

setup 不修改 `.gitignore`。项目/自定义目标不会在工作树旁创建含旧 Key 的备份；默认全局目标的配置与备份会尽可能设置为 `0600`。显式 `--global-config` 按自定义敏感路径处理，需要 `--allow-project-secret`。

默认仅连接 `https://landerpilot.com`。可信自定义 HTTPS（或本机回环）端点需要同时使用 `--url` 和 `--allow-custom-url`；非回环 HTTP 会被拒绝。

API Key 默认隐藏输入。不要把真实 Key 放进命令行参数；自动化安装使用进程环境变量 `LANDERPILOT_SETUP_API_KEY`。

## 3. 检查

运行对应 doctor：

```bash
landerpilot-mcp-doctor --client cursor
landerpilot-mcp-doctor --client opencode
```

然后完全退出并重新打开 Agent / IDE，再调用：

```text
landerpilot_connection_status
```

状态工具会真实访问远端 `listTools`。失败时检查 API Key、订阅状态以及网络是否能访问：

```text
https://landerpilot.com/api/mcp
```

## Trae 旧命令

```bash
landerpilot-trae-setup
landerpilot-trae-doctor
```

两者是通用命令的兼容入口，默认同样只写用户级配置。

## 手动配置

只在客户端不受 setup 支持时使用。下面的文件含明文 Key，不要加入版本控制：

```json
{
  "mcpServers": {
    "landerpilot": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/landerpilot-mcp/cloud-proxy.mjs"],
      "env": {
        "LANDERPILOT_API_KEY": "paste your LanderPilot API Key",
        "LANDERPILOT_MCP_URL": "https://landerpilot.com/api/mcp"
      }
    }
  }
}
```

## 发布维护者检查

```bash
npm test
npm run pack:check
npm run verify:distribution
npm run publish:check
```

分发验证使用真实 npm 全局安装到临时前缀，不使用手工解包或源码依赖软链接。`publish:check` 查询精确的包名与版本；未登录时状态码 `2` 是预期的登录提示。

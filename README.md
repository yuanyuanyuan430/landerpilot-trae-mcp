# LanderPilot Trae MCP

![MCP](https://img.shields.io/badge/MCP-Server-111111)
![Trae](https://img.shields.io/badge/Trae-Ready-2563eb)
![LanderPilot](https://img.shields.io/badge/LanderPilot-Cloud%20Bridge-16a34a)
![JavaScript](https://img.shields.io/badge/JavaScript-Node.js-f97316)
![License](https://img.shields.io/badge/License-MIT-black)

把 LanderPilot 的建站、模板、预览和部署能力接入 Trae，让学生和团队可以用一句配置完成 MCP 连接。

`landerpilot-trae-mcp` 是一个面向 Trae 学员、课程交付、网站生成工作流和 LanderPilot 用户的 MCP 分发包。它包含两个核心入口：

- `cloud-proxy.mjs`: Trae-friendly stdio bridge，把 Trae 的 MCP 请求转发到 LanderPilot Cloud MCP。
- `server.mjs`: 本地 stdio MCP server，提供 LanderPilot 本地模板、站点检查和交付辅助工具。

配套脚本会自动写入 Trae 项目级和用户级 MCP 配置，降低学生安装、配置、粘贴 JSON、排查路径的成本。

## 它解决什么问题

| 场景 | 传统问题 | 这个包提供什么 |
| --- | --- | --- |
| Trae 学员安装 MCP | 不知道 JSON 写在哪里、命令怎么配 | `landerpilot-trae-setup` 一次生成配置 |
| Cloud MCP 接入 | stdio 客户端和远程 MCP 之间需要桥接 | `cloud-proxy.mjs` 负责转发 |
| 连接排查 | 学员说“看不到工具”，老师难复现 | `landerpilot-trae-doctor` 做本机诊断 |
| 本地模板开发 | 需要检查站点、模板 slots 和部署交付物 | `server.mjs` 提供本地辅助 tools |
| 课程分发 | Windows / macOS / Trae 文档容易散 | `docs/` 提供学生、老师、Windows 指南 |

## 干活宝 AI：PW 验证全流程

本包提供标准 Pi 插件入口 `pi-extension.mjs`，0.2.1 同时声明干活宝运行时权限策略。`landerpilot_pw` 是只读引导，`landerpilot_pw_create` 是独立写入工具，普通模式下遵守宿主确认。在支持 Pi 包的干活宝版本中，执行 `npm pack` 得到 `.tgz`，在插件页“从文件安装”后启用，并新建对话。无需重新打包客户端即可更新此建站与引导能力；运行中的旧对话保留旧版本。

用户说“帮我过 PW 验证”后，`landerpilot_pw(operation: "guide")` 依次引导账号连接、Cloudflare 检查、域名选择、复用或创建网站、发布、添加验证标签和 PW 页面回执。`landerpilot_pw_create` 生成四页推广站源文件；没有代码时先生成无标签网站，拿到网址再获取真实代码。后续由 Agent 继续构建与云端工具链，工具返回源文件成功不代表发布成功。

- [完整引导](skills/landerpilot/references/promotion-site.md)
- 云端部署沿用 LanderPilot 订阅和授权检查。PW 的最终审核由平台处理。
- 新版干活宝内置账号切换需要对应客户端修复；本插件不读取或改写客户端密钥。旧版可以在设置中安全替换 LanderPilot API Key。
- 已有站点一键添加标签需要服务端提供 `set_site_verification` / `check_site_verification`；工具尚不可用时使用本地源码构建，不调用不存在的接口。

## 快速安装

从 GitHub 安装全局命令：

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
```

在 Trae 项目文件夹中运行：

```bash
landerpilot-trae-setup
```

按提示粘贴 LanderPilot API Key。脚本会写入 Trae 可能读取的两个位置：

```text
.trae/mcp.json
Trae user mcp.json
```

完全退出并重新打开 Trae，然后让 Trae 检查连接：

```text
请调用 landerpilot_connection_status 检查连接。
```

如果 Trae 仍然看不到工具，运行：

```bash
landerpilot-trae-doctor
```

## Trae MCP 命令

Cloud bridge command:

```bash
node /path/to/landerpilot-trae-mcp/cloud-proxy.mjs
```

它会从 Trae MCP 配置里读取 `LANDERPILOT_API_KEY`，并把 Trae 的 stdio MCP 调用转发到 LanderPilot Cloud MCP。

## Local Stdio MCP

本地开发或调试时安装依赖：

```bash
npm install
```

运行本地 MCP server：

```bash
npm start
```

Client config example:

```json
{
  "mcpServers": {
    "landerpilot_local": {
      "command": "node",
      "args": [
        "/path/to/landerpilot-trae-mcp/server.mjs"
      ]
    }
  }
}
```

Local tools:

- `list_sites`
- `inspect_site`
- `list_template_slots`
- `prepare_deployment_handoff`
- `get_cloud_mcp_connection`

## Cloud MCP

LanderPilot Cloud MCP endpoint:

```text
https://landerpilot.com/api/mcp
```

Use `mcp.remote.example.json` as the client config shape. The cloud server provides deployment-oriented tools such as project inspection, artifact upload preparation, deployment, status checks, resource provisioning, asset upload, domain binding, and rollback.

## 文档

- [Full install guide](docs/install.md)
- [Student Trae quickstart](docs/student-trae-quickstart.md)
- [Teacher distribution guide](docs/teacher-distribution.md)
- [Windows one-click guide](docs/windows-one-click.md)
- [Deployment contract](docs/landerpilot-mcp-deployment-contract.md)

## Package Commands

```bash
landerpilot-trae-setup
landerpilot-trae-doctor
npm run pack:check
```

## 推荐分发路径

给学生的最短说明：

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
landerpilot-trae-setup
```

然后重启 Trae，发送：

```text
请调用 landerpilot_connection_status 检查连接。
```

## AI-readable project files

- [llms.txt](llms.txt): 给 AI agent 的轻量项目摘要。
- [llms-full.txt](llms-full.txt): 更完整的文件地图、命令和使用场景。

## 仓库结构

```text
cloud-proxy.mjs                 # Trae stdio -> LanderPilot Cloud MCP bridge
server.mjs                      # Local stdio MCP server
scripts/setup-trae.mjs          # Trae config setup helper
scripts/doctor-trae.mjs         # Trae connection doctor
docs/                           # student/teacher/windows install guides
skills/landerpilot/             # LanderPilot skill and local generation tools
blueprints/                     # site blueprint producers
generators/                     # Astro/site generation helpers
mcp.local.example.json          # local MCP config example
mcp.remote.example.json         # cloud MCP config example
```

## 适合谁

- Trae 学员和课程老师。
- 需要把建站 MCP 能力分发给团队的人。
- 想把 LanderPilot Cloud MCP 接进 stdio MCP 客户端的人。
- 需要本地检查模板、站点结构和部署交付物的开发者。

## License

MIT

## 实际宿主回归（0.2.1）

安装后的工具必须同时通过干活宝权限登记，仅通过标准 Pi 加载不够。运行：

```bash
npm run test:promotion
npm run verify:ganhuo -- --host-root /path/to/ganhuo-ai-next
```

宿主检出目录需已有锁定依赖。测试在隔离临时目录中使用真实 `PiUiPackageHost`、权限策略和 Pi 执行器，验证旧的仅注册 Pi 工具会被阻止、新版 guide 可以执行、create 仍需要写入授权、guide 授权不能用于 create。可使用 `--package-tar` 或 `--package-root` 检查实际交付包。缺少宿主会明确失败，不会跳过后宣称通过。测试不调用真实模型或线上服务；最终安装验收仍需在真实应用会话中调用只读 guide。

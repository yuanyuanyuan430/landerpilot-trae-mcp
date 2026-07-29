# LanderPilot MCP

![MCP](https://img.shields.io/badge/MCP-Server-111111)
![Agents](https://img.shields.io/badge/Agents-Universal-2563eb)
![LanderPilot](https://img.shields.io/badge/LanderPilot-Cloud%20Bridge-16a34a)
![JavaScript](https://img.shields.io/badge/JavaScript-Node.js-f97316)
![License](https://img.shields.io/badge/License-UNLICENSED-black)

把 LanderPilot 的建站、模板、预览和部署能力接入支持 stdio MCP 的 Agent。`landerpilot-mcp` 同时包含：

- `cloud-proxy.mjs`：把本地 stdio MCP 请求转发到 `https://landerpilot.com/api/mcp`。
- `server.mjs`：提供本地站点检查、模板和部署交付辅助工具。
- 通用 setup / doctor：为 Trae、Cursor、Claude、VS Code、Codex、CodeWhale 和 OpenCode 写入并检查配置。

## 它解决什么问题

| 场景 | 常见问题 | 这个包提供什么 |
| --- | --- | --- |
| Agent 接入 Cloud MCP | stdio 客户端不能直接使用远程 MCP | 本地 Cloud bridge |
| 配置路径不同 | 每个客户端的配置位置和格式不同 | 通用 setup |
| 连接排查 | “已写 Key”不等于云端可连接 | doctor + 真实 `listTools` 状态探测 |
| 课程或团队发放 | 安装命令和平台说明容易分散 | npm 全局安装与配套文档 |
| 本地模板开发 | 需要检查站点、模板 slots 和交付物 | Local helper MCP |

## 快速安装

Node.js 22.12 或更高版本：

```bash
npm install -g landerpilot-mcp
landerpilot-mcp-setup --client cursor
landerpilot-mcp-doctor --client cursor
```

setup 会隐藏 API Key 输入，并把已安装包中 `cloud-proxy.mjs` 的绝对路径写入客户端配置。配置依赖这个稳定路径，因此 setup 会拒绝从 npm 临时缓存运行；请始终先全局安装。

重启 Agent / IDE，然后调用：

```text
landerpilot_connection_status
```

这个状态工具会真实调用远端 `listTools`。Key 错误、订阅无效或网络不可达时会返回失败，而不是只检查环境变量是否存在。

## 支持的客户端

| `--client` | 默认写入位置 |
| --- | --- |
| `generic` | 项目 `.mcp.json` * |
| `trae` | Trae 用户级 `mcp.json` |
| `cursor` | `~/.cursor/mcp.json` |
| `claude-code` | 项目 `.mcp.json` * |
| `claude-desktop` | Claude Desktop 用户级配置 |
| `vscode` | 项目 `.vscode/mcp.json` * |
| `codex` | `~/.codex/config.toml` |
| `codewhale` | `~/.codewhale/mcp.json` |
| `opencode` | `~/.config/opencode/opencode.json`，若已有 `opencode.jsonc` 则复用它 |

标有 `*` 的目标会把明文 API Key 写进项目文件，默认拒绝。确认该文件不会提交到版本库后，必须显式允许：

```bash
landerpilot-mcp-setup --client claude-code --project /path/to/project --allow-project-secret
landerpilot-mcp-setup --client vscode --project /path/to/project --allow-project-secret
landerpilot-mcp-setup --config /path/to/mcp.json --allow-project-secret
```

setup 不会修改 `.gitignore`。项目/自定义目标不在工作树旁生成含旧 Key 的备份；默认全局目标的配置与备份会尽可能设为仅当前用户可读写（`0600`）。显式 `--global-config` 也按自定义敏感路径处理，必须同时确认 `--allow-project-secret`。

默认仅连接 `https://landerpilot.com`。可信自定义 HTTPS（或本机回环）端点必须同时传入 `--url` 与 `--allow-custom-url`；非回环 HTTP 始终拒绝，防止 Bearer API Key 被发送到不安全地址。

API Key 默认使用终端隐藏输入。命令行 `--api-key` 会暴露到进程列表或 shell 历史，因此被拒绝；CI 等自动化环境可通过仅注入到 setup 进程的 `LANDERPILOT_SETUP_API_KEY` 提供。

其他常用命令：

```bash
landerpilot-mcp-setup --client trae
landerpilot-mcp-setup --client claude-desktop
landerpilot-mcp-setup --client codex
landerpilot-mcp-setup --client codewhale
landerpilot-mcp-setup --client opencode
landerpilot-mcp-doctor --client opencode
```

OpenCode 保持当前 V1 `mcp.<name>` 配置形状，该形状兼容官方 V2。JSONC 合并只修改目标节点，保留既有注释、尾逗号和其他排版。

## Trae 兼容命令

旧命令仍然可用，并复用通用逻辑；默认只写 Trae 用户级配置：

```bash
landerpilot-trae-setup
landerpilot-trae-doctor
```

若明确需要项目配置，必须同时承担明文 Key 风险：

```bash
landerpilot-trae-setup --scope all --allow-project-secret
```

## Local Helper MCP

```bash
landerpilot-local-mcp
```

本地工具：

- `list_sites`
- `inspect_site`
- `list_template_slots`
- `prepare_deployment_handoff`
- `get_cloud_mcp_connection`

这些工具只检查或生成本地交付数据，不会自行部署。`affiliate-review-yp` 变体会为每个页面加入一次 YeahPromos 验证 meta；默认 affiliate-review 变体不加入。Blog、affiliate-review 和 cashback 的真实内容策略会 fail fast，只有显式 `demo_mode: true` 才允许演示占位。

## 发布前验证

```bash
npm install
npm test
npm run pack:check
npm run verify:distribution
npm run publish:check
```

`verify:distribution` 会创建 npm tarball，使用真实的 `npm install -g <tarball> --prefix <temp>` 安装，再从临时前缀运行 MCP 与各客户端配置 smoke test；tarball 在 `finally` 中清理。

`publish:check` 查询精确的 `landerpilot-mcp@0.2.3`，并运行 `npm publish --dry-run`。未登录时检查完成后会以状态码 `2` 退出；先运行：

```bash
npm adduser --registry https://registry.npmjs.org
```

实际发布：

```bash
npm run publish:npm
```

`prepublishOnly` 会再次运行测试、包内容检查和真实分发安装验证。

## 文档

- [完整安装说明](docs/install.md)
- [各 Agent 命令](docs/agent-install-commands.md)
- [Trae 学员快速上手](docs/student-trae-quickstart.md)
- [老师发放说明](docs/teacher-distribution.md)
- [Windows 一键安装](docs/windows-one-click.md)
- [部署契约](docs/landerpilot-mcp-deployment-contract.md)
- [llms.txt](llms.txt) / [llms-full.txt](llms-full.txt)

## License

`UNLICENSED`。仓库和 npm 包没有声明 MIT 授权，请不要把依赖包的许可证误认为本项目许可证。

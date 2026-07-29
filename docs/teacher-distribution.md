# 老师发放说明

## 发布前

```bash
npm test
npm run pack:check
npm run verify:distribution
npm run publish:check
```

`verify:distribution` 必须显示真实 tarball 全局安装 smoke test 通过。`publish:check` 未登录时会以状态码 `2` 提醒登录；其他非零状态要先排查。

发布：

```bash
npm run publish:npm
```

项目许可证是 `UNLICENSED`，不要在课程材料里写 MIT。

## 发给学员

先统一安装一次：

```bash
npm install -g landerpilot-mcp
```

再只运行对应 Agent 的命令：

```bash
landerpilot-mcp-setup --client trae
landerpilot-mcp-setup --client cursor
landerpilot-mcp-setup --client claude-desktop
landerpilot-mcp-setup --client codex
landerpilot-mcp-setup --client codewhale
landerpilot-mcp-setup --client opencode
```

这些命令默认写用户级配置。配置完成后重启 Agent / IDE，并让学员发送：

```text
请调用 landerpilot_connection_status 检查连接。
```

## 项目配置的风险

Generic、Claude Code 和 VS Code/Copilot 主要使用项目配置。它们会在项目文件中保存明文 API Key，因此 setup 默认拒绝。确实需要时：

```bash
landerpilot-mcp-setup --client claude-code --project /path/to/project --allow-project-secret
landerpilot-mcp-setup --client vscode --project /path/to/project --allow-project-secret
```

使用前必须告诉学员：

1. setup 不会替他们修改 `.gitignore`。
2. 项目/自定义目标不在工作树旁保存含 Key 的备份；默认全局目标的配置与备份会尽可能设为 `0600`。
3. 运行后要检查版本控制状态，不得把 Key 发到群聊或仓库。

## 诊断

```bash
landerpilot-mcp-doctor --client cursor
```

doctor 检查本地配置；`landerpilot_connection_status` 进一步真实调用远端 `listTools`。连接失败时依次核对 Key、订阅和网络。

Trae 兼容命令仍可使用：

```bash
landerpilot-trae-setup
landerpilot-trae-doctor
```

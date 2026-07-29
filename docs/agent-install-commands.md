# 各 Agent 安装命令

所有平台先全局安装：

```bash
npm install -g landerpilot-mcp
```

再选择一个客户端：

```bash
landerpilot-mcp-setup --client trae
landerpilot-mcp-setup --client cursor
landerpilot-mcp-setup --client claude-desktop
landerpilot-mcp-setup --client codex
landerpilot-mcp-setup --client codewhale
landerpilot-mcp-setup --client opencode
```

检查时把客户端名保持一致：

```bash
landerpilot-mcp-doctor --client trae
```

Generic、Claude Code 和 VS Code/Copilot 只能写项目配置。明文 Key 有误提交风险，必须显式允许：

```bash
landerpilot-mcp-setup --client generic --project /path/to/project --allow-project-secret
landerpilot-mcp-setup --client claude-code --project /path/to/project --allow-project-secret
landerpilot-mcp-setup --client vscode --project /path/to/project --allow-project-secret
```

setup 不会修改 `.gitignore`。完成后检查版本控制状态，再重启 Agent / IDE 并调用 `landerpilot_connection_status`。

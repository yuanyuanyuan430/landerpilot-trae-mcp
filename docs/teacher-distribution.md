# 老师发放说明

## 你需要提前做两件事

1. 把学员的 GitHub 账号加入私有仓 `yuanyuanyuan430/landerpilot-trae-mcp`。
2. 给学员发 LanderPilot API Key。

私有仓没有授权时，学员执行安装命令会失败。

## 发给学员的命令

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
```

然后让学员在自己的 Trae 项目文件夹里运行：

```bash
landerpilot-trae-setup
```

学员粘贴 API Key 后，脚本会自动写入：

```text
.trae/mcp.json
```

最后让学员重启 Trae，打开 MCP 面板，确认 `landerpilot` 已启用。

## 学员常见问题

如果没有 `npm`，让学员安装 Node.js LTS。

如果装包时提示没有权限，说明学员 GitHub 账号还没加入私有仓，或本机没有登录 GitHub。

如果 Trae 看不到工具，让学员重新运行 `landerpilot-trae-setup`，再重启 Trae。

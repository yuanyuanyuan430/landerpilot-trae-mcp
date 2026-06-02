# 老师发放说明

## 你需要提前做两件事

1. 把学员的 GitHub 账号加入私有仓 `yuanyuanyuan430/landerpilot-trae-mcp`。
2. 给学员发 LanderPilot API Key。

私有仓没有授权时，学员执行安装命令会失败。

## 发给学员的两条命令

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
```

让学员进入自己的 Trae 项目文件夹，再运行：

```bash
landerpilot-trae-setup
```

学员粘贴 API Key 后，脚本会自动写入项目配置和 Trae 全局配置。不要让学员手改 JSON。

最后让学员完全退出 Trae，重新打开项目，在聊天框输入：

```text
请调用 landerpilot_connection_status 检查连接。
```

## 学员常见问题

如果没有 `npm`，让学员安装 Node.js LTS。

如果装包时提示没有权限，说明学员 GitHub 账号还没加入私有仓，或本机没有登录 GitHub。

如果 Trae 看不到工具，让学员运行：

```bash
landerpilot-trae-doctor
```

如果 doctor 也提示失败，让学员重新运行 `landerpilot-trae-setup`，再完全重启 Trae。

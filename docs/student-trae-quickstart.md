# Trae 学员三步安装

## 1. 安装

打开终端，运行老师给你的安装命令：

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
```

如果提示没有 `npm`，先安装 Node.js LTS。

如果提示没有 GitHub 权限，请把你的 GitHub 用户名发给老师，让老师把你加入私有仓。

## 2. 配置 API Key

进入你的 Trae 项目文件夹，运行：

```bash
landerpilot-trae-setup
```

看到提示后，粘贴老师/平台给你的 LanderPilot API Key，然后回车。

它会自动生成：

```text
.trae/mcp.json
```

## 3. 打开 Trae

重启 Trae，打开项目。

进入 Trae 的 MCP 面板，确认 `landerpilot` 已启用。如果 Trae 提示是否导入项目 MCP 配置，选择导入/启用。

## 出问题怎么办

如果 Trae 里看不到工具：

1. 确认已经重启 Trae。
2. 确认当前项目里有 `.trae/mcp.json`。
3. 重新运行：

```bash
landerpilot-trae-setup
```

如果 API Key 写错，也重新运行上面的命令覆盖即可。

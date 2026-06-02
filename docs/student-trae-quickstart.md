# Trae 学员傻瓜式安装

## 第一步：安装

打开终端，运行老师给你的安装命令：

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
```

如果提示没有 `npm`，先安装 Node.js LTS。

如果提示没有 GitHub 权限，请把你的 GitHub 用户名发给老师，让老师把你加入私有仓。

## 第二步：配置

进入你的 Trae 项目文件夹，运行：

```bash
landerpilot-trae-setup
```

看到提示后，粘贴老师给你的 LanderPilot API Key，然后回车。粘贴时屏幕不会显示，这是正常的。

它会自动写好 Trae 需要的配置，不用你手动改 JSON。

## 第三步：重启 Trae

完全退出 Trae，再重新打开你的项目。

在 Trae 聊天框里发：

```text
请调用 landerpilot_connection_status 检查连接。
```

看到连接成功后，就可以继续发：

```text
请使用 LanderPilot MCP 帮我把当前网站部署上线，并把访问链接发给我。
```

## 出问题怎么办

先运行：

```bash
landerpilot-trae-doctor
```

如果它提示没有配置，重新运行：

```bash
landerpilot-trae-setup
```

如果 API Key 写错，也重新运行 `landerpilot-trae-setup` 覆盖即可。

# Trae 学员快速安装

## 第一步：安装

打开终端：

```bash
npm install -g landerpilot-mcp
```

若提示没有 `npm`，先安装 Node.js LTS，再重新打开终端。

## 第二步：配置

```bash
landerpilot-trae-setup
```

也可以使用统一命令：

```bash
landerpilot-mcp-setup --client trae
```

粘贴老师提供的 LanderPilot API Key 后按回车。输入不会显示在屏幕上。默认只写 Trae 用户级配置，不会把 Key 放进当前项目。

## 第三步：重启并验收

完全退出 Trae，再重新打开项目，然后发送：

```text
请调用 landerpilot_connection_status 检查连接。
```

连接成功后再开始建站或部署任务。

## 出问题怎么办

```bash
landerpilot-trae-doctor
```

若 doctor 找不到配置，重新运行 setup。若状态工具提示远端失败，检查 Key、订阅和网络；状态工具已经真实调用远端，不是仅检查 Key 是否存在。

不要把带有 `LANDERPILOT_API_KEY` 的配置复制到项目或提交到 Git。确实需要项目级配置时，先让老师说明风险和 `--allow-project-secret` 的用途。

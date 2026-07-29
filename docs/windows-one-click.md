# Windows 一键安装

把 [install-windows.ps1](../scripts/install-windows.ps1) 放到学员电脑，在 PowerShell 中运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

脚本会：

1. 检查 Node.js 和 npm，必要时通过 `winget` 安装 Node.js LTS。
2. 执行 `npm install -g landerpilot-mcp`。
3. 隐藏输入 LanderPilot API Key。
4. 只写 Trae 用户级 MCP 配置。
5. 运行 `landerpilot-mcp-doctor --client trae --scope global`。

Windows 常见目标位于：

```text
%APPDATA%\Trae CN\User\mcp.json
%APPDATA%\Trae\User\mcp.json
```

脚本不会向项目 `.trae/mcp.json` 写入明文 Key。完成后完全退出 Trae，重新打开并发送：

```text
请调用 landerpilot_connection_status 检查连接。
```

如需非默认包源，可通过 `-Package` 传入 npm 可安装的包规格；无论来源如何，安装方式仍是全局安装。

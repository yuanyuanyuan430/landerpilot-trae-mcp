# Windows 一键安装

## 学员只需要做这件事

在 Trae 项目文件夹里打开 PowerShell，运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

如果老师没有把 `install-windows.ps1` 发到项目文件夹，也可以先下载/复制本仓库的：

```text
scripts/install-windows.ps1
```

运行后脚本会自动做这些事：

1. 检查 Node.js 和 Git。
2. 如果电脑有 `winget`，会尝试自动安装 Node.js LTS 和 Git。
3. 安装 `landerpilot-trae-mcp`。
4. 提示粘贴 LanderPilot API Key。
5. 自动写入项目配置 `.trae/mcp.json`。
6. 自动写入 Trae Windows 全局配置：
   - `%APPDATA%\Trae CN\User\mcp.json`
   - `%APPDATA%\Trae\User\mcp.json`
7. 自动运行 `landerpilot-trae-doctor` 检查配置。

最后让学员完全退出 Trae，再重新打开项目，在聊天框输入：

```text
请调用 landerpilot_connection_status 检查连接。
```

## 私有仓注意事项

当前安装包在私有 GitHub 仓库里。学员必须满足其中一种情况：

1. 老师已经把学员 GitHub 账号加入私有仓。
2. 学员电脑已经配置好可访问该私有仓的 GitHub 凭据。

否则安装阶段会提示 GitHub 权限错误。

如果你想让完全零基础学员连 GitHub 登录都不用碰，建议后续把包发布到 npm 或做成公开只读仓。API Key 不放在包里，所以公开包本身不泄露 Key。

param(
  [string]$ProjectPath = (Get-Location).Path,
  [string]$Package = "landerpilot-mcp",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-CommonPath($PathToAdd) {
  if ((Test-Path $PathToAdd) -and ($env:Path -notlike "*$PathToAdd*")) {
    $env:Path = "$PathToAdd;$env:Path"
  }
}

function Install-WithWinget($Id, $Name) {
  if (-not (Test-Command winget)) {
    throw "没有找到 winget，无法自动安装 $Name。请先安装 $Name 后重新运行本脚本。"
  }

  Write-Step "正在安装 $Name"
  winget install --id $Id -e --source winget --accept-package-agreements --accept-source-agreements
}

Write-Host "LanderPilot MCP Windows 一键安装" -ForegroundColor Green
Write-Host "项目目录：$ProjectPath"

if (-not (Test-Path $ProjectPath)) {
  New-Item -ItemType Directory -Path $ProjectPath | Out-Null
}

if (-not (Test-Command node)) {
  Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js LTS"
  Add-CommonPath "$env:ProgramFiles\nodejs"
}

if (-not (Test-Command npm)) {
  Add-CommonPath "$env:ProgramFiles\nodejs"
}

if (($Package -like "github:*") -and -not (Test-Command git)) {
  Install-WithWinget "Git.Git" "Git"
  Add-CommonPath "$env:ProgramFiles\Git\cmd"
  Add-CommonPath "$env:LOCALAPPDATA\Programs\Git\cmd"
}

if (-not (Test-Command npm)) {
  throw "npm 仍然不可用。请关闭 PowerShell，重新打开后再运行本脚本。"
}

if (($Package -like "github:*") -and -not (Test-Command git)) {
  throw "git 仍然不可用。请关闭 PowerShell，重新打开后再运行本脚本。"
}

if (-not $SkipInstall) {
  Write-Step "正在安装 LanderPilot MCP"
  npm install -g $Package
}

$npmPrefix = (& npm prefix -g).Trim()
$setupCmd = Join-Path $npmPrefix "landerpilot-mcp-setup.cmd"
$doctorCmd = Join-Path $npmPrefix "landerpilot-mcp-doctor.cmd"

if (-not (Test-Path $setupCmd)) {
  $setupCmd = "landerpilot-mcp-setup"
}
if (-not (Test-Path $doctorCmd)) {
  $doctorCmd = "landerpilot-mcp-doctor"
}

Write-Step "正在写入 Trae MCP 配置"
$setupArgs = @("--client", "trae", "--scope", "global")
& $setupCmd @setupArgs

Write-Step "正在检查配置"
& $doctorCmd --client trae --scope global

Write-Host ""
Write-Host "完成。现在请完全退出 Trae，再重新打开这个项目。" -ForegroundColor Green
Write-Host "打开后在 Trae 聊天框输入：请调用 landerpilot_connection_status 检查连接。"

# 本地构建与预览管理

LanderPilot 面向 Windows 和 macOS 小白用户，预览进程必须被严格管理。

## 禁止

- 不跑 `npm run dev`。
- 不跑 `npm run preview`。
- 不跑 `astro dev`、`npx astro dev`、`astro preview`。
- 不用 `lsof`、`pkill`、`killall`、`taskkill` 手工处理进程。
- 不在 cwd 根目录跑站点命令，除非 cwd 根目录就是明确的站点目录。
- 优先用 `npm --prefix "<站点目录>" ...`，不要依赖当前 shell cwd。

## 固定命令

所有命令都明确指向具体站点目录：

```bash
npm --prefix "<站点目录>" install --no-audit --no-fund --prefer-offline --progress=false
npm --prefix "<站点目录>" run build
npm --prefix "<站点目录>" run ganhuo:preview:start
npm --prefix "<站点目录>" run ganhuo:preview:status
npm --prefix "<站点目录>" run ganhuo:preview:doctor
npm --prefix "<站点目录>" run ganhuo:preview:restart
npm --prefix "<站点目录>" run ganhuo:preview:stop
```

## 生命周期

- 每个站点最多一个预览进程。
- `ganhuo:preview:start` 是幂等 ensure：同一站点已有健康预览时复用原 pid/端口；没有时启动受管预览，并优先复用该站点的端口租约。
- 预览进程会自动回收：默认空闲 30 分钟退出，最长 2 小时退出。需要继续看时重新 start。
- stop/restart 只会控制通过 health token 验证的当前站点预览，避免旧状态文件误杀其他进程。
- 多个站点可以同时预览；端口租约写在 workspace 的 `.ganhuo/preview-port-leases.json`，不要猜端口，以命令输出为准。
- 启动后立刻跑一次 status。
- 每次 build 后看 status。
- 切换站点或用户不看预览时 stop 旧站点。
- 如果 status 是 `unreachable`、`unhealthy`、`stopped`，先 doctor，再 restart，一次重启仍失败再读日志尾部说明原因。

## 交付话术

读到 `LanderPilot preview ready: http://127.0.0.1:<port>/` 后，必须显式提示点击：

```text
站点预览已经启动。请点击下面这个本地预览链接打开：
[打开预览](http://127.0.0.1:<端口>/)
```

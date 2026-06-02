# LanderPilot 云端 MCP 部署能力契约

这份文档定义 LanderPilot plugin（`landerpilot` builtin）内置的云端 MCP 连接契约：云端 MCP 暴露哪些工具、干活AI 怎么接入、线上写操作怎么保证安全。本地站点检查和部署交接由 Skill 脚本完成，不再暴露本地 MCP。

> 2026-05-22 起：云端 MCP server 已重新实现并部署，工具集从「plan / confirm / execute」协议改为「项目登记 + 产物 staging + 直接部署」的业务工具集。本文档已同步到当前部署。

## 边界

本地 Skill 脚本负责：

- 站点生成、`npm run build`、本地预览、本地 manifest。
- `local-tools.mjs prepare-deployment-handoff` 生成 `.ganhuo/deployment-handoff.json`（dist 指纹、文件数、大小）。
- `dist` 产物打包，并按云端 MCP 给的 `uploadUrl` 发起上传。

云端 MCP 负责：

- SaaS 项目登记与查询。
- Cloudflare 资源供给（D1 / R2 / KV）。
- 构建产物 staging。
- 部署到 Cloudflare Pages / Worker。
- 部署状态查询、自定义域名绑定、回滚。

agent 本地负责 Astro 代码生成和 build；云端 MCP 负责资源供给、artifact staging、部署和状态查询。

## 连接

| 项 | 值 |
|---|---|
| URL | `https://landerpilot.com/api/mcp` |
| Auth | `Authorization: Bearer <LanderPilot API Key>` |
| Transport | Streamable HTTP |

`Bearer` 后面是 LanderPilot SaaS 发给 agent 的 API key，**不是 Cloudflare token**。Cloudflare token 存在服务端 `cf_credentials`，client 不直接接触。

干活AI 侧由 `plugins/builtin/landerpilot/ganhuo-plugin.json` 配置：`transport.url` 指向上面的 URL，`credentialHeaders` 把用户在 LanderPilot plugin 连接里填的 `apiKey` 拼成 `Authorization: Bearer …`。

接入前置条件：

- 用户有有效 LanderPilot API key。
- 用户订阅有效。
- 用户已在 LanderPilot Web 端连接 Cloudflare。

## 干活AI 集成约定（关键）

### 工具列表实时下发，本地不固化

`landerpilot` 是 `trustLevel: builtin` 的 LanderPilot plugin，并且 `toolPolicy.allowLiveTools: true`。干活AI 在连接时通过 streamable HTTP 调 `tools/list` 实时获取云端工具，本地 `ganhuo-plugin.json` **不维护云端 `tools` 数组**。云端 MCP 增删工具时不需要改干活AI 仓库。

代价：网络探测失败时干活AI 会回退到本地清单——本地清单为空意味着探测失败时该次会话拿不到 LanderPilot 工具，需用户重连。

### 工具必须自带 annotations（服务端硬要求）

因为本地不固化工具清单，**工具的显示名和风险等级完全由 MCP server 在 `tools/list` 里下发的 `annotations` 决定**。

干活AI 的风险判定逻辑（`classifyMcpToolRisk`）：

1. `annotations.destructiveHint === true` → **high 风险**（每次调用都弹用户确认）。
2. `annotations.readOnlyHint === true` 且无 `openWorldHint` → **low 风险**（只读，自动放行）。
3. `annotations.openWorldHint === true` → **medium 风险**（弹确认）。
4. 都没有时，回退到「按工具名正则猜」——正则**不包含** `deploy` / `provision` / `bind` / `rollback`，会把这些高危工具误判成 low 风险并**自动放行、不弹确认框**。

所以 MCP server 必须给每个工具显式设置 annotations。否则 `deploy_site`、`provision_site_resource`、`bind_site_domain`、`rollback_deployment` 会被当成低风险自动执行，直接违反下面的安全规则。

`annotations.title`（中文）会被干活AI 当作工具卡片显示名；不设则显示英文工具名。

### annotations 推荐映射

| 工具 | 期望风险 | annotations |
|---|---|---|
| `inspect_project` | low | `readOnlyHint: true` |
| `get_deployment_status` | low | `readOnlyHint: true` |
| `create_or_update_site_project` | medium | `openWorldHint: true` |
| `prepare_artifact_upload` | medium | `openWorldHint: true` |
| `complete_artifact_upload` | medium | `openWorldHint: true` |
| `upload_site_asset` | medium | `openWorldHint: true` |
| `deploy_site` | high | `destructiveHint: true` |
| `provision_site_resource` | high | `destructiveHint: true` |
| `run_site_d1` | high | `destructiveHint: true` |
| `bind_site_domain` | high | `destructiveHint: true` |
| `rollback_deployment` | high | `destructiveHint: true` |

每个工具再加一个中文 `annotations.title`（如 `deploy_site` → `部署站点`），干活AI 的工具卡片就能显示中文。

## 暴露的工具（11 个）

`tools/list` 是各工具入参 / 出参 schema 的唯一权威源。下面是用途说明。

| 工具 | 用途 |
|---|---|
| `inspect_project` | 读取当前 SaaS / Cloudflare 项目、部署、资源绑定状态。订阅不可用时返回失败，后续写操作必须拒绝。 |
| `create_or_update_site_project` | 登记 / 更新云端站点项目：`localSiteId`、`siteName`、`deploySurface`（`pages` 或 `worker`）、`framework`、`locale`。只写 SaaS 记录，不创建 Cloudflare 实时资源。 |
| `prepare_artifact_upload` | 为构建产物创建上传会话。`kind` 取 `pages_dist` 或 `worker_bundle`，返回 `artifactId`、`uploadUrl`、`method`。 |
| `complete_artifact_upload` | 校验已 PUT 上传的产物指纹，标记其可用于部署。 |
| `deploy_site` | 把已上传产物部署到 Cloudflare Pages / Worker。高风险线上写操作。 |
| `get_deployment_status` | 查询部署进度、production / preview URL、日志、失败原因。 |
| `provision_site_resource` | 为站点供给 Cloudflare 资源（`kind: d1 / r2 / kv …`，`bindingName`）。高风险，会产生计费资源。 |
| `run_site_d1` | 对站点的 D1 数据库执行 SQL（建表、迁移、写入）。高风险线上写操作。 |
| `upload_site_asset` | 把单个静态资源上传到站点的 R2 桶等媒体存储。 |
| `bind_site_domain` | 绑定自定义域名并配置 DNS。高风险线上写操作。 |
| `rollback_deployment` | 回滚到某个历史部署。高风险线上写操作。 |

## 推荐工作流

### Pages 静态站

```text
inspect_project
create_or_update_site_project(deploySurface: "pages")
prepare_artifact_upload(kind: "pages_dist")
PUT artifact zip 到 uploadUrl
complete_artifact_upload
deploy_site
get_deployment_status
bind_site_domain
```

### Worker + D1 / R2

```text
inspect_project
create_or_update_site_project(deploySurface: "worker")
provision_site_resource(kind: "d1", bindingName: "DB")
run_site_d1
provision_site_resource(kind: "r2", bindingName: "MEDIA")
prepare_artifact_upload(kind: "worker_bundle")
PUT worker bundle zip 到 uploadUrl
complete_artifact_upload
deploy_site
get_deployment_status
bind_site_domain
```

### 直接 curl 测连通

```bash
curl -sN https://landerpilot.com/api/mcp \
  -H "authorization: Bearer $LANDERPILOT_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## 安全与确认规则

每一次线上写操作前都必须：

1. 用 `inspect_project` 查询最新线上状态。
2. 把目标资源、当前线上版本、本次影响讲清楚，让用户明确确认。
3. 确认后再调用写操作工具。
4. 如果线上状态相比 `inspect_project` 已经变化，重新 `inspect_project` 并重新确认。

服务端不能把本地 `.ganhuo` 文件当作线上事实——它们只是线索和本地构建事实。

已有线上资源是高风险场景。更新既有 Pages / Worker 部署、自定义域名、DNS 记录、D1 / R2 / KV 绑定、回滚时，确认摘要必须点名受影响资源、当前 deployment id 和 updatedAt。

必须用户确认的工具：`create_or_update_site_project`、`prepare_artifact_upload`、`complete_artifact_upload`、`deploy_site`、`provision_site_resource`、`run_site_d1`、`upload_site_asset`、`bind_site_domain`、`rollback_deployment`。`inspect_project` 和 `get_deployment_status` 是只读，可自动放行。

## 错误结构

所有工具都应该返回结构化错误：

```json
{
  "ok": false,
  "code": "subscription_inactive | auth_required | target_ambiguous | remote_state_changed | upload_missing | cloudflare_error",
  "message": "Human readable message",
  "remediation": "What the agent/user should do next",
  "retryable": false
}
```

# LanderPilot 部署安全流程

LanderPilot 的部署分两层：

- 本地 Skill 脚本：生成、构建、预览 Astro 静态站点，并准备部署交接包。
- 本 LanderPilot plugin 内置的云端 MCP：查询线上事实、staging 构建产物、供给 Cloudflare 资源，并在用户确认后部署到 Pages / Worker、绑定域名。

云端 MCP 走 streamable HTTP，需要用户填写 LanderPilot API 密钥；工具列表在连接时实时下发。本地 `.ganhuo` 配置只能说明“用户本机上一次认为的目标”，不能代表线上事实。每一次线上写操作前，都必须用 `inspect_project` 重新查询线上状态。

## 红线

- 不凭历史记忆部署。
- 不只凭 `.ganhuo/landerpilot-sites.json`、`public/.ganhuo/site.json`、`.ganhuo/deployment-handoff.json` 判断线上目标。
- 不在没有用户确认的情况下创建、更新、删除、绑定、回滚任何线上资源。
- 不在目标不唯一时猜测 Worker / Pages / domain / zone / project。
- 不根据站点名 / 品牌名编造域名。自定义域名只能来自用户明确提供、且用户确认自己拥有并能在自己 Cloudflare 账号里管理；首次部署到 Cloudflare Pages 默认只有 `*.pages.dev` 地址。
- 不把“连接 MCP 成功”当作“可以部署”。订阅、授权、目标状态都必须单独检查。

## 必须确认的线上动作

以下动作全部必须让用户确认（对应云端 MCP 工具）：

- 部署到 Cloudflare Pages / Worker（`deploy_site`）。
- 供给 D1 / R2 / KV 等线上资源（`provision_site_resource`）。
- 对 D1 数据库执行 SQL（`run_site_d1`）。
- 绑定或变更自定义域名、DNS 记录（`bind_site_domain`）。
- 覆盖已有 production deployment。
- 回滚线上版本（`rollback_deployment`）。

只要线上资源已经存在，确认文案必须点名：

- 当前线上 project / worker / pages 名称。
- 当前 domain / zone。
- 当前 deployment id / version / updatedAt。
- 本次会替换或新增的资源。
- 回滚方案或上一个可回滚 deployment id。

## 标准流程

### 1. 本地事实固定

在站点目录完成：

1. `npm --prefix "<站点目录>" run build`
2. `node "<本技能目录>/scripts/local-tools.mjs" inspect-site --workspace "<工作区>" --site "<站点目录或相对路径>"`
3. `node "<本技能目录>/scripts/local-tools.mjs" prepare-deployment-handoff --workspace "<工作区>" --site "<站点目录或相对路径>" --operation "<new_deploy|update_existing|rollback|unknown>"`

`prepare-deployment-handoff` 会读取：

- `package.json`
- `public/.ganhuo/site.json`
- `dist/.ganhuo/site.json`
- `.ganhuo/site-plan.json`
- `.ganhuo/landerpilot-input.json`
- `dist/` 文件清单、大小、sha256 指纹

并写入：

```text
<站点目录>/.ganhuo/deployment-handoff.json
```

### 2. 查询线上事实并登记项目

调用云端 LanderPilot MCP：

1. `inspect_project`：按 site id / domain / project hint 查询 SaaS 和 Cloudflare 当前状态。订阅无效时停止。
2. `create_or_update_site_project`：登记或更新云端站点项目，明确 `deploySurface`（`pages` 或 `worker`）、`framework`、`locale`，拿到云端 `siteId`。

### 3. staging 构建产物

云端 MCP 不直接读用户本地文件，构建产物必须先上传：

1. `prepare_artifact_upload`：`kind` 取 `pages_dist`（Pages 静态产物）或 `worker_bundle`（Worker 包），拿到 `artifactId` 和临时 `uploadUrl`。
2. 按返回的 method（一般是 `PUT`）把 dist 压缩包上传到 `uploadUrl`。
3. `complete_artifact_upload`：校验已上传产物的指纹。

Worker 站还需要在部署前用 `provision_site_resource` 供给 D1 / R2，并用 `run_site_d1` 建表 / 迁移。

### 4. 用户确认

确认前必须把要做的事说清楚：

- 本地站点目录。
- 本地 dist 指纹和页面数量。
- 部署后访问地址：首次部署是 Cloudflare 分配的 `*.pages.dev`；只有用户提供并确认拥有自定义域名时，才写该域名。不要按站点名编一个域名。
- 目标 Cloudflare account / project / worker。
- 当前线上 deployment。
- 本次新增、修改、覆盖、回滚项。
- 失败和回滚路径。

用户没有明确确认前，不能调用 `deploy_site` / `provision_site_resource` / `run_site_d1` / `upload_site_asset` / `bind_site_domain` / `rollback_deployment`。

推荐确认句：

```text
请确认是否继续部署：
- 本地站点：<site_path>
- 本地 dist：<页面数> 页
- 线上目标：<project/worker/pages>
- 当前线上版本：<deployment_id / updatedAt；首次部署写「无，新项目」>
- 部署后访问地址：<首次部署写 Cloudflare 分配的 *.pages.dev；只有已绑定的自定义域名才写该域名>
- 本次操作：<create/update/rollback/domain>

确认后我才会执行线上操作。
```

用户没有提供自定义域名时，「部署后访问地址」就写 Cloudflare 分配的 `*.pages.dev`，**不要编一个域名**。绑定自定义域名是上线后单独的一步（`bind_site_domain`），只在用户明确给出自己拥有的域名后才做。

### 5. 执行与上线报告

确认后调用：

- `deploy_site`：把已 staging 的产物部署到 Pages / Worker。
- `get_deployment_status`：跟踪部署进度、production / preview URL、日志和失败原因。
- `bind_site_domain`：需要自定义域名时绑定。

执行前如果线上状态相比 `inspect_project` 已经变化，必须重新 `inspect_project` 并重新确认。

交付必须包含：

- production URL
- preview URL（如果有）
- deployment id
- domain / DNS 状态
- 回滚入口或 rollback id

## 新部署 vs 更新既有部署

新部署也必须确认，因为它会创建线上资源和可能产生计费 / 权限影响。

更新既有部署风险更高，必须展示线上当前状态并让用户确认“覆盖哪个资源”。如果本地配置说站点属于 A project，但线上 domain 当前指向 B project，要停止并让用户选择，不允许自动纠正。

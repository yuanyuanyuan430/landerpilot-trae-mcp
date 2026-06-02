---
name: landerpilot
description: 把用户的建站需求变成可预览、可上线的网站：landing page、独立站、营销站、affiliate review site、cashback/coupon directory、corporate/SaaS website。从生成到预览全程在干活AI 内完成。
---

# LanderPilot 建站

把用户的建站需求，变成一个**构建好、并已在干活AI 里打开预览**的 Astro 静态站点，落到用户工作区里。

## 什么时候用

用户想做：落地页、独立站、营销站、产品介绍页、活动页、个人主页这类**以内容展示为主、不需要登录 / 支付 / 订单**的静态网站。

不适用：需要后端、用户系统、数据库、实时数据的应用——那不是本技能的范围。

## 入口定位

LanderPilot 是**一个建站总工作流 skill**，不是一堆分散 skill。站点类型、模板、业务规则、页面结构、数据整理方式都内置在本 plugin 里，由这个入口统一编排。

需要更多细节时读取：

- `references/workflow.md`：站点类型选择、语言策略、数据密集型站点的数据整理方式、云端部署 MCP 边界。
- `references/user-onboarding.md`：如何引导用户选择模板、提供数据、表达风格和业务偏好。
- `references/blueprints.md`：内置蓝图和后续新增站点/模板类型的目录约定。
- `references/astro-authoring.md`：Agent 动态生成/手改页面时，如何按 Astro 的方式组织模板、数据和多语言。
- `references/frontend-design.md`：如何把用户的风格偏好落成有辨识度、可构建、适合当前站点类型的视觉方向。
- `references/local-preview.md`：Windows/macOS 本地预览进程管理细则。
- `references/deployment-safety.md`：上线、重部署、域名/DNS、Google/GA4 配置的强制确认流程。

## 关键前提：一切走干活AI 随包 runtime

- `node` / `npm` / `npx` 在干活AI 里**已经是随包的官方 Node.js**。直接用，**不要**叫用户先装 Node，也不要检查系统有没有 Node。
- 所有站点命令都必须明确作用于站点目录。优先用 `npm --prefix "<站点目录>" ...`，不要依赖当前 shell cwd 正好在站点目录。
- npm 镜像源已由干活AI 自动配置好，**不要**手动加 `--registry` 参数。
- 构建产物和依赖装在用户机器上、用户的工作区里——这是正常的，不是问题。
- Windows 和 macOS 都是一等目标：不要用 `lsof`、`pkill`、`killall`、`taskkill`、PowerShell-only 脚本或 macOS-only 假设来管理预览进程。预览进程只通过 scaffold 里的 `npm run ganhuo:preview:*` 管理。

## cwd / project 模型

干活AI 的 cwd 是**项目容器**，不等于单个网站。一个 cwd 里经常会有多个独立站点：

```text
<工作区>/
  .ganhuo/landerpilot-sites.json
  coffee-landing/
  ai-course-site/
  travel-blog/
```

- 默认每个新站点都建成 cwd 下的一个子目录，**不要**把 cwd 根目录直接当站点目录。
- 每个站点都有自己的 `package.json`、`node_modules/`、`dist/`、`.ganhuo/preview-server.json`。
- 所有 `npm install` / `npm run build` / `ganhuo:preview:*` 都必须明确指向**具体站点目录**。推荐写法是 `npm --prefix "<站点目录>" ...`；如果用 shell `workdir`，也要先确认它就是站点目录，不是 cwd 容器根目录。
- 做新站点前，用本技能脚本 `local-tools.mjs list-sites` 看 cwd 里已有站点；不可用时读取 `<工作区>/.ganhuo/landerpilot-sites.json` 或查看一层子目录。
- 不覆盖已有站点目录。名字冲突时换一个英文短横线目录名，或先问用户。

## 沟通节奏

建站里有偏慢的步骤（装依赖约 1–3 分钟、构建数十秒）。别让用户对着不动的屏幕猜：

- **每一步动手前，先用一句话告诉用户你在做什么。** 用大白话，别把 `npm install` 这种命令名甩给用户。
- **慢步骤要预先打招呼**：明确说「这一步大约 N 分钟，期间界面没动静是正常的」。
- **每步做完补一句确认。**
- 给用户的话用用户视角（「正在准备建站工具」），技术名词（命令、包名、路径）只在必要时出现。

## 建站流程

### 1. 理解目标

一两句话问清楚就够：站点是做什么的、要哪些区块（如首屏、特性、价格、联系方式）。**不要**展开成冗长的需求访谈。

同时判断：

- 站点类型：`corporate`、`affiliate-review`、`cashback`。不确定时先用 `corporate`。
- 语言：默认英文 `en`；用户明确要中文，或输入明显中文时用 `zh-CN`。
- 数据来源：用户已给数据、本地文件、或需要用浏览器/搜索整理网页数据。数据密集型站点先整理 JSON，不要直接手写大段 HTML。
- 数据门槛：
  - `corporate` 是可草拟模板。只要有站点名/业务方向，就可以用合理默认文案生成第一版，但要提醒用户后续替换价值主张、功能点、CTA 和素材。
  - `affiliate-review` 和 `cashback` 是数据型模板。必须先拿到可结构化的品牌/产品/store 数据，再生成页面；可以是用户上传 CSV/Excel/JSON/Markdown/TXT，粘贴表格/列表，或提供 URL 让你整理。不要在缺数据时生成假品牌、假返现、假测评。
  - 只有用户明确说“先用演示数据/样例数据看看”时，才在输入 JSON 里写 `demo_mode: true`。
- CLI 只用 `--type` 选择蓝图；`template` / `variant` 只写进输入 JSON 交给 producer 使用。不要把 `corporate-saas`、`cashback-directory` 这类 variant 当成 `--type`。
- 视觉方向：如果用户提到风格、审美、品牌感、改好看、落地页转化，或你需要手改模板视觉，先读 `references/frontend-design.md`，把设计方向写进输入 JSON 的 `style` / `design` / `theme.tokens`，再生成或修改页面。

如果用户只是泛泛说“帮我建站”，先给一个轻量引导，不要直接开始瞎做：

1. 让用户选模板方向：公司/产品官网、联盟测评站、返现/优惠券目录站。
2. 让用户提供最小数据：站点名、目标用户、主要产品/品牌/URL、期望语言。
3. 让用户给偏好：风格、颜色、语气、是否偏 SEO/转化/品牌展示。

优先用选择题和示例降低门槛。用户不想细填时，`corporate` 可以用合理默认值先生成第一版，再通过预览迭代；`affiliate-review` / `cashback` 仍然必须先拿到最小数据或得到用户明确的演示数据授权。

如果用户选择 `affiliate-review` 或 `cashback`，但没有给数据，不要继续建目录/生成站点。先给一个短提示，让用户选择一种输入方式：

```text
这个模板需要品牌/店铺数据才能生成。你可以直接上传 CSV/Excel/JSON/Markdown/TXT，或粘贴列表/表格，也可以发几个 URL 我来整理。

最少需要：名称 + 官方 URL 或 affiliate URL。返现站必须有 affiliate URL、cashback rate，以及 coupon_count / coupons[] / deals[] / deal_text 之一；测评站再加简介 / 优缺点 / 价格或优惠。
```

### 2. 初始化站点目录

先说一句「我先给站点建一个文件夹」。然后用本技能自带脚本在 cwd 下创建 `<站点名>/`，复制 scaffold，写初始 `public/.ganhuo/site.json`，并更新 cwd 级站点索引：

```bash
node "<本技能目录>/scripts/create-site.mjs" --workspace "<工作区>" --name "<站点名>" --title "<站点标题>"
```

站点名用英文短横线命名，如 `my-landing`。这一步很快。完成后站点目录应有 `package.json`、`astro.config.mjs`、`src/pages/index.astro` 等。后续命令都进入这个站点目录执行。

### 3. 整理输入并生成页面

先说一句「正在整理建站资料并生成页面」。`generate-site.mjs` 不依赖 `npm install`，所以先生成页面、再安装依赖和构建，流程更一致也更容易提前发现数据问题。

优先使用本 plugin 内置蓝图生成 Astro 页面，而不是临时手写全站 HTML。

注意：重跑 `generate-site.mjs` 会重新生成并覆盖 `src/pages/` 下的页面。用户要换蓝图或整体重生时先说明这一点；手动改页面应放在生成之后做。

数据型蓝图的生成器会校验输入：`affiliate-review` / `cashback` 缺少 `offers[]` 或可解析 `raw_text` 时会失败。遇到这个错误时，不要绕过；回到用户引导，让用户上传/粘贴数据，或把已上传文件整理成 `offers[]` 后再运行。只有用户明确要求演示数据时，才设置 `demo_mode: true`。

1. 在站点目录写入结构化输入，例如 `<站点目录>/.ganhuo/landerpilot-input.json`：
   ```json
   {
     "type": "affiliate-review",
     "site_name": "Best Tech Offers",
     "domain": "besttechoffers.com",
     "language": "en",
     "goal": "seo-and-affiliate-conversion",
     "style": "editorial comparison, clear CTAs",
     "design": {
       "direction": "editorial comparison",
       "tone": "trustworthy, sharp, conversion-focused"
     },
     "template": "affiliate-review",
     "theme": {
       "name": "ocean",
       "tokens": {
         "accent": "#2563eb",
         "accentEnd": "#0ea5e9"
       }
     },
     "raw_text": "Sony WH-1000XM5 official https://electronics.sony.com affiliate https://example.go/sony-xm5\nCategory: Headphones"
   }
   ```
   > `domain` 只在用户明确给出**自己拥有的域名**时才写；用户没给就**不要写这个字段**，更不要按 `site_name` 编一个。它只是 SEO / canonical 元数据，站点构建和首次部署都不需要。自定义域名是上线后单独绑定的一步。
2. 调用内置生成器：
   ```bash
   node "<本技能目录>/scripts/generate-site.mjs" --site "<站点目录>" --type "<corporate|affiliate-review|cashback>" --data "<站点目录>/.ganhuo/landerpilot-input.json"
   ```
3. 生成器会按蓝图写 `src/pages/` 下的 `.astro` 文件，多页站会自动生成嵌套路由，例如 `reviews/<brand>/index.astro`、`stores/<store>/index.astro`。

只有在内置蓝图确实无法覆盖用户需求时，才手动改 `.astro`。手动改也要保持 Astro SSG、静态、可构建。

Astro 页面速记：

- 顶部 `---` 之间是 frontmatter（构建期运行的 JS，准备数据），不进浏览器。
- 中间是 HTML 模板，用 `{变量}` 引用 frontmatter 里的数据。
- 列表、卡片、FAQ、价格表、分类页这些动态内容，优先在 frontmatter 里组织数组/对象，然后用 Astro 模板 `{items.map(...)}` 渲染；不要把整页当字符串拼接。
- 底部 `<style>` 是页面样式，构建时打包进静态产物。
- 默认零 JS。除非用户明确要交互，否则不加客户端脚本、不加框架组件。
- 外部资源（图片、字体）尽量随站点放进 `public/` 目录，别引用会被 CSP 拦的外链 CDN。
- 多语言页面必须按 Astro 页面数据/路由处理：设置 `lang`、把文案放进语言字典或内容对象，按 locale 生成页面；不要指望 plugin 能控制所有 Agent 临时生成的句子。
- 视觉改动要服从站点业务：公司官网重信任和转化，affiliate 重阅读和对比，cashback 重扫描效率和信息密度。不要把通用炫技样式套给所有模板。

### 4. 安装依赖

先说一句，例如：「正在准备建站需要的工具，大约 1–3 分钟，期间界面没动静是正常的。」

然后明确指向**站点目录**安装：

```bash
npm --prefix "<站点目录>" install --no-audit --no-fund --prefer-offline --progress=false
```

装完说一句「环境准备好了」。如果报错，多半是网络波动——把错误大意告诉用户，问要不要重试（重试就是再跑一遍同样的命令）。不要假装成功。

### 5. 构建

先说一句「正在把站点构建成网页，几十秒」。然后明确指向**站点目录**：

```bash
npm --prefix "<站点目录>" run build
```

产物在 `<站点目录>/dist/`，是纯 HTML/CSS。

### 6. 更新站点 manifest

初始化脚本已经写了 `<站点目录>/public/.ganhuo/site.json`。如果你新增/删除页面，要同步更新 `pages`。它放在 `public/` 下，Astro 每次构建会自动把它拷进 `dist/`：

```json
{
  "kind": "static-site",
  "title": "站点标题",
  "entry": "index.html",
  "pages": ["index.html"],
  "framework": "astro"
}
```

`pages` 列出所有构建出的页面（`src/pages/about.astro` → `about.html`）。改完 manifest 后**重新跑一次 `npm --prefix "<站点目录>" run build`**，让它进入 `dist/`。

manifest 里的 `deployment` 只描述本地站点可如何交接给云端部署；它不是线上事实。只要用户要求部署、更新线上站点、绑定域名、改 DNS、改 Google Search Console/GA4，就必须先读 `references/deployment-safety.md`。

### 6.5. 部署交接与线上安全

如果用户要求“上线 / 部署 / 重新部署 / 更新线上 / 绑定域名”，不要直接调用云端写操作。

云端部署能力由本 LanderPilot plugin 内置的云端 MCP 提供（streamable HTTP），需要用户在插件连接里填写 LanderPilot API 密钥。必须按这个顺序：

1. 本地先构建成功：`npm --prefix "<站点目录>" run build`。
2. 用 `local-tools.mjs inspect-site` 确认当前站点、页面、dist 和 manifest。
3. 用 `local-tools.mjs prepare-deployment-handoff` 生成 `<站点目录>/.ganhuo/deployment-handoff.json`，拿到 dist 指纹、文件数和大小。
4. 用云端 MCP 的 `inspect_project` 查询线上当前状态。不能只信本地 `.ganhuo`，也不能凭记忆说“这个站点部署在某个 Worker 上”。
5. 用 `create_or_update_site_project` 登记/更新云端站点项目，明确 deploySurface（`pages` 或 `worker`）、framework、locale。
6. 用 `prepare_artifact_upload` 取得上传地址，把 dist 压缩包 PUT 上去后用 `complete_artifact_upload` 校验指纹。
7. 把这次要做的线上操作（部署到哪个 project、覆盖哪个 deployment）讲清楚发给用户确认。首次部署到 Pages 只会拿到 Cloudflare 分配的 `*.pages.dev` 地址，确认文案里写这个地址，**不要凭站点名编一个自定义域名**。用户没有明确确认前，不允许调用 `deploy_site` / `provision_site_resource` / `run_site_d1` / `bind_site_domain` / `rollback_deployment`。
8. 确认后调用 `deploy_site`，再用 `get_deployment_status` 跟踪结果。只有用户明确给出**自己拥有、且能在自己 Cloudflare 账号里管理**的域名、并确认要绑定时，才调用 `bind_site_domain`；用户没有域名就不绑，站点用 `*.pages.dev` 地址也能正常访问。Worker 站在 deploy 前先用 `provision_site_resource` 供给 D1/R2，并用 `run_site_d1` 建表。

新部署也要确认，因为会创建 Cloudflare / SaaS 资源。更新既有 Pages/Worker、已有 domain、已有 DNS 风险更高，确认文案必须点名线上 project、domain、deployment id 和回滚方案。

如果目标不唯一、线上状态缺失、订阅无效，立即停止并说明原因，不要绕过确认流程。

### 7. 启动预览 —— 让用户在干活AI 里看到站点

站点构建好后，启动本地预览服务，让用户直接看到。**预览是长驻进程，必须受管，不能直接跑 `astro preview`、`npm run preview` 或 `npm run dev`。**

1. 先说一句「正在打开预览」。
2. 明确指向**这个站点目录**启动受管静态预览：
   ```bash
   npm --prefix "<站点目录>" run ganhuo:preview:start
   ```
   这个命令会用当前随包 Node 确保本地静态预览服务运行：同一站点已有健康预览时复用原 pid/端口；没有时启动一个受管预览，并优先复用该站点的端口租约，写入 `.ganhuo/preview-server.json`。
3. 从命令输出里读取 `LanderPilot preview ready: http://127.0.0.1:<端口>/`。端口必须以输出为准，不要猜。
4. 把这个 URL 以 Markdown 链接发给用户，并**显式提示用户点击**。固定话术：
   ```text
   站点预览已经启动。请点击下面这个本地预览链接打开：
   [打开预览](http://127.0.0.1:<端口>/)
   ```
   干活AI 会在用户点击本地 URL 时打开预览面板。不要只贴裸 URL，也不要只说「已打开预览」。
5. 立刻检查一次：
   ```bash
   npm --prefix "<站点目录>" run ganhuo:preview:status
   ```
   如果显示 `unreachable`、`unhealthy` 或 `stopped`，先跑 `npm --prefix "<站点目录>" run ganhuo:preview:doctor` 看 Node 路径、平台、dist 和日志，再用 `npm --prefix "<站点目录>" run ganhuo:preview:restart` 重启一次；仍失败就把 `.ganhuo/preview-server.log` 的最后几行告诉用户。

🚨 **绝不允许**直接跑 `npm run dev`、`npm run preview`、`astro dev`、`npx astro dev`、`astro preview`、`npm run preview -- --host ...`，也不允许用系统命令手工 kill。启动、状态检查、重启、停止都走 `ganhuo:preview:*`。

### 8. 交付

告诉用户：站点已构建在 `<站点目录>/dist/`，并再次明确「请点击本地预览链接打开」。说明当前只保留**一个受管本地预览进程**；如果用户暂时不看了，可以让你停止。

## 调整循环

用户要改：

1. 先说一句「正在修改」。
2. 改对应 `.astro`。
3. 重新 `npm --prefix "<站点目录>" run build`（先打招呼）。
4. 跑 `npm --prefix "<站点目录>" run ganhuo:preview:status` 看预览还活着。
5. 交付前也跑一次 `local-tools.mjs list-sites` / `inspect-site`，确认当前 cwd 里没有误操作到其他站点；每个站点只保留自己的一个受管预览。
6. 如果还在运行，告诉用户「改好了，刷新一下预览即可」；如果停了，跑 `npm --prefix "<站点目录>" run ganhuo:preview:start`，再给预览 URL。只有 status/doctor 显示现有预览异常时才用 `restart`。

不要再起第二个预览服务。`ganhuo:preview:start` 是幂等 ensure 语义，会复用健康预览；你仍然要养成先 `status` 的习惯。

## 本地脚本与部署边界

本地辅助和部署交接都走本技能目录下的脚本，不再暴露本地 MCP。脚本统一输出 JSON，便于 Agent 读取、测试和维护。`<本技能目录>` 指本文件所在目录。

### 本地脚本命令

列出工作区站点：

```bash
node "<本技能目录>/scripts/local-tools.mjs" list-sites --workspace "<工作区>"
```

默认会读取 `<工作区>/.ganhuo/landerpilot-sites.json` 并扫描工作区下一层目录。只读，不安装依赖、不构建、不启动预览。需要只读索引、不扫描时加 `--no-scan`。

检查单个站点：

```bash
node "<本技能目录>/scripts/local-tools.mjs" inspect-site --workspace "<工作区>" --site "<站点目录或相对路径>"
```

输出包含 package.json 摘要、Astro 页面列表、public/dist manifest、dist/index.html 是否存在、`.ganhuo/preview-server.json` 预览状态、已有 handoff。只读，不启动/停止任何进程。

列出内置蓝图/模板槽位：

```bash
node "<本技能目录>/scripts/local-tools.mjs" list-template-slots
```

输出 `corporate`、`affiliate-review`、`cashback` 等蓝图能力，以及云端 MCP 的部署工具名。只读。

准备部署交接包：

```bash
node "<本技能目录>/scripts/local-tools.mjs" prepare-deployment-handoff \
  --workspace "<工作区>" \
  --site "<站点目录或相对路径>" \
  --operation "<new_deploy|update_existing|rollback|unknown>" \
  --domain "<用户明确提供的域名，可省略>" \
  --remote-project-hint "<用户提到的线上项目名，可省略>"
```

这个命令读取 `package.json`、`public/.ganhuo/site.json`、`dist/.ganhuo/site.json`、`.ganhuo/site-plan.json`、`.ganhuo/landerpilot-input.json` 和 `dist/` 文件清单，计算 dist 指纹，并写入 `<站点目录>/.ganhuo/deployment-handoff.json`。它不访问云端、不部署。只想预览 JSON 不写文件时加 `--no-write`。

Cloudflare 部署等外部账号操作由本 LanderPilot plugin 的云端 MCP 提供，需要用户填写 LanderPilot API 密钥；这是 LanderPilot SaaS 发给 Agent 的密钥，不是 Cloudflare token。云端工具列表在连接时通过 streamable HTTP 实时下发，不在本地固化。云端写操作必须走 `inspect_project -> create_or_update_site_project -> 产物 staging -> 用户确认 -> deploy_site -> get_deployment_status`，不能假装完成，也不能跳过确认。

## 预览进程管理

预览服务最容易在小白用户机器上制造问题，尤其是 Windows。严格按这个生命周期处理：

- **每个站点最多一个预览进程**：`ganhuo:preview:start` 会复用同一站点健康预览；只有 `restart` 才会替换当前受管 pid。这个进程是 scaffold 自带的 Node 静态预览服务，不是 `astro dev` / `astro preview` 子进程树。
- **预览会自我回收**：受管预览有空闲超时和最长存活时间，避免会话中断后长期留在小白用户机器上；需要继续看时重新 `ganhuo:preview:start` 即可。
- **周期性看状态**：启动后、每次 build 后、交付前，都跑 `npm --prefix "<站点目录>" run ganhuo:preview:status`。
- **切换站点或不再预览时停止**：如果用户让你做另一个站点，或明确说不用看预览了，先对旧站点跑 `npm --prefix "<旧站点目录>" run ganhuo:preview:stop`。
- **不要手工 kill**：Windows/macOS 进程管理差异大，不用 `pkill` / `lsof` / `taskkill`。scaffold 的 Node 管理器会处理 pid。
- **不要把问题甩给用户**：如果状态异常，先跑 `npm --prefix "<站点目录>" run ganhuo:preview:doctor`，再读 `.ganhuo/preview-server.log` 最后几行，重启一次；还失败再说明原因。

## 铁律

- **慢步骤先打招呼**：装依赖、构建之前都先跟用户说一句。
- **cwd 可以有多个站点**：永远明确当前操作的是哪个站点目录，不要把项目根目录当唯一站点。
- **预览必须受管**：只用 `npm --prefix "<站点目录>" run ganhuo:preview:start/status/doctor/restart/stop`。
- **给 URL 必须同回合完成且提示点击**：读到端口后必须写「请点击下面这个本地预览链接打开：」并给出 `[打开预览](http://127.0.0.1:<端口>/)`，不许只贴 URL，不许说「稍后」「等一下」就结束回合。
- **不编造域名**：用户没给域名就不写 `domain`，不按站点名 / 品牌名臆造。首次部署到 Pages 默认只有 Cloudflare 分配的 `*.pages.dev` 地址；自定义域名只能来自用户明确提供、且用户确认自己拥有，再单独 `bind_site_domain`。
- 不叫用户装 Node / npm，不检查系统环境——随包 runtime 已经齐了。
- 不 `npm install -g`，不装全局包；依赖只装在站点目录内。
- 不跑交互式命令。
- **不起 `astro dev` / `npm run dev` / `npm run preview`**（HMR 或非受管预览，本期不做）。scaffold 已把 `npm run dev` 和 `npm run preview` 改成拒绝命令，防止误起孤儿 dev server。
- 只用 Astro 默认能力做静态站（SSG）。不加 SSR adapter，不加重型依赖；`package.json` 里的依赖保持精简。
- 卡住或失败要如实说，给「重试」这种可操作的下一步，不要假装成功。

## 本期不做（用户问到再说明）

- **热更新预览（HMR）**：边改边自动刷新，规划中。本期是「改完重新构建、刷新预览」。
- **Cloudflare 部署**：已可用，但走本 LanderPilot plugin 的云端 MCP（需要用户填 LanderPilot API 密钥）；本地脚本只准备 handoff，不直接部署。
- **SEO / 数据观察**：规划中，后续按需补；不在本地建站插件范围内。

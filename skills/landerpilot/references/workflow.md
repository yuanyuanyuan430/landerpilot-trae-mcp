# LanderPilot 工作流框架

LanderPilot 只有一个 skill 入口。站点类型、模板、业务规则、页面结构、数据整理方式都放在内置 plugin 里，由这个入口统一编排。

## 总流程

1. 识别用户目标：站点业务类型、目标语言、已有数据、缺的数据。
2. 选择内置蓝图：`corporate`、`affiliate-review`、`cashback`。不确定时用 `corporate` 先跑通。
3. 做数据门槛判断：`corporate` 可草拟；`affiliate-review` / `cashback` 必须先拿到品牌/产品/store 数据，或得到用户明确的演示数据授权。
4. 创建站点目录：cwd 是项目容器，新站必须在 cwd 下建子目录。
5. 整理结构化输入：在站点目录生成 `.ganhuo/landerpilot-input.json`，字段尽量稳定；视觉偏好写入 `style`、`design`、`theme.tokens`。
6. 调用内置生成器：`generate-site.mjs` 把数据渲染成 Astro pages。它不依赖 `npm install`，所以在安装依赖前运行。
7. 安装依赖、构建、受管预览：所有 npm 命令优先写成 `npm --prefix "<站点目录>" ...`，且只用 `ganhuo:preview:*` 管理预览。
8. 如果用户要求上线或更新线上站点，先生成部署交接包，再由云端 MCP 查询线上状态、生成 diff、让用户确认。
9. 迭代：用户反馈后修改输入数据或页面，重新生成/构建/检查预览。

重跑生成器会覆盖 `src/pages/` 下的页面，并同步更新 cwd 级 `.ganhuo/landerpilot-sites.json` 的 template/variant。手动页面改动应放在生成之后做。

## Astro 使用边界

当前内置蓝图先把已有模板库迁移成可构建的 Astro pages，这是为了快速跑通业务模板。后续新增模板和 Agent 动态页面要尽量 Astro-first：

- 页面输出仍是 `.astro`，由 Astro 负责 SSG、路由和构建。
- 数据放 frontmatter、JSON 或内容对象，模板用 Astro 表达式渲染。
- 重复区块沉淀成 layout/component，不把所有模板逻辑写进 skill 文档。
- 不引入 SSR、重型客户端框架或复杂编译链，除非某个蓝图明确需要。
- 遇到不确定的 Astro API，不凭记忆写；按 `astro-authoring.md` 查官方 docs 或 Context7，只采用当前任务需要的最小能力。

## 设计能力边界

LanderPilot 可以内置设计判断，但仍由主 skill 编排，不拆成另一个 skill。需要视觉方向、模板审美、手改页面或用户要求“更好看”时读取 `frontend-design.md`。

- 设计方向必须写进 `.ganhuo/landerpilot-input.json`，方便重生成和换模板时复用。
- 当前只使用 CSS 变量、Astro scoped style 和模板 CSS，不默认引入 Tailwind、React/Vue 或动效库。
- 设计服务业务：数据密集站点优先扫描效率，官网/落地页优先信任和转化。
- 生成第一版后通过本地预览迭代，不在需求阶段把用户拖进复杂视觉访谈。

## 语言策略

- 默认英文站点：大多数站点面向英文内容、英文 SEO。
- 用户明确要求中文，或输入明显中文时，用 `language: "zh-CN"`。
- 用户明确要求英文时，用 `language: "en"`。
- 现在不默认生成多语言站。多语言以后通过 `locales[]` 扩展。
- 内置蓝图 UI 文案统一放在各蓝图的 `i18n/en.json`、`i18n/zh-CN.json`，producer 通过 `loadBlueprintI18n()` 注入 `t`，模板用 `{{t.nav.home}}` 这类 dot path 读取；业务数据仍保留在 `site` / `offers` / `features` 等结构里。
- 内置蓝图只能控制自己生成的模板文案；Agent 动态生成/手改页面时，必须按 `astro-authoring.md` 把语言写进 Astro 数据、路由、meta 和 schema。不要依赖全局文本替换。

## 数据密集型站点

数据密集型站点不要让 AI 直接编完整 HTML。先把数据整理成 JSON，再交给蓝图模板渲染。

`affiliate-review` 和 `cashback` 都属于数据密集型站点。没有 `offers[]` 或可解析 `raw_text` 时，不要调用生成器；生成器也会 fail-fast，避免缺数据时生成假品牌、假 store、假返现和假测评。只有用户明确要求“先用演示/样例数据看看”时，才设置 `demo_mode: true`。

常见数据来源：

- 用户直接贴的品牌、offer、商品、店铺、分类、URL。
- 用户让你从网页收集的数据：优先用可用浏览器能力打开网页、提取标题、正文、价格、品牌、FAQ、分类、图片 URL，再整理成 JSON。
- 用户本地文件：CSV、JSON、Markdown、Excel 等先结构化，不要把原始长文本硬塞模板。

最小输入示例：

```json
{
  "type": "affiliate-review",
  "site_name": "Best Tech Offers",
  "domain": "besttechoffers.com",
  "language": "en",
  "goal": "seo-and-affiliate-conversion",
  "style": "editorial comparison, clear CTAs",
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

上面的例子里有 `domain`，是因为这个场景下用户确实拥有 `besttechoffers.com`。`domain` 只是 SEO / canonical 元数据：用户没明确给出自己拥有的域名时，就**不要写 `domain` 字段**，更不要按 `site_name` 臆造一个。自定义域名是上线后单独 `bind_site_domain` 的一步，首次部署到 Pages 只会拿到 `*.pages.dev` 地址。

## 内置蓝图

`corporate`

- 公司官网、SaaS 产品页、服务商介绍页。
- 默认输出首页。
- 模板变体：`corporate-saas`、`corporate-minimal`。

`affiliate-review`

- 联盟 offer、品牌测评、产品推荐。
- 输出首页 Hub + `/reviews/<brand>/` 单品测评页。

`cashback`

- 返现/优惠券目录站。
- 输出首页 + `/stores/<store>/` + `/categories/<category>/`。

## 部署与云端 MCP

Cloudflare 部署挂在 LanderPilot plugin 内置的云端 MCP 下；本地事实固定走 Skill 脚本，不再走本地 MCP：

- 本地 Skill 脚本负责生成、构建、预览、`local-tools.mjs prepare-deployment-handoff`。
- 云端 LanderPilot MCP 负责查询线上事实、staging 构建产物、供给 Cloudflare 资源，并在用户确认后部署。

云端 MCP 走 streamable HTTP，需要用户在 LanderPilot plugin 里填写 LanderPilot API 密钥；工具列表在连接时实时下发，本地不固化清单。任何线上写操作前都必须用 `inspect_project` 重新查询线上状态。不能只凭 `.ganhuo` 文件、用户一句“还是上次那个 Worker”、或 Agent 历史记忆决定目标。

强制流程（Pages 静态站）：

1. `npm --prefix "<站点目录>" run build`
2. `node "<本技能目录>/scripts/local-tools.mjs" inspect-site --workspace "<工作区>" --site "<站点目录或相对路径>"`
3. `node "<本技能目录>/scripts/local-tools.mjs" prepare-deployment-handoff --workspace "<工作区>" --site "<站点目录或相对路径>" --operation "<new_deploy|update_existing|rollback|unknown>"`
4. 云端 MCP `inspect_project`
5. 云端 MCP `create_or_update_site_project`（`deploySurface: "pages"`）
6. 云端 MCP `prepare_artifact_upload` → PUT 产物到 uploadUrl → `complete_artifact_upload`
7. 用户确认
8. 云端 MCP `deploy_site`
9. 云端 MCP `get_deployment_status`
10. 仅当用户提供了**自己拥有的**自定义域名、且确认要绑定时，才 `bind_site_domain`；否则站点就用 Cloudflare 分配的 `*.pages.dev` 地址，不要编域名

Worker 站在第 6 步之前先用 `provision_site_resource` 供给 D1/R2，并用 `run_site_d1` 建表。

新建资源也要确认；更新已有 Pages/Worker、已有 domain、已有 DNS 必须展示当前线上 deployment / domain / project / rollback 信息后再确认。目标不唯一时停止，不猜。

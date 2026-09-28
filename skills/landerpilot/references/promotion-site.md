# LanderPilot 推广站与 PartnerWhiz 自动化引导规范

本文档为 `skills/landerpilot/references/promotion-site.md` 参考规范，指导 Agent 引导用户完成 LanderPilot 推广站建站、部署与 PartnerWhiz (PW) 验证。核心原则：只切换 LanderPilot 账号，不改动 Cloudflare 账号；每次只向用户提一个当前阻塞的问题；严禁凭据进对话。

## 1. 只读资产探测与身份确认
先检查当前客户端可调用工具及其 schema；下列云端接口必须以实际工具列表为准，工具缺失时按文中的降级路径处理。
1. **身份与订阅检查**：调用 `get_account_status`，核对 `account{id, email}` 与 `plan`。若未就绪，调出客户端内置安全卡（`persistValue: false`）让用户输入 API Key；若非 Pro 账号，准确说明云端能力受限并暂停。
2. **已有资产盘点**：调用 `inspect_project`（不传 `localSiteId` 参数），读取已有 `projects` 列表及保存的 Cloudflare 连接配置。
3. **Cloudflare 实时 Zones 查询**：调用 `list_domains` 真实请求 Cloudflare。注意：能读取 Zones 不证明具备 DNS 写或 Pages 写权限，具体权限以各后续操作返回为准；若列表为空不等于授权不足，若报错如实反馈，不主观杜撰原因。
4. **账号切换（Switch Account）**：若用户要求换号或账号错误，新版客户端调用 `landerpilot_connection_status` 的 `action: "switch_account"`（先确认当前 schema 支持）；旧版客户端引导至「设置 -> MCP 扩展 -> LanderPilot」安全替换 Key。换号后必须重新读取当前资产，严禁复用上一账号的项目 ID 与域名缓存。当前插件不管理凭据，无独立 profile。

## 2. 选择已有网站或新建，再决定域名
1. **已有网站优先展示**：列出 `inspect_project.projects` 中全部站点及其现有域名、部署面和状态，包含没有自定义域名的 Pages 站点。用户已给出的明确站点可以直接匹配；存在多个候选时只问“复用哪个网站，还是新建？”，不要因为 Cloudflare zone 未与站点域名完全相等就自动新建。选定后用 `inspect_project(localSiteId)` 读回部署和真实 URL。
2. **域名选择**：随后展示 `list_domains` 的候选域名。已有站点默认保留域名；绑定子域名时核对它属于所选 zone。无自定义域名可保留或使用 Cloudflare 分配的实际 `*.pages.dev` 地址，不猜域名、不采购、不把仍在使用的域名指向新项目。
3. **保护已有站点**：已有 Pages 仅添加验证标签时，直接使用 set/check，不重新注册、不改 framework/deploySurface。已有 Worker 不支持本次自动标签安装，应说明限制并使用其原有源码/部署方式处理；不能将它改成 Pages。明确要新建时，才进入下方生成及注册流程。账号、域名或目标改变后重新读取当前证据。

## 3. 本地推广站生成（create-promotion-site.mjs）
脚本位于：`node <plugin>/skills/landerpilot/scripts/create-promotion-site.mjs`
参数格式：`--workspace <dir> --name <slug> --language zh-CN|en [--no-build] (--without-verification | --verification-file <path> | --data <json>)`
通过 `landerpilot_pw` 的 `operation: "create"` 创建时，工具刻意只生成源码，返回 `sitePath`、`built: false` 和 `published: false`。若没有验证码，省略 `verification` 即为先建站路径。拿到 `sitePath` 后不要再次创建站点：对该目录执行 `npm --prefix "<sitePath>" ci --no-audit --no-fund` 和 `npm --prefix "<sitePath>" run build`，然后用 `local-tools.mjs inspect-site` 与 `prepare-deployment-handoff` 重新生成构建后的交接文件。取消时会等待当前短源码生成步骤收尾，不继续构建或发布；已生成文件保留，恢复时先检查已有站点再继续，避免重复创建。旧的 `build.ready: false` 交接不能用于上传。继续完成后续云端步骤，不以源码生成成功结束任务。

1. **蓝图内容**：生成通用选购指南页面结构，包含 4 个实际页面：`index`（导航概览）、`guide`（指南要点）、`about`（关于说明）、`disclosure`（推广声明）。本蓝图为通用模板，不包含实际测评背书、虚假品牌合作、虚假评价或虚假流量数据。
2. **构建与离线校验**：默认创建目录、生成源码、执行 `npm ci` 和 `npm run build`。若携带验证代码，静态校验 `dist/index.html` 的 `<head>` 是否存在 `<meta name="partnerwhiz-verify" content="pw_...">`，再执行 `prepare-deployment-handoff` 离线固化。
3. **无验证码建站分支**：若用户尚未在 PW 申请到代码，使用 `--without-verification` 先行生成无验证标签站并发布，获取线上真实 URL 后，再引导用户前往 PW 申请代码。

## 4. 云端部署与验证注入工具链
Agent 串联现有 Cloud MCP 工具链完成上线，无分卷合并与事务原子性假设：
1. **项目注册与更新**：调用 `create_or_update_site_project`。模板 type `promotion` 仅存在于本地脚本，服务端 `templateType` 枚举仅支持 `corporate` / `affiliate-review` / `cashback`；注册时可省略 `templateType`，声明 `framework: "astro"` 与 `deploySurface: "pages"`。若已取得真实验证代码，将规范 token（不是整段 HTML）作为 `manifest.partnerWhizVerificationToken` 连同现有 manifest 一起提交，便于之后检测及重部署保留；尚无代码时省略该字段。
2. **物料上传与发布**：调用 `prepare_artifact_upload` 获取上传地址 -> 通过 HTTP PUT 将构建 ZIP 上传 -> 调用 `complete_artifact_upload` 确认物料 -> 调用 `deploy_site` 触发构建 -> 轮询 `get_deployment_status` 直至 `status = "deployed"`（不是 ready）。
3. **域名绑定**：若使用自定义域名，调用 `bind_site_domain` 提交绑定 -> 轮询 `get_domain_status` 确认状态。
4. **已有站点注入验证代码**：
   - 若线上已有站点（包括刚建好才拿到代码的站点）：调用服务端新工具 `set_site_verification(localSiteId, verification)` 直接写入 Head 并触发重发；调用 `check_site_verification` 检查固定 `pages.dev` 首页回执。
   - 若服务端尚未部署该工具：通过本地源码重新改造构建发布；若源码不可用，如实向用户说明，不调用不存在的后端 API。
5. **授权确认**：新站首次发布已获明确授权时不重复询问相同授权，仍遵守客户端实际权限提示。覆盖旧站、改写 DNS 记录或产生额外费用若尚未获授权，应先列出具体影响再确认。

## 5. PartnerWhiz 页面回执核验
1. **Token 真实性**：`<meta name="partnerwhiz-verify" content="pw_...">` 的具体 token 必须 100% 由用户从已登录的 PW 页面获取，严禁伪造临时 token。
2. **状态与属性界定**：公网检测到 meta 标签仅代表站点代码部署可见，不代表 PW 所有权审核通过或具备推广资格。
3. **浏览器核验与暂停**：使用获授权的受管浏览器打开 PW 申请页。用户完成登录与人机验证后，填入与申请一致的站点 URL，操作「开始验证」。最终验证结果以浏览器页面读回的成功回执为准。
4. **异常排查**：若未检测到代码，发起真实 HTML 检查核对 `<head>` 内容与重定向情况，不臆测缓存原因，不强制清除缓存。若无浏览器或 PW 未登录，准确暂停引导并给出手动操作步骤，不收集密码，不伪造内部 API。

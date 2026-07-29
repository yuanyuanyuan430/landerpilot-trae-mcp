# 用户引导

LanderPilot 面向小白用户，启动阶段要给清晰选择，不要把用户拖进长需求访谈。目标是快速拿到足够数据，先生成可预览第一版，再迭代。

## 触发场景

用户只说：

- “帮我建个站”
- “做个落地页”
- “帮我做独立站”
- “把这些资料做成网站”
- “做一个英文 affiliate 站”

这时先引导，不要直接生成。

## 默认引导话术

```text
我先帮你定一下建站方向。你选一个最接近的：

1. 公司/产品官网：适合 SaaS、服务商、品牌介绍、获客落地页
2. 联盟测评站：适合产品推荐、品牌对比、affiliate offer
3. 返现/优惠券目录站：适合 store、coupon、cashback、分类页

你也可以直接上传或粘贴资料。官网类我只需要站点名、目标用户、产品/服务和风格；测评站/返现站还需要品牌、产品或店铺数据，可以是 CSV/Excel/JSON/Markdown/TXT、表格、列表或 URL。
```

用户已经明确类型时，不再重复问类型，只补最关键缺口。

## 数据门槛

先判断模板是否依赖真实数据：

- `corporate`：可草拟。缺少非关键字段时可以先用默认文案生成第一版，但要在交付时提醒用户替换价值主张、功能点、CTA、图片和法律文本。
- `affiliate-review`：数据必需。没有品牌/产品列表、官方 URL 或 affiliate URL 时，不生成测评站。
- `cashback`：数据必需。没有 store/brand 列表、affiliate URL、cashback rate，以及 coupon_count / coupons[] / deals[] / deal_text 之一时，不生成返现/优惠券目录站。

`affiliate-review` / `cashback` 缺数据时，优先让用户选择一种输入方式：

```text
这个模板需要先有数据。你可以：
1. 上传 CSV / Excel / JSON / Markdown / TXT
2. 直接粘贴品牌、产品、店铺或优惠列表
3. 发几个 URL，我先整理成建站数据

最少需要：名称 + 官方 URL 或 affiliate URL；返现站还必须有 affiliate URL、cashback rate，以及 coupon_count / coupons[] / deals[] / deal_text 之一。
```

如果用户说“先用演示数据看看”，可以继续，但必须在 `.ganhuo/landerpilot-input.json` 写 `demo_mode: true`，并在交付时明确这是样例内容，不能直接发布。

## 最小数据

所有站点都尽量收集：

- `site_name`：站点名或品牌名
- `language`：默认 `en`，用户明确中文时 `zh-CN`
- `domain`：可选，只是 SEO / canonical 用的元数据，**不是部署目标**。只有用户明确给出**自己已经拥有的域名**时才填；用户没给就**留空、不写这个字段**，绝不要根据站点名 / 品牌名编一个。站点构建和首次部署都不需要它
- `audience`：目标用户
- `goal`：主要目标，例如获客、SEO、转化、品牌展示、导流
- `style`：视觉/语气偏好，例如专业、极简、高转化、科技感、杂志感
- `type`：蓝图选择，只能是 `corporate`、`affiliate-review`、`cashback`
- `template` / `variant`：蓝图内部变体，例如 `corporate-saas`、`corporate-minimal`
- `design.direction`：视觉方向，例如品牌型、内容型、目录型、转化型
- `design.density`：信息密度，默认按蓝图选择
- `theme.tokens`：颜色偏好，例如 `accent`、`accentEnd`

缺失时可先默认：

- 语言：英文
- 风格：专业、清晰、偏转化
- 页面：先生成首页和当前蓝图需要的核心页面
- 图片：先用本地占位图或模板自带视觉，不要求用户马上提供

## 各蓝图数据清单

`corporate`

- 公司/产品名
- 一句话价值主张
- 3-6 个功能/服务点
- CTA：预约演示、联系我们、注册、购买
- 可选：价格、客户案例、Logo、截图、品牌色

`affiliate-review`

- 品牌/产品列表
- 官方 URL 和 affiliate URL
- 分类
- 每个品牌的简介、优缺点、价格/优惠
- 可选：评分、FAQ、图片、目标关键词

`cashback`

- store/brand 列表
- affiliate URL，推荐同时提供 store URL
- 分类
- cashback rate / coupon count / deal text
- 可选：logo、热门分类、联盟披露、条款说明、更新时间、SEO 关键词

## 数据密集型引导

如果用户说“帮我从网页整理”“我只有链接”“去浏览器里看一下”，先说明会整理数据，再生成站点：

```text
我会先从你给的链接/页面整理品牌、分类、价格、FAQ、图片和 CTA 数据，形成本地 JSON，再用模板生成站点。这样后面改数据和换模板会更稳。
```

然后使用可用浏览器/网页能力提取数据。提取后先落到 `.ganhuo/landerpilot-input.json`，不要直接把网页内容硬写进 HTML。

## 偏好引导

不要问泛泛的“你喜欢什么风格”。给可选方向：

- 转化型：CTA 明显、卖点强、适合投放/获客
- SEO 内容型：结构清晰、标题层级完整、适合收录
- 品牌型：视觉更克制、强调信任和专业感
- 目录型：信息密度高、适合大量品牌/店铺/分类

颜色偏好只问一次：

```text
颜色你可以给品牌色；没有的话我先用专业蓝/黑白灰生成第一版。
```

偏好必须落到 `.ganhuo/landerpilot-input.json`，不要只停留在对话里。推荐字段：

```json
{
  "goal": "lead-generation",
  "style": "professional, concise, high-conversion",
  "design": {
    "direction": "brand + conversion",
    "tone": "professional, trustworthy",
    "density": "medium"
  },
  "template": "corporate-saas",
  "theme": {
    "name": "ocean",
    "tokens": {
      "accent": "#2563eb",
      "accentEnd": "#0ea5e9"
    }
  }
}
```

蓝图选择映射：

- 公司/产品官网 -> CLI `--type corporate`，输入 JSON 里 SaaS/科技产品优先 `template: "corporate-saas"`，极简介绍页用 `template: "corporate-minimal"`。
- 联盟测评站 -> `type: "affiliate-review"`。
- YeahPromos/YP 审核站 -> `type: "affiliate-review"` 且 `variant: "affiliate-review-yp"`。
- 返现/优惠券目录站 -> `type: "cashback"`。

视觉方向映射：

- 公司/产品官网 -> `design.direction: "brand + conversion"`。
- 联盟测评站 -> `design.direction: "editorial comparison"`。
- 返现/优惠券目录站 -> `design.direction: "dense directory"`。

## 不要过度提问

最多一次问 3 个问题。更复杂的信息可以让用户直接贴资料：

```text
你先发我资料也可以，我会自己整理成建站数据。
```

如果用户没有回答完整，不要卡住在细枝末节。`corporate` 可以先默认生成；`affiliate-review` / `cashback` 只能默认风格、语言、颜色等非数据字段，不能默认生成品牌、store、返现比例、优惠券或测评内容。

## 第一版交付标准

第一版必须做到：

- 选了明确蓝图
- 数据进入 `.ganhuo/landerpilot-input.json`
- 页面通过 Astro build
- 本地预览已启动
- 明确提示用户点击预览链接

第一版不是最终稿。用户看预览后，再根据反馈改内容、顺序、风格、颜色、CTA、页面数量。

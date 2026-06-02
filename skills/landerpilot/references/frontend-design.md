# LanderPilot 前端设计准则

LanderPilot 的主入口仍然只有 `landerpilot`。这里不是新 skill，而是主建站流程的设计 reference：当用户要求风格、品牌感、好看、转化、模板调整，或 Agent 需要手改 Astro 页面视觉时读取。

## 设计目标

生成的站点不能像同一套 AI 模板换了文字。每个站点都要有一个明确但可落地的视觉方向，并服务它的业务目标：

- `corporate`：信任、清晰、品牌表达、获客转化。
- `affiliate-review`：可读性、对比效率、编辑可信度、CTA 清楚。
- `cashback`：信息密度、分类扫描、优惠可见、路径短。

设计不能压过内容。数据密集页优先可扫描、可比较、可点击；品牌官网可以更有空间感和气质。

## 输入字段

把设计判断落到 `.ganhuo/landerpilot-input.json`，不要只停留在对话里：

```json
{
  "style": "refined editorial, high-conversion, trustworthy",
  "design": {
    "direction": "editorial comparison",
    "tone": "sharp, calm, credible",
    "density": "medium",
    "assetStyle": "clean product imagery and simple brand marks"
  },
  "theme": {
    "name": "custom",
    "tokens": {
      "accent": "#2563eb",
      "accentEnd": "#0ea5e9"
    }
  }
}
```

字段含义：

- `style`：给蓝图和 Agent 的短描述，适合自然语言。
- `design.direction`：视觉方向，例如 `quiet SaaS`, `editorial review`, `dense coupon directory`, `luxury service`, `playful creator brand`。
- `design.tone`：文案和界面气质，例如 `credible`, `warm`, `premium`, `direct`, `technical`。
- `design.density`：`low` / `medium` / `high`，决定留白、卡片密度和列表结构。
- `design.assetStyle`：图片和图标使用策略。
- `theme.tokens`：站点已接入 Tailwind v4 编译链。`theme.tokens` 会写进生成的 `src/styles/global.css`，作为 `@theme` 颜色与 CSS 变量驱动模板；内置蓝图自带自托管可变字体（Fraunces 标题 + Hanken Grotesk 正文），不要再引外链 webfont。

## 方向选择

不要问用户“喜欢什么风格”这种空问题。给 3-4 个能直接决策的方向：

- 转化型：首屏 CTA 明显，卖点紧凑，适合投放和获客。
- 品牌型：视觉克制，强调专业、信任和差异化。
- 内容型：标题层级清楚，阅读舒服，适合 SEO 和长内容。
- 目录型：信息密度高，分类、筛选、卡片对比优先。

用户没有偏好时，按站点类型默认：

- `corporate`：品牌型 + 转化型。
- `affiliate-review`：内容型 + 转化型。
- `cashback`：目录型。

## 视觉执行

手改 `.astro` 或新增模板时遵守：

- 先定一个清晰方向，再写样式。不要每个区块都换一种风格。
- 使用 CSS 变量和页面 scoped style，和 `theme.tokens` 对齐。
- 避免默认 AI 感：同质化紫蓝渐变、空泛大卡片、无业务含义的装饰背景、过大的英雄区、到处都是圆角玻璃卡。
- 字体、颜色、间距、动效要服务内容，不为了炫技增加本地构建复杂度。
- 移动端优先检查文本不会溢出按钮、卡片和价格/优惠标签。
- CTA 文案要具体：`Get Deal`、`Compare Offers`、`Book a Demo`、`联系我们`，不要泛泛写 `Learn More` 填满全站。
- 数据密集页面要用表格感、分组、紧凑卡片、排序线索；不要做成大幅海报页。

## Astro 写法

- 页面仍然输出 `.astro`，不要为了设计引入 React/Vue。
- 重复的导航、卡片、FAQ、CTA 可后续沉淀成 Astro component；当前 MVP 可以先保持蓝图模板简单。
- 样式放在页面 `<style>` 或模板内 CSS，避免额外工具链。
- 需要少量动效时优先 CSS transition / keyframes，不引入 animation 库。
- 不确定 Astro assets、i18n、Content Collections 写法时，按 `astro-authoring.md` 查官方文档或 Context7。

## 图片与静态资源

当前本地 MVP 先用 Astro/static assets 跑通：

- 站点自带图片、logo、截图、占位图放 `public/assets/`，构建后进入 `dist/assets/`。
- 生成或整理图片时维护一份 `.ganhuo/media-manifest.json` 或输入 JSON 的 `assets` 字段，记录来源、用途、alt、目标路径。
- 不默认热链外部图片；外链只在用户明确提供且愿意保留时使用。
- 不在本地 MVP 里接 R2、Cloudflare Images 或远程上传。等 Cloudflare MCP / 部署 MCP 接入后，再把大量图片、可变图片、用户上传图片迁到 R2 或图片服务。

## 交付检查

交付前至少自查：

- 首屏一眼能看出品牌/站点主题，不只是导航里有名字。
- 主要 CTA 在首屏和关键内容后都出现，但不打断阅读。
- 手机宽度下按钮、优惠标签、长品牌名不溢出。
- 英文/中文文案没有混用，`lang`、title、description 和可见文案一致。
- 构建通过，本地受管预览可打开，并明确提示用户点击预览链接。

# Astro 页面生成规范

内置蓝图可以封装模板细节，但很多页面会由 Agent 根据用户数据临时生成或改写。这类页面必须继续使用 Astro 的能力，而不是退回到拼大段 HTML 字符串。

## 基本原则

- Astro 是页面源文件格式：输出到 `src/pages/**/*.astro`，让 Astro 负责 SSG、路由、样式作用域和产物生成。
- 数据先结构化：品牌、商品、店铺、FAQ、价格、分类、文章段落都先放到 frontmatter 的对象/数组里。
- 模板负责渲染：用 `{items.map(...)}`、条件渲染、组件/片段组织页面，不把列表和整页 HTML 预先拼成字符串。
- 默认静态：不加 SSR adapter，不加客户端框架，不加浏览器 JS，除非用户明确需要交互。
- 页面结构稳定：多页站用 Astro 文件路由，例如 `src/pages/reviews/[slug]/index.astro` 或生成具体目录 `src/pages/reviews/sony/index.astro`。

## 何时查 Astro 最新文档

不要把 Astro 全量知识塞进 skill。只要遇到不确定的 Astro 语法或 API，就先查最新文档，再写代码。

必须查官方文档或 Context7 的场景：

- 文件路由、动态路由、`getStaticPaths()`、分页。
- i18n 路由、`Astro.currentLocale`、locale fallback、canonical / hreflang。
- Content Collections、`src/content.config.ts`、`getCollection()`、Zod schema、JSON/Markdown/MDX 数据源。
- Assets / images / `public/` 目录和图片优化。
- Astro config、adapter、SSR/prerender 边界。
- Astro 版本升级后出现构建错误或 API 报错。

优先级：

1. Astro 官方 docs：`https://docs.astro.build/`
2. Context7 Astro 文档检索
3. 代码库里的已有实现和本 skill references

查到文档后只采用本任务涉及的最小能力，不为了“更完整”引入额外框架、SSR adapter 或复杂编译链。

## 推荐写法

```astro
---
const lang = "en";
const t = {
  en: {
    title: "Best headphones for travel",
    cta: "View Deal",
  },
  "zh-CN": {
    title: "适合旅行的耳机推荐",
    cta: "查看优惠",
  },
}[lang];

const products = [
  {
    name: "Sony WH-1000XM5",
    slug: "sony-wh-1000xm5",
    summary: "Strong ANC and comfort for frequent travelers.",
    url: "https://example.go/sony",
  },
];
---

<!doctype html>
<html lang={lang}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{t.title}</title>
  </head>
  <body>
    <main>
      <h1>{t.title}</h1>
      <section>
        {products.map((product) => (
          <article>
            <h2>{product.name}</h2>
            <p>{product.summary}</p>
            <a href={product.url} rel="nofollow sponsored noopener">{t.cta}</a>
          </article>
        ))}
      </section>
    </main>
  </body>
</html>
```

## 多语言

内置蓝图会处理常见 `en` / `zh-CN` 文案，但 Agent 自己生成的页面、段落、标题、FAQ、CTA、schema 都不可能完全由 plugin 后处理控制。因此多语言必须在 Astro 源里显式表达。

要求：

- 默认英文：用户没说语言时，按 `lang = "en"`。
- 用户明确中文，或输入明显中文时，按 `lang = "zh-CN"`。
- 单语言站：设置 `<html lang={lang}>`，所有可见文案从 `t` 或结构化数据读取。
- 内置蓝图模板：UI 文案放进蓝图级 `i18n/en.json`、`i18n/zh-CN.json`，producer 注入 `t`；模板用 `{{t.nav.home}}`、`{{t.footer.privacy}}` 读取，不再新增 `home_label`、`privacy_label` 这类散变量。
- 多语言站：用路由区分 locale，例如 `/en/...`、`/zh-CN/...`，并给每个 locale 独立 title、description、canonical/hreflang。
- SEO 数据也要多语言：meta description、Open Graph、JSON-LD 的 `name` / `description` 不要遗留另一种语言。
- 不要先写英文整页再全局替换成中文；这种方式覆盖不了 Agent 新增内容，也容易把品牌名、URL、schema 改坏。
- 不确定 Astro 当前 i18n API 时，先查 Astro 官方 i18n routing docs 或 Context7，再写实现。

## 数据密集页面

数据密集页面尤其要避免手拼 HTML：

- 先把浏览器抓取、用户文件、搜索结果整理成 `.ganhuo/landerpilot-input.json` 或 frontmatter 数据。
- 表格、卡片、分类、FAQ、文章段落都用数组渲染。
- 同结构的大量文章、商品、店铺、FAQ、分类数据，优先考虑 Astro Content Collections；不确定当前写法时先查官方 docs。
- 需要重复使用的区块可放成 Astro 组件；不要为了一个页面引入 React/Vue。
- 图片优先放 `public/`，外链图片只在用户数据明确需要时保留。

## 静态资源策略

当前 LanderPilot 本地 MVP 先走 Astro/static assets，目标是让 Windows/macOS 小白用户本地生成、构建、预览稳定。

- 站点图片、logo、截图、占位图放到 `public/assets/`，由 Astro 构建进 `dist/assets/`。
- 输入 JSON 可以记录 `assets`，包含 `src`、`alt`、`usage`、`localPath`，方便模板和后续部署 MCP 复用。
- 不默认热链外部图片，避免预览或未来部署后被防盗链、CSP、网络波动影响。
- 暂不在本地生成链路里接 R2、Cloudflare Images 或图片上传。未来 Cloudflare MCP 接入后，再把大量图片、用户上传图片、可变图片迁到 R2/图片服务；HTML/CSS/小图标继续作为 static assets 随站点部署。

## 内置模板与手写页面的边界

- 内置蓝图：可以复用从模板库迁移来的完整 HTML 模板，producer 负责数据填充。
- Agent 手写/动态页：必须 Astro-first，按 frontmatter + template + scoped style 写。
- 后续模板升级：逐步把高复用区块沉淀成 Astro layout/component，而不是把所有逻辑塞进 `SKILL.md`。

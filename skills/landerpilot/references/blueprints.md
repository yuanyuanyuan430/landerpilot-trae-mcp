# 内置站点类型与扩展方式

站点类型不是新 skill。它们是 LanderPilot plugin 内部蓝图。

目录约定：

```text
plugins/builtin/landerpilot/
  blueprints/
    corporate/
      blueprint.json
      producer.mjs
      templates/
    affiliate-review/
    cashback/
  generators/shared/
```

新增站点类型只需要：

1. 新建 `blueprints/<type>/blueprint.json`。
2. 放入 Astro 可构建的模板片段或完整 HTML 模板。
3. 实现 `producer.mjs`，输入结构化 JSON，输出 `{ blueprint, variant, title, description, pages[] }`。
4. 必要时补共享 normalize/render/SEO helper。
5. 更新 MCP 的模板列表会自动读取 `blueprints/*/blueprint.json`。

## Producer 输出

```js
{
  blueprint: "cashback",
  variant: "cashback-directory",
  title: "CashPanda",
  description: "...",
  pages: [
    { route: "index", title: "CashPanda", content: "<!doctype html>..." },
    { route: "stores/amazon", title: "Amazon", content: "<!doctype html>..." }
  ],
  summary: {}
}
```

`generate-site.mjs` 会把这些页面写成 Astro pages：

- `index` -> `src/pages/index.astro`
- `reviews/sony` -> `src/pages/reviews/sony/index.astro`
- `stores/amazon` -> `src/pages/stores/amazon/index.astro`

Astro 负责 SSG 构建和路由输出。

## 主题

当前主题用 CSS token overlay，不引入 Tailwind 编译链路。这样普通用户的 Windows/macOS 本地链路更轻、更稳。

支持：

```json
{
  "theme": {
    "name": "ocean",
    "tokens": {
      "accent": "#2563eb",
      "accentEnd": "#0ea5e9"
    }
  }
}
```

Tailwind/Tweak 类高级主题能力后续可以作为蓝图可选能力加入，不作为本地 MVP 的默认复杂度。

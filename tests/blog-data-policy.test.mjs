import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { produce } from "../blueprints/blog/producer.mjs";
import { sanitizeBlogHtml } from "../skills/landerpilot/scaffold/src/lib/sanitize-blog-html.mjs";

test("blog rejects missing posts outside explicit demo mode", async () => {
  await assert.rejects(
    () => produce({ input: { site_name: "Field Notes" } }),
    /requires at least one complete post/
  );
});

test("blog rejects an incomplete real post", async () => {
  await assert.rejects(
    () =>
      produce({
        input: {
          site_name: "Field Notes",
          posts: [{ title: "Draft", contentHtml: "<p>Real content.</p>" }],
        },
      }),
    /Blog post 1 is missing required field\(s\): date/
  );
});

test("blog allows one placeholder only in explicit demo mode", async () => {
  const result = await produce({
    input: { site_name: "Field Notes", demo_mode: true },
  });

  assert.equal(result.summary.postCount, 1);
  assert.equal(result.pages.filter((page) => page.route.startsWith("blog/")).length, 1);
  assert.ok(result.warnings.some((warning) => warning.startsWith("demo-post:")));
  assert.ok(result.pages.some((page) => page.content.includes("[DEMO]")));
});

test("blog demo mode rejects more than one placeholder post", async () => {
  await assert.rejects(
    () =>
      produce({
        input: {
          site_name: "Field Notes",
          demo_mode: true,
          posts: [{ title: "One" }, { title: "Two" }],
        },
      }),
    /Blog post 1 is missing required field/
  );
});

test("blog accepts a real post with title, content and date", async () => {
  const result = await produce({
    input: {
      site_name: "Field Notes",
      posts: [
        {
          title: "A real post",
          contentHtml: "<p>Real content.</p>",
          date: "2026-07-29",
        },
      ],
    },
  });

  assert.equal(result.summary.postCount, 1);
});

test("blog sanitizes untrusted rich HTML at the render boundary", () => {
  const dirty = [
    '<h2>Useful <strong>content</strong></h2>',
    '<a href="https://example.com/review" target="_blank" onclick="alert(1)">Read more</a>',
    '<img src="https://example.com/product.jpg" alt="Product" loading="lazy" onerror="alert(1)">',
    '<script>window.__lp_xss=1</script>',
    '<style>body{background:url(javascript:alert(1))}</style>',
    '<a href="javascript:alert(1)">Unsafe link</a>',
    '<img src="data:image/svg+xml,<svg onload=alert(1)>" srcset="javascript:alert(1)">',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<svg><script>alert(1)</script></svg>',
    '<math><mtext></math><img src=x onerror=alert(1)>',
    '<xmp><img src=x onerror=alert(1)></xmp>',
    '<noscript><img src=x onerror=alert(1)></noscript>',
    '<option>&lt;img src=x onerror=alert(1)&gt;</option>',
    '<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">Go</button></form>',
    '<object data="javascript:alert(1)"></object><video poster="javascript:alert(1)"></video>',
    "&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;",
  ].join("");

  const clean = sanitizeBlogHtml(dirty);

  assert.match(clean, /<h2>Useful <strong>content<\/strong><\/h2>/);
  assert.match(clean, /href="https:\/\/example\.com\/review"/);
  assert.match(clean, /src="https:\/\/example\.com\/product\.jpg"/);
  assert.doesNotMatch(clean, /<(?:script|style|iframe|svg|math)\b/i);
  assert.doesNotMatch(clean, /\bon[a-z]+\s*=/i);
  assert.doesNotMatch(clean, /\b(?:javascript|data)\s*:/i);
  assert.doesNotMatch(clean, /\b(?:srcdoc|srcset|target)\s*=/i);

  const component = readFileSync(
    new URL("../skills/landerpilot/scaffold/src/components/sections/BlogPost.astro", import.meta.url),
    "utf8"
  );
  assert.match(component, /set:html=\{safeContentHtml\}/);
  assert.doesNotMatch(component, /set:html=\{contentHtml\}/);
});

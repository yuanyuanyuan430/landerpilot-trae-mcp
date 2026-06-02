// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Astro 配置。保持静态构建（SSG），Tailwind 只在构建期生成 CSS。
// 文档：https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
});

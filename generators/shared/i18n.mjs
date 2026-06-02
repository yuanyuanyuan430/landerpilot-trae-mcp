import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function normalizeLanguage(input = {}) {
  const raw = String(input.language || input.lang || input.locale || "").trim().toLowerCase();
  if (raw.startsWith("zh")) return "zh-CN";
  if (raw.startsWith("en")) return "en";
  const text = [input.raw_text, input.prompt, input.site_description, input.description]
    .filter(Boolean)
    .join("\n");
  return looksMostlyChinese(text) ? "zh-CN" : "en";
}

export function isChineseLanguage(language) {
  return String(language || "").toLowerCase().startsWith("zh");
}

export function htmlLang(language) {
  return isChineseLanguage(language) ? "zh-CN" : "en";
}

export function loadBlueprintI18n(blueprintRoot, language, extra = {}) {
  const locale = htmlLang(language);
  return mergeDeep(
    dictionary(language),
    readLocaleJson(blueprintRoot, "en"),
    locale === "en" ? {} : readLocaleJson(blueprintRoot, locale),
    extra
  );
}

export function dictionary(language) {
  const zh = isChineseLanguage(language);
  return {
    language: zh ? "zh-CN" : "en",
    dir: "ltr",
    review: zh ? "测评" : "Review",
    reviews: zh ? "测评" : "Reviews",
    home: zh ? "首页" : "Home",
    categories: zh ? "分类" : "Categories",
    stores: zh ? "商家" : "Stores",
    getStarted: zh ? "开始使用" : "Get Started",
    viewDemo: zh ? "查看演示" : "View Demo",
    recommended: zh ? "推荐" : "Recommended",
    worthConsidering: zh ? "值得考虑" : "Worth Considering",
    pros: zh ? "优点" : "What We Like",
    cons: zh ? "注意点" : "What We Don't",
    overview: zh ? "概览" : "Overview",
    bestFor: zh ? "适合人群" : "Best For",
    dealNotes: zh ? "优惠与购买提示" : "Deal Notes",
    relatedReviews: zh ? "相关测评" : "Related Reviews",
    faq: zh ? "常见问题" : "Frequently Asked Questions",
    currentYearRights: zh ? "保留所有权利" : "All rights reserved",
    affiliateDisclosure: zh
      ? "联盟披露：当你通过我们的链接购买时，我们可能获得佣金。"
      : "Affiliate Disclosure: We may earn a commission when you shop through our links.",
    partnerStores: zh ? "合作商家" : "Partner Stores",
    activeCoupons: zh ? "可用优惠" : "Active Coupons",
    buyingCategories: zh ? "购买分类" : "Buying Categories",
    localOwnership: zh ? "本地所有权" : "Local ownership",
  };
}

function readLocaleJson(blueprintRoot, locale) {
  const file = join(blueprintRoot, "i18n", `${locale}.json`);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read LanderPilot i18n dictionary ${file}: ${error.message}`);
  }
}

function mergeDeep(...values) {
  const out = {};
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [key, next] of Object.entries(value)) {
      const previous = out[key];
      out[key] = isPlainObject(previous) && isPlainObject(next)
        ? mergeDeep(previous, next)
        : next;
    }
  }
  return out;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function applyHtmlLanguage(html, language) {
  const withLang = String(html)
    .replace(/<html\s+lang="[^"]*"/i, `<html lang="${htmlLang(language)}"`)
    .replace(/<html(?!\s+lang=)/i, `<html lang="${htmlLang(language)}"`);
  return isChineseLanguage(language) ? localizeChineseStaticText(withLang) : withLang;
}

function localizeChineseStaticText(html) {
  const replacements = [
    ["Affiliate Disclosure: We may earn a commission when you shop through our links. Our recommendations stay comparison-led and editorially structured.", "联盟披露：当你通过我们的链接购物时，我们可能获得佣金。推荐内容仍以对比和编辑判断为基础。"],
    ["Independent affiliate comparison pages", "独立联盟对比页面"],
    ["Editor Reviews & Buying Notes", "编辑测评与购买提示"],
    ["How We Choose Brands", "我们如何选择品牌"],
    ["Reviews", "测评"],
    ["Review", "测评"],
    ["Home", "首页"],
    ["Visit", "访问"],
    ["Best Deal", "当前优惠"],
    ["Get This Deal", "获取优惠"],
    ["Contents", "目录"],
    ["Quick Specs", "快速信息"],
    ["Related Reviews", "相关测评"],
    ["Frequently Asked Questions", "常见问题"],
    ["What We Like", "优点"],
    ["What We Don't", "注意点"],
    ["Updated", "更新于"],
    ["min read", "分钟阅读"],
    ["Is It Worth It?", "值得买吗？"],
    ["Stores", "商家"],
    ["Categories", "分类"],
    ["Popular Stores", "热门商家"],
    ["View All", "查看全部"],
    ["Browse by Category", "按分类浏览"],
    ["All Categories", "全部分类"],
    ["How It Works", "如何运作"],
    ["Find a Store", "找到商家"],
    ["Shop & Save", "购物并省钱"],
    ["Get Cash Back", "查看返现优惠"],
    ["Start Saving Today", "开始比较优惠"],
    ["Free forever. No credit card required.", "购物前请确认目标站点条款。"],
    ["Partner Stores", "合作商家"],
    ["Active Coupons", "优惠摘要"],
    ["About", "关于"],
    ["Contact", "联系"],
    ["Privacy Policy", "隐私政策"],
    ["Terms of Service", "服务条款"],
    ["All rights reserved.", "保留所有权利。"],
    ["Features", "功能"],
    ["Pricing", "价格"],
    ["Integrations", "集成"],
    ["Sign In", "登录"],
    ["Try Free", "免费试用"],
    ["Built for modern teams", "为现代团队打造"],
    ["Everything you need to collaborate, ship, and grow — in one platform.", "在一个平台中完成协作、交付和增长所需的核心工作。"],
    ["Works with your stack", "适配你的工具栈"],
    ["Connect with the tools you already use.", "连接你已经在用的工具。"],
    ["Plans for every team", "适合不同团队的方案"],
    ["Start free. Scale as you grow.", "免费开始，随增长扩展。"],
    ["Faster launch cycles", "更快上线周期"],
    ["Static site availability", "静态站可用性"],
    ["Local ownership", "本地所有权"],
    ["Starter", "入门版"],
    ["Growth", "增长版"],
    ["Scale", "规模版"],
    ["to begin", "起步使用"],
    ["per month", "每月"],
    ["for teams", "团队方案"],
    ["One site", "一个站点"],
    ["Static pages", "静态页面"],
    ["Local preview", "本地预览"],
    ["More pages", "更多页面"],
    ["Theme controls", "主题控制"],
    ["SEO-ready output", "SEO 就绪产物"],
    ["Deployment", "部署"],
    ["Analytics", "分析"],
    ["Workflow support", "工作流支持"],
    ["Choose ", "选择"],
    ["Popular", "热门"],
    ["Product", "产品"],
    ["Company", "公司"],
    ["Legal", "法律"],
    ["Privacy", "隐私"],
    ["Terms", "条款"],
    ["Blog", "博客"],
    ["Careers", "招聘"],
  ];
  let out = html;
  for (const [from, to] of replacements) {
    out = out.split(from).join(to);
  }
  return out;
}

function looksMostlyChinese(text) {
  const content = String(text || "");
  if (!content) return false;
  const chinese = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (content.match(/[A-Za-z]/g) || []).length;
  return chinese >= 8 && chinese > latin * 0.35;
}

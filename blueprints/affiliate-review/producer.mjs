import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureArray,
  safeJsonForInlineScript,
  toSentence,
  truncateText,
} from "../../generators/shared/html.mjs";
import {
  loadBlueprintI18n,
  normalizeLanguage,
  isChineseLanguage,
} from "../../generators/shared/i18n.mjs";
import { normalizeUrl, siteUrlFromDomain } from "../../generators/shared/slug.mjs";
import { groupOffersByCategory, normalizeOffers } from "../../generators/shared/normalize-offers.mjs";
import {
  renderAstroPage,
  renderHeadHtml,
} from "../../generators/shared/render-astro-page.mjs";
import { resolveIndustryTheme } from "../../generators/shared/industry-themes/index.mjs";

const blueprintRoot = dirname(fileURLToPath(import.meta.url));
const defaultVariant = "affiliate-brand-hub+review-revneey-golden-v5";
const yeahPromosVariant = "affiliate-review-yp";
const variants = new Set([defaultVariant, yeahPromosVariant]);
const yeahPromosVerificationMeta =
  '<meta name="verify-yeahpromos" content="ac599e312f5c">';

export async function produce({ input = {} } = {}) {
  const language = normalizeLanguage(input);
  const t = loadBlueprintI18n(blueprintRoot, language);
  const zh = isChineseLanguage(language);
  const variant = chooseVariant(input.variant, input.template_variant, input.template);
  const extraHeadTags =
    variant === yeahPromosVariant ? [yeahPromosVerificationMeta] : [];
  const profile = mergeRecords(input.company, input.business, input.publisher);
  const siteName = text(input.site_name, input.siteName, profile.name, "Affiliate Review Site");
  const siteUrl = siteUrlFromDomain(
    input.domain,
    normalizeUrl(input.site_url || input.siteUrl, "https://example.com")
  );
  const today = new Date();
  const currentYear = String(today.getFullYear());
  const dateIso = today.toISOString().slice(0, 10);
  const dateDisplay = today.toLocaleDateString(zh ? "zh-CN" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const author = text(input.author, t.reviewPage?.defaultAuthor, siteName);

  const offers = normalizeOffers(input, {
    blueprint: "affiliate-review",
    defaultCategory: t.reviews,
    requireInputData: true,
  });
  const groups = groupOffersByCategory(offers);

  const industry = resolveIndustryTheme(text(input.industry, input.theme_industry) || "ecommerce");
  const industryId = industry?.id || "ecommerce";
  const dataTheme = `ganhuo-${industryId}`;

  const navLinks = normalizeNavLinks(input, t);
  const announcement = normalizeAnnouncement(input, t);
  const disclosureText = text(input.disclosure_text, input.disclosure, t.hub?.disclosureText);

  const hubDescription = toSentence(
    text(input.site_description, input.description, profile.description),
    zh
      ? `${siteName} 对可信品牌、产品和当前联盟优惠进行结构化对比。`
      : `${siteName} compares trusted brands, products, and current affiliate offers.`
  );
  const heroTitle = text(
    input.hero_title,
    zh
      ? `购买前对比优质${groups[0]?.category || "品牌"}`
      : `Compare the best ${groups[0]?.category || "brands"} before you buy`
  );
  const heroSubtitle = text(input.hero_description, input.hero_subtitle, hubDescription);
  const ctaText = text(input.cta_text, t.hub?.ctaPrimary, zh ? "查看精选品牌" : "See featured brands");

  // -------- hub (index) sections --------
  const hubSections = buildHubSections({
    siteName,
    heroTitle,
    heroSubtitle,
    ctaText,
    description: hubDescription,
    offers,
    groups,
    navLinks,
    announcement,
    disclosureText,
    t,
    zh,
  });

  // -------- per-review sections --------
  const reviewPages = offers.map((offer) => {
    const related = offers.filter((o) => o.slug !== offer.slug).slice(0, 4);
    return buildReviewPage({
      offer,
      related,
      siteName,
      siteUrl,
      language,
      dataTheme,
      navLinks,
      announcement,
      disclosureText,
      currentYear,
      dateIso,
      dateDisplay,
      author,
      hubDescription,
      extraHeadTags,
      t,
      zh,
    });
  });

  // -------- reviews index --------
  const reviewsIndexSections = buildReviewsIndexSections({
    siteName,
    offers,
    navLinks,
    announcement,
    disclosureText,
    t,
    zh,
  });

  // -------- support pages --------
  const supportPagePaths = [
    ["about", t.support.aboutTitle, hubDescription, null],
    ["privacy", t.support.privacyTitle, t.support.privacyDescription, null],
    ["terms", t.support.termsTitle, t.support.termsDescription, null],
    ["disclosure", t.support.disclosureTitle, disclosureText || t.support.disclosureDescription, "disclosure"],
  ];

  const supportPages = supportPagePaths.map(([route, title, supportDescription, kind]) => {
    const sections = [];
    if (announcement) sections.push(announcementSection(announcement));
    sections.push(headerNavSection({ siteName, navLinks, ctaText, ctaUrl: "#brands" }));
    if (disclosureText && route !== "disclosure") {
      sections.push(disclosureSectionFor(disclosureText, "subtle", t));
    }
    sections.push({
      component: "PageHero",
      props: {
        eyebrow: siteName,
        title,
        description: supportDescription,
        breadcrumbs: [
          { text: t.home, href: "/" },
          { text: title },
        ],
        background: "tinted",
      },
    });
    if (kind === "disclosure") {
      sections.push(disclosureSectionFor(disclosureText || supportDescription, "highlighted", t));
    }
    sections.push(footerFullSection({ siteName, description: hubDescription, t }));

    const head = renderHeadHtml({
      title: `${title} - ${siteName}`,
      description: supportDescription,
      canonicalUrl: `${siteUrl}/${route}/`,
      extraTags: extraHeadTags,
    });

    const astroBody = renderAstroPage({
      lang: language,
      dataTheme,
      headHtml: head,
      cssImport: "../../styles/global.css",
      componentsImportRoot: "../../components/sections",
      sections,
      metadata: { blueprint: "affiliate-review", route, industry: industryId },
    });

    return { route, title: `${title} - ${siteName}`, content: astroBody, astroBody };
  });

  // -------- assemble index page --------
  const metaTitle = truncateText(
    text(input.meta_title, zh ? `${siteName} - 优质品牌与测评` : `${siteName} - Best Brands and Reviews`),
    68
  );
  const metaDescription = truncateText(text(input.meta_description, hubDescription), 158);

  const indexHead = renderHeadHtml({
    title: metaTitle,
    description: metaDescription,
    canonicalUrl: `${siteUrl}/`,
    schemaJson: safeJsonForInlineScript({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteName,
      url: `${siteUrl}/`,
      description: hubDescription,
    }),
    extraTags: extraHeadTags,
  });

  const indexAstro = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: indexHead,
    cssImport: "../styles/global.css",
    componentsImportRoot: "../components/sections",
    sections: hubSections,
    metadata: { blueprint: "affiliate-review", route: "index", industry: industryId },
  });

  const reviewsIndexHead = renderHeadHtml({
    title: `${siteName} ${t.reviews}`,
    description: hubDescription,
    canonicalUrl: `${siteUrl}/reviews/`,
    extraTags: extraHeadTags,
  });
  const reviewsIndexAstro = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: reviewsIndexHead,
    cssImport: "../../styles/global.css",
    componentsImportRoot: "../../components/sections",
    sections: reviewsIndexSections,
    metadata: { blueprint: "affiliate-review", route: "reviews", industry: industryId },
  });

  const pages = [
    { route: "index", title: siteName, content: indexAstro, astroBody: indexAstro },
    {
      route: "reviews",
      title: `${siteName} ${t.reviews}`,
      content: reviewsIndexAstro,
      astroBody: reviewsIndexAstro,
    },
    ...reviewPages,
    ...supportPages,
  ];

  return {
    blueprint: "affiliate-review",
    variant,
    title: siteName,
    description: hubDescription,
    pages,
    theme: { industry: industryId },
    summary: {
      siteName,
      language,
      industry: industryId,
      offerCount: offers.length,
      categoryCount: groups.length,
      pageCount: pages.length,
    },
  };
}

// =============================================================================
// Hub page (index)
// =============================================================================

function buildHubSections({ siteName, heroTitle, heroSubtitle, ctaText, description, offers, groups, navLinks, announcement, disclosureText, t, zh }) {
  const list = [];
  if (announcement) list.push(announcementSection(announcement));
  list.push(headerNavSection({ siteName, navLinks, ctaText, ctaUrl: "#brands" }));
  if (disclosureText) list.push(disclosureSectionFor(disclosureText, "subtle", t));
  list.push({
    component: "HeroSplit",
    props: {
      brand: siteName,
      title: heroTitle,
      subtitle: heroSubtitle,
      primaryCta: { text: ctaText, href: "#brands" },
      ...(text(t.hub?.ctaSecondary) ? {
        secondaryCta: { text: t.hub.ctaSecondary, href: "/about/" }
      } : {}),
    },
  });
  list.push({
    component: "StatsStrip",
    props: {
      stats: hubStats(offers, groups, t),
      bordered: true,
    },
  });
  // Render a BrandGrid per category (when multiple categories) OR one flat grid.
  if (groups.length > 1) {
    for (const [idx, group] of groups.entries()) {
      list.push({
        component: "BrandGrid",
        purpose: idx === 0 ? "brand-grid-featured" : "brand-grid",
        props: {
          eyebrow: idx === 0 ? (zh ? "精选品牌" : "Featured") : undefined,
          title: group.category,
          brands: group.offers.map((o) => offerToBrandEntry(o, t)),
          layout: "grid",
          columns: group.offers.length >= 3 ? 3 : group.offers.length === 2 ? 2 : 3,
          showScore: true,
          showPros: false,
          reviewLabel: t.reviewPage?.readReview || (zh ? "查看测评" : "Read review"),
          visitLabel: t.reviewPage?.visit || (zh ? "前往" : "Visit"),
        },
      });
    }
  } else {
    list.push({
      component: "BrandGrid",
      purpose: "brand-grid-featured",
      props: {
        eyebrow: zh ? "精选品牌" : "Featured brands",
        title: groups[0]?.category || (zh ? "精选" : "Featured"),
        brands: offers.map((o) => offerToBrandEntry(o, t)),
        layout: "grid",
        columns: offers.length >= 3 ? 3 : offers.length === 2 ? 2 : 3,
        showScore: true,
        showPros: true,
        reviewLabel: t.reviewPage?.readReview || (zh ? "查看测评" : "Read review"),
        visitLabel: t.reviewPage?.visit || (zh ? "前往" : "Visit"),
      },
    });
  }
  list.push({
    component: "ProcessSteps",
    purpose: "method",
    props: {
      eyebrow: zh ? "方法论" : "Methodology",
      title: zh ? "我们如何测评" : "How we review",
      description: zh
        ? "每个品牌都经过同一套评估标准，便于横向对比。"
        : "Every brand goes through the same evaluation rubric so the comparisons are apples-to-apples.",
      steps: methodSteps(t, zh),
      layout: "horizontal",
      numbered: true,
    },
  });
  list.push({
    component: "CTABand",
    props: {
      title: zh ? `开始比较${groups[0]?.category || "品牌"}` : `Start comparing ${groups[0]?.category || "brands"}`,
      description: zh
        ? `${siteName} 把数据驱动的测评放在一处，让你 5 分钟内做出决定。`
        : `${siteName} keeps data-driven reviews in one place so you can decide in 5 minutes.`,
      cta: { text: ctaText, href: "#brands" },
      variant: "dark",
    },
  });
  list.push(footerFullSection({ siteName, description, t }));
  return list;
}

function methodSteps(t, zh) {
  return [
    {
      title: zh ? "搜集真实数据" : "Pull real data",
      description: zh
        ? "从官方资料、用户评价、行业基准抓取一致的信号。"
        : "Source the same metrics from official docs, user feedback, and industry benchmarks.",
    },
    {
      title: zh ? "统一评分" : "Score on a rubric",
      description: zh
        ? "按设计 / 性能 / 价格 / 支持等维度评分，再加权得到总分。"
        : "Rate each brand on design, performance, price, and support, then weight to an overall score.",
    },
    {
      title: zh ? "持续更新" : "Refresh continuously",
      description: zh
        ? "新版本、新优惠、新槽点都会即时反映到列表上。"
        : "New versions, new deals, new gotchas all flow back into the list.",
    },
  ];
}

function hubStats(offers, groups, t) {
  const total = offers.length;
  const cats = groups.length;
  const avgScore =
    offers.length === 0
      ? 0
      : offers.reduce((sum, o) => sum + (o.score || 0), 0) / offers.length;
  return [
    { value: String(total), label: t.hub?.brandLabel || "Brands reviewed" },
    { value: String(cats), label: t.hub?.categoryLabel || "Categories" },
    { value: avgScore ? avgScore.toFixed(1) : "—", label: t.hub?.avgScoreLabel || "Average score" },
  ];
}

// =============================================================================
// Reviews index page
// =============================================================================

function buildReviewsIndexSections({ siteName, offers, navLinks, announcement, disclosureText, t, zh }) {
  const list = [];
  if (announcement) list.push(announcementSection(announcement));
  list.push(headerNavSection({ siteName, navLinks, ctaText: t.hub?.ctaPrimary || "#brands", ctaUrl: "/" }));
  if (disclosureText) list.push(disclosureSectionFor(disclosureText, "subtle", t));
  list.push({
    component: "PageHero",
    props: {
      eyebrow: t.reviews,
      title: zh ? `${siteName} 全部测评` : `All ${siteName} reviews`,
      description: zh ? "按字母顺序排列的所有品牌测评。" : "Every brand we've reviewed, in one place.",
      breadcrumbs: [
        { text: t.home, href: "/" },
        { text: t.reviews },
      ],
      background: "tinted",
    },
  });
  list.push({
    component: "BrandGrid",
    props: {
      brands: offers.map((o) => offerToBrandEntry(o, t)),
      layout: "list",
      showScore: true,
      reviewLabel: t.reviewPage?.readReview || (zh ? "查看测评" : "Read review"),
      visitLabel: t.reviewPage?.visit || (zh ? "前往" : "Visit"),
    },
  });
  list.push(footerFullSection({ siteName, description: "", t }));
  return list;
}

// =============================================================================
// Per-review page
// =============================================================================

function buildReviewPage({ offer, related, siteName, siteUrl, language, dataTheme, navLinks, announcement, disclosureText, currentYear, dateIso, dateDisplay, author, hubDescription, extraHeadTags, t, zh }) {
  const canonicalUrl = `${siteUrl}/reviews/${offer.slug}/`;
  const reviewTitle = zh ? `${offer.brand} 测评 ${currentYear}` : `${offer.brand} Review ${currentYear}`;
  const verdict = zh
    ? `${offer.brand} 是${offer.category}里值得认真考虑的选项`
    : `A strong ${offer.category.toLowerCase()} pick worth a serious look`;
  const verdictSummary = zh
    ? `${offer.brand} 适合正在对比 ${offer.category} 的用户，重点优势是：${offer.shortDescription}`
    : `${offer.brand} is a strong ${offer.category.toLowerCase()} option for shoppers who want ${offer.shortDescription.toLowerCase()}`;
  const ctaUrl = offer.affiliateUrl || offer.website || "/";
  const visitLabel = offer.hasAffiliateUrl
    ? (zh ? `查看 ${offer.brand} 优惠` : `Visit ${offer.brand}`)
    : (zh ? `访问 ${offer.brand} 官网` : `Visit ${offer.brand} official site`);

  const sections = [];
  if (announcement) sections.push(announcementSection(announcement));
  sections.push(
    headerNavSection({
      siteName,
      navLinks,
      ctaText: zh ? `查看 ${offer.brand}` : `Visit ${offer.brand}`,
      ctaUrl,
      activeRoute: "/reviews/",
    })
  );
  if (disclosureText) sections.push(disclosureSectionFor(disclosureText, "subtle", t));
  sections.push({
    component: "Breadcrumb",
    props: {
      items: [
        { text: t.home, href: "/" },
        { text: t.reviews, href: "/reviews/" },
        { text: offer.brand },
      ],
      bordered: true,
    },
  });
  sections.push({
    component: "ReviewHero",
    props: {
      eyebrow: t.reviewPage?.eyebrow || (zh ? "测评" : "Review"),
      brand: offer.brand,
      title: reviewTitle,
      verdict,
      verdictSummary,
      score: offer.score,
      author,
      date: dateDisplay,
      readingTime: zh ? "6 分钟阅读" : "6 min read",
      primaryCta: { text: visitLabel, href: ctaUrl, rel: offer.hasAffiliateUrl ? "sponsored noopener" : "noopener" },
      ...(offer.dealText && offer.hasExplicitDealText ? { dealText: offer.dealText } : {}),
    },
  });

  const ratings = deriveRatings(offer, t, zh);
  if (ratings.length > 0) {
    sections.push({
      component: "RatingBreakdown",
      props: { items: ratings, columns: 2 },
    });
  }

  sections.push({
    component: "ProsCons",
    props: {
      pros: offer.pros,
      cons: offer.cons,
      prosLabel: t.pros,
      consLabel: t.cons,
    },
  });

  const specsRows = specsArrayFromObject(offer.specs);
  if (specsRows.length > 0) {
    sections.push({
      component: "SpecsTable",
      props: {
        title: t.reviewPage?.quickSpecs || (zh ? "规格速览" : "Quick specs"),
        specs: specsRows,
        layout: "grid",
      },
    });
  }

  if (offer.faq && offer.faq.length > 0) {
    sections.push({
      component: "FAQ",
      props: {
        title: t.faq || "FAQ",
        items: offer.faq.map((q) => ({
          question: text(q.q, q.question),
          answer: text(q.a, q.answer),
        })).filter((q) => q.question && q.answer),
        interactive: true,
      },
    });
  }

  if (related.length > 0) {
    sections.push({
      component: "BrandGrid",
      purpose: "related",
      props: {
        title: t.relatedReviews || (zh ? "相关测评" : "Related reviews"),
        brands: related.map((o) => offerToBrandEntry(o, t)),
        layout: "grid",
        columns: related.length >= 3 ? 3 : 2,
        showScore: true,
        reviewLabel: t.reviewPage?.readReview || (zh ? "查看测评" : "Read review"),
        visitLabel: t.reviewPage?.visit || (zh ? "前往" : "Visit"),
      },
    });
  }

  sections.push({
    component: "CTABand",
    props: {
      title: zh ? `准备好下单 ${offer.brand} 了吗？` : `Ready to try ${offer.brand}?`,
      description: offer.shortDescription,
      cta: { text: visitLabel, href: ctaUrl },
      variant: "dark",
    },
  });
  sections.push(disclosureSectionFor(disclosureText || (zh ? "本站包含联盟链接。" : "This site contains affiliate links."), "subtle", t));
  sections.push(footerFullSection({ siteName, description: hubDescription, t }));

  const head = renderHeadHtml({
    title: `${reviewTitle} | ${siteName}`,
    description: verdictSummary,
    canonicalUrl,
    ogImage: offer.image || offer.logo,
    schemaJson: safeJsonForInlineScript({
      "@context": "https://schema.org",
      "@type": "Review",
      itemReviewed: { "@type": "Product", name: offer.brand, url: offer.website || offer.affiliateUrl },
      author: { "@type": "Organization", name: siteName },
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(offer.score),
        bestRating: "10",
        worstRating: "1",
      },
      datePublished: dateIso,
    }),
    extraTags: extraHeadTags,
  });

  const astroBody = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: head,
    cssImport: "../../../styles/global.css",
    componentsImportRoot: "../../../components/sections",
    sections,
    metadata: { blueprint: "affiliate-review", route: `reviews/${offer.slug}`, brand: offer.brand },
  });

  return {
    route: `reviews/${offer.slug}`,
    title: zh ? `${offer.brand} 测评 ${currentYear}` : `${offer.brand} Review ${currentYear}`,
    content: astroBody,
    astroBody,
  };
}

// =============================================================================
// Section helpers
// =============================================================================

function headerNavSection({ siteName, navLinks, ctaText, ctaUrl, variant = "sticky", activeRoute }) {
  const links = activeRoute
    ? navLinks.map((l) => (l.href === activeRoute ? { ...l, active: true } : l))
    : navLinks;
  return {
    component: "HeaderNav",
    props: {
      brand: siteName,
      links,
      ...(ctaText && ctaUrl ? { primaryCta: { text: ctaText, href: ctaUrl } } : {}),
      variant: "default",
    },
  };
}

function announcementSection(a) {
  return { component: "AnnouncementBar", props: a };
}

function disclosureSectionFor(textValue, variant, t) {
  return {
    component: "AffiliateDisclosure",
    props: {
      text: textValue || (t.hub?.disclosureText || "This site contains affiliate links."),
      variant,
      position: variant === "highlighted" ? "inline" : "top",
    },
  };
}

function footerFullSection({ siteName, description, t }) {
  return {
    component: "FooterFull",
    props: {
      brand: siteName,
      tagline: description,
      groups: [
        {
          heading: t.nav?.reviews || "Reviews",
          links: [
            { text: t.reviews || "Reviews", href: "/reviews/" },
            { text: t.nav?.about || "About", href: "/about/" },
          ],
        },
        {
          heading: t.nav?.legal || "Legal",
          links: [
            { text: t.nav?.disclosure || "Disclosure", href: "/disclosure/" },
            { text: t.nav?.privacy || "Privacy", href: "/privacy/" },
            { text: t.nav?.terms || "Terms", href: "/terms/" },
          ],
        },
      ],
      year: new Date().getFullYear(),
      rights: t.support?.footerNote || "All rights reserved.",
    },
  };
}

// =============================================================================
// Data adapters
// =============================================================================

function offerToBrandEntry(o, t) {
  return {
    brand: o.brand,
    slug: o.slug,
    category: o.category,
    logo: o.logo || undefined,
    shortDescription: o.shortDescription,
    score: o.score,
    dealText: o.hasExplicitDealText ? o.dealText : undefined,
    price: o.price || undefined,
    reviewHref: `/reviews/${o.slug}/`,
    affiliateUrl: o.affiliateUrl || o.website,
    visitLabel: o.hasAffiliateUrl
      ? (t.reviewPage?.visit || "Visit")
      : (t.reviewPage?.officialSite || "Official site"),
    pros: o.pros && o.pros.length > 0 ? o.pros : undefined,
  };
}

function deriveRatings(offer, t, zh) {
  // If the offer carries an explicit per-dimension breakdown, use it.
  const explicit = offer.rating_breakdown || offer.ratingBreakdown || offer.scores;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit
      .map((r) => {
        if (!isRecord(r)) return null;
        const label = text(r.label, r.name);
        const score = Number(r.score ?? r.value);
        if (!label || !Number.isFinite(score)) return null;
        return {
          label,
          score,
          max: typeof r.max === "number" ? r.max : 10,
          ...(text(r.description) ? { description: text(r.description) } : {}),
        };
      })
      .filter(Boolean);
  }
  if (isRecord(explicit)) {
    return Object.entries(explicit)
      .filter(([, v]) => Number.isFinite(Number(v)))
      .map(([k, v]) => ({ label: k, score: Number(v), max: 10 }));
  }
  // No explicit breakdown — return empty; producer skips RatingBreakdown.
  return [];
}

function specsArrayFromObject(specs) {
  if (!isRecord(specs)) return [];
  return Object.entries(specs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([label, value]) => ({ label: String(label), value: String(value) }));
}

// =============================================================================
// Normalize helpers — nav / announcement
// =============================================================================

function defaultNavLinks(t) {
  return [
    { text: t.home, href: "/" },
    { text: t.reviews, href: "/reviews/" },
    { text: t.nav?.about || "About", href: "/about/" },
  ];
}

function normalizeNavLinks(input, t) {
  if (Array.isArray(input.nav_links) && input.nav_links.length > 0) {
    return input.nav_links
      .map((l) => ({
        text: text(l && (l.text || l.label || l.name)),
        href: text(l && (l.href || l.url)) || "#",
      }))
      .filter((l) => l.text);
  }
  return defaultNavLinks(t);
}

function normalizeAnnouncement(input, t) {
  const raw = input.announcement;
  if (!raw) return null;
  if (typeof raw === "string") {
    const v = raw.trim();
    if (!v) return null;
    return { text: v, variant: "primary" };
  }
  if (!isRecord(raw)) return null;
  const v = text(raw.text, raw.message);
  if (!v) return null;
  const link = isRecord(raw.link)
    ? { text: text(raw.link.text, t.cta?.learnMore || "Learn more"), href: text(raw.link.href) || "#" }
    : null;
  return { text: v, ...(link ? { link } : {}), variant: text(raw.variant) || "primary" };
}

// =============================================================================
// Low-level helpers
// =============================================================================

function mergeRecords(...values) {
  return Object.assign({}, ...values.filter(isRecord));
}

function chooseVariant(...values) {
  for (const value of values) {
    const variant = text(value);
    if (variants.has(variant)) return variant;
  }
  return defaultVariant;
}

function isRecord(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function text(...values) {
  for (const v of values) {
    if (v == null) continue;
    const out = String(v).trim();
    if (out) return out;
  }
  return "";
}

function format(template, values = {}) {
  return String(template || "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = values[key];
    return value == null ? "" : String(value);
  });
}

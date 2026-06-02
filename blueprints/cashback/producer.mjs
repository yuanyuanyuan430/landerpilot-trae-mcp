import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
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

export async function produce({ input = {} } = {}) {
  const language = normalizeLanguage(input);
  const t = loadBlueprintI18n(blueprintRoot, language);
  const zh = isChineseLanguage(language);
  const profile = mergeRecords(input.company, input.business, input.publisher);
  const siteName = text(input.site_name, input.siteName, profile.name, "Cashback Site");
  const siteUrl = siteUrlFromDomain(
    input.domain,
    normalizeUrl(input.site_url || input.siteUrl, "https://example.com")
  );
  const description = toSentence(
    text(input.site_description, input.description, profile.description),
    zh
      ? `${siteName} 汇总商家返现、优惠券和购物分类。`
      : `${siteName} helps shoppers find cashback, coupons, and store offers.`
  );

  const offers = normalizeOffers(input, {
    blueprint: "cashback",
    defaultCategory: zh ? "精选" : "Featured",
    requireInputData: true,
  });
  const groups = groupOffersByCategory(offers);

  const industry = resolveIndustryTheme(text(input.industry, input.theme_industry) || "ecommerce");
  const industryId = industry?.id || "ecommerce";
  const dataTheme = `ganhuo-${industryId}`;

  const today = new Date();
  const dateDisplay = today.toLocaleDateString(zh ? "zh-CN" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const totalCoupons = offers.reduce((sum, o) => sum + (o.couponCount || 0), 0);
  const navLinks = normalizeNavLinks(input, t);
  const announcement = normalizeAnnouncement(input, t);
  const disclosureText = text(input.disclosure_text, input.disclosure, t.disclosureText);

  const heroTitle = text(
    input.hero_title,
    zh
      ? `${siteName}：覆盖 ${offers.length}+ 商家的返现与优惠`
      : `${siteName}: cashback and coupons across ${offers.length}+ stores`
  );
  const heroSubtitle = text(
    input.hero_subtitle,
    zh
      ? `比较 ${offers.length} 个商家的返现比例和当前优惠摘要，下单前在目标站点确认条款。`
      : `Compare cashback rates and current deals from ${offers.length} curated stores. Verify final terms on the destination site.`
  );
  const ctaText = text(input.cta_text, t.cta?.browseStores, zh ? "浏览全部商家" : "Browse all stores");

  // -------- landing (index) sections --------
  const landingSections = buildLandingSections({
    siteName,
    description,
    heroTitle,
    heroSubtitle,
    ctaText,
    offers,
    groups,
    totalCoupons,
    navLinks,
    announcement,
    disclosureText,
    t,
    zh,
  });

  // -------- stores listing --------
  const storesIndexSections = buildStoresIndexSections({
    siteName,
    offers,
    navLinks,
    announcement,
    disclosureText,
    t,
    zh,
  });

  // -------- categories listing --------
  const categoriesIndexSections = buildCategoriesIndexSections({
    siteName,
    groups,
    navLinks,
    announcement,
    disclosureText,
    t,
    zh,
  });

  // -------- per-store pages --------
  const storePages = offers.map((offer) => {
    const related = offers.filter((o) => o.slug !== offer.slug).slice(0, 6);
    return buildStorePage({
      offer,
      related,
      siteName,
      siteUrl,
      language,
      dataTheme,
      navLinks,
      announcement,
      disclosureText,
      dateDisplay,
      description,
      t,
      zh,
    });
  });

  // -------- per-category pages --------
  const categoryPages = groups.map((group) => {
    return buildCategoryPage({
      group,
      siteName,
      siteUrl,
      language,
      dataTheme,
      navLinks,
      announcement,
      disclosureText,
      description,
      t,
      zh,
    });
  });

  // -------- support pages --------
  const supportPagePaths = [
    ["about", t.support.aboutTitle, description, null],
    ["contact", t.support.contactTitle, format(t.support.contactDescription, { siteName }), null],
    ["privacy", t.support.privacyTitle, t.support.privacyDescription, null],
    ["terms", t.support.termsTitle, t.support.termsDescription, null],
    ["disclosure", t.support.disclosureTitle, disclosureText || t.support.disclosureDescription, "disclosure"],
  ];

  const supportPages = supportPagePaths.map(([route, title, supportDescription, kind]) => {
    const sections = [];
    if (announcement) sections.push(announcementSection(announcement));
    sections.push(headerNavSection({ siteName, navLinks, ctaText, ctaUrl: "/stores/" }));
    if (disclosureText && route !== "disclosure") {
      sections.push(disclosureSectionFor(disclosureText, "subtle"));
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
      sections.push(disclosureSectionFor(disclosureText || supportDescription, "highlighted"));
    }
    sections.push(footerFullSection({ siteName, description, t }));

    const head = renderHeadHtml({
      title: `${title} - ${siteName}`,
      description: supportDescription,
      canonicalUrl: `${siteUrl}/${route}/`,
    });

    const astroBody = renderAstroPage({
      lang: language,
      dataTheme,
      headHtml: head,
      cssImport: "../../styles/global.css",
      componentsImportRoot: "../../components/sections",
      sections,
      metadata: { blueprint: "cashback", route, industry: industryId },
    });

    return { route, title: `${title} - ${siteName}`, content: astroBody, astroBody };
  });

  // -------- assemble main page heads --------
  const metaTitle = truncateText(
    text(input.meta_title, zh ? `${siteName} - 返现与优惠券` : `${siteName} - Cashback and Coupons`),
    68
  );
  const metaDescription = truncateText(text(input.meta_description, description), 158);

  const indexHead = renderHeadHtml({
    title: metaTitle,
    description: metaDescription,
    canonicalUrl: `${siteUrl}/`,
    schemaJson: safeJsonForInlineScript({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteName,
      url: `${siteUrl}/`,
      description,
    }),
  });
  const indexAstro = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: indexHead,
    cssImport: "../styles/global.css",
    componentsImportRoot: "../components/sections",
    sections: landingSections,
    metadata: { blueprint: "cashback", route: "index", industry: industryId },
  });

  const storesIndexHead = renderHeadHtml({
    title: `${siteName} ${t.stores}`,
    description: t.directory.allStoresDescription,
    canonicalUrl: `${siteUrl}/stores/`,
  });
  const storesIndexAstro = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: storesIndexHead,
    cssImport: "../../styles/global.css",
    componentsImportRoot: "../../components/sections",
    sections: storesIndexSections,
    metadata: { blueprint: "cashback", route: "stores", industry: industryId },
  });

  const categoriesIndexHead = renderHeadHtml({
    title: `${siteName} ${t.categories}`,
    description: t.directory.allCategoriesDescription,
    canonicalUrl: `${siteUrl}/categories/`,
  });
  const categoriesIndexAstro = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: categoriesIndexHead,
    cssImport: "../../styles/global.css",
    componentsImportRoot: "../../components/sections",
    sections: categoriesIndexSections,
    metadata: { blueprint: "cashback", route: "categories", industry: industryId },
  });

  const pages = [
    { route: "index", title: siteName, content: indexAstro, astroBody: indexAstro },
    {
      route: "stores",
      title: `${siteName} ${t.stores}`,
      content: storesIndexAstro,
      astroBody: storesIndexAstro,
    },
    {
      route: "categories",
      title: `${siteName} ${t.categories}`,
      content: categoriesIndexAstro,
      astroBody: categoriesIndexAstro,
    },
    ...storePages,
    ...categoryPages,
    ...supportPages,
  ];

  return {
    blueprint: "cashback",
    variant: "cashback-directory",
    title: siteName,
    description,
    pages,
    theme: { industry: industryId },
    summary: {
      siteName,
      language,
      industry: industryId,
      storeCount: offers.length,
      categoryCount: groups.length,
      couponCount: totalCoupons,
      pageCount: pages.length,
    },
  };
}

// =============================================================================
// Landing page (index)
// =============================================================================

function buildLandingSections({ siteName, description, heroTitle, heroSubtitle, ctaText, offers, groups, totalCoupons, navLinks, announcement, disclosureText, t, zh }) {
  const list = [];
  if (announcement) list.push(announcementSection(announcement));
  list.push(headerNavSection({ siteName, navLinks, ctaText, ctaUrl: "/stores/" }));
  if (disclosureText) list.push(disclosureSectionFor(disclosureText, "subtle"));

  list.push({
    component: "HeroSplit",
    props: {
      brand: siteName,
      title: heroTitle,
      subtitle: heroSubtitle,
      primaryCta: { text: ctaText, href: "/stores/" },
      secondaryCta: { text: zh ? "查看分类" : "Browse categories", href: "/categories/" },
    },
  });

  list.push({
    component: "StatsStrip",
    props: {
      stats: [
        { value: String(offers.length), label: zh ? "已收录商家" : "Curated stores" },
        { value: String(groups.length), label: zh ? "分类" : "Categories" },
        { value: String(totalCoupons), label: zh ? "活跃优惠券" : "Active coupons" },
        { value: zh ? "每日更新" : "Daily", label: zh ? "刷新频率" : "Refresh cadence" },
      ],
      bordered: true,
    },
  });

  list.push({
    component: "CategoryGrid",
    props: {
      eyebrow: zh ? "浏览" : "Browse",
      title: zh ? "按分类购物" : "Shop by category",
      categories: groups.map((g) => ({
        name: g.category,
        slug: g.slug,
        href: `/categories/${g.slug}/`,
        storeCount: g.offers.length,
        icon: categoryIcon(g.category),
      })),
      layout: groups.length <= 4 ? "grid" : "chips",
      columns: groups.length <= 4 ? Math.max(2, Math.min(4, groups.length)) : 4,
      storeCountSuffix: zh ? "家商家" : "stores",
    },
  });

  list.push({
    component: "StoreGrid",
    purpose: "store-grid-featured",
    props: {
      eyebrow: zh ? "精选商家" : "Featured",
      title: zh ? "本周热门返现" : "Popular this week",
      stores: offers.slice(0, 9).map((o) => offerToStoreEntry(o, zh)),
      layout: "grid",
      columns: 3,
      visitLabel: zh ? "前往商家" : "Visit store",
      detailLabel: zh ? "查看详情" : "View deals",
      couponLabel: zh ? "张优惠券" : "coupons",
    },
  });

  list.push({
    component: "ProcessSteps",
    purpose: "method",
    props: {
      eyebrow: zh ? "怎么用" : "How it works",
      title: zh ? "拿到返现，三步就够" : "Get your cashback in three steps",
      description: zh
        ? "选商家、点链接、像平常一样购物，返现自动入账。"
        : "Pick a store, click through, shop as usual — cashback lands automatically.",
      steps: [
        {
          title: zh ? "选择商家" : "Pick a store",
          description: zh
            ? `从 ${offers.length}+ 个已整理商家中找心仪的目的地。`
            : `Browse ${offers.length}+ curated stores and pick a destination.`,
        },
        {
          title: zh ? "点击跳转" : "Click through",
          description: zh
            ? "通过我们的合作链接前往商家官网（不会增加任何价格）。"
            : "Visit the merchant via our partner link — no markup on prices.",
        },
        {
          title: zh ? "等待入账" : "Cashback lands",
          description: zh
            ? "完成消费后，返现按各商家政策结算到你的余额。"
            : "After purchase clears, cashback posts per each merchant's policy.",
        },
      ],
      layout: "horizontal",
      numbered: true,
    },
  });

  const top = pickTopRateOffer(offers);
  if (top) {
    list.push({
      component: "CashbackRateCard",
      props: {
        eyebrow: zh ? `${top.brand} 当前最高` : `Top offer • ${top.brand}`,
        rate: top.cashbackRate || (zh ? "返现优惠" : "Cashback offer"),
        rateLabel: zh ? `在 ${top.brand} 购物` : `Shop at ${top.brand}`,
        description: top.dealText || top.shortDescription,
        primaryCta: {
          text: zh ? `前往 ${top.brand}` : `Visit ${top.brand}`,
          href: top.affiliateUrl || top.website || `/stores/${top.slug}/`,
        },
        secondaryCta: { text: zh ? "查看详情" : "View deals", href: `/stores/${top.slug}/` },
        variant: "band",
      },
    });
  }

  list.push(footerFullSection({ siteName, description, t }));
  return list;
}

// =============================================================================
// Stores index page
// =============================================================================

function buildStoresIndexSections({ siteName, offers, navLinks, announcement, disclosureText, t, zh }) {
  const list = [];
  if (announcement) list.push(announcementSection(announcement));
  list.push(headerNavSection({ siteName, navLinks, ctaText: t.cta?.browseStores || "/stores/", ctaUrl: "/stores/" }));
  if (disclosureText) list.push(disclosureSectionFor(disclosureText, "subtle"));
  list.push({
    component: "PageHero",
    props: {
      eyebrow: siteName,
      title: t.directory.allStoresTitle,
      description: t.directory.allStoresDescription,
      breadcrumbs: [
        { text: t.home, href: "/" },
        { text: t.stores },
      ],
      background: "tinted",
    },
  });
  list.push({
    component: "StoreGrid",
    props: {
      stores: offers.map((o) => offerToStoreEntry(o, zh)),
      layout: "list",
      visitLabel: zh ? "前往" : "Visit",
      detailLabel: zh ? "详情" : "Deals",
      couponLabel: zh ? "张" : "coupons",
    },
  });
  list.push(footerFullSection({ siteName, description: "", t }));
  return list;
}

// =============================================================================
// Categories index page
// =============================================================================

function buildCategoriesIndexSections({ siteName, groups, navLinks, announcement, disclosureText, t, zh }) {
  const list = [];
  if (announcement) list.push(announcementSection(announcement));
  list.push(headerNavSection({ siteName, navLinks, ctaText: t.cta?.browseStores, ctaUrl: "/stores/" }));
  if (disclosureText) list.push(disclosureSectionFor(disclosureText, "subtle"));
  list.push({
    component: "PageHero",
    props: {
      eyebrow: siteName,
      title: t.directory.allCategoriesTitle,
      description: t.directory.allCategoriesDescription,
      breadcrumbs: [
        { text: t.home, href: "/" },
        { text: t.categories },
      ],
      background: "tinted",
    },
  });
  list.push({
    component: "CategoryGrid",
    props: {
      categories: groups.map((g) => ({
        name: g.category,
        slug: g.slug,
        href: `/categories/${g.slug}/`,
        storeCount: g.offers.length,
        icon: categoryIcon(g.category),
        description: zh
          ? `${g.offers.length} 家 ${g.category} 商家。`
          : `${g.offers.length} ${g.category.toLowerCase()} stores.`,
      })),
      layout: "grid",
      columns: groups.length >= 4 ? 4 : Math.max(2, groups.length),
      storeCountSuffix: zh ? "家商家" : "stores",
    },
  });
  list.push(footerFullSection({ siteName, description: "", t }));
  return list;
}

// =============================================================================
// Per-store page
// =============================================================================

function buildStorePage({ offer, related, siteName, siteUrl, language, dataTheme, navLinks, announcement, disclosureText, dateDisplay, description, t, zh }) {
  const canonicalUrl = `${siteUrl}/stores/${offer.slug}/`;
  const ctaUrl = offer.affiliateUrl || offer.website || "/";
  const visitLabel = offer.hasAffiliateUrl
    ? (zh ? `前往 ${offer.brand}` : `Visit ${offer.brand}`)
    : (zh ? `访问 ${offer.brand} 官网` : `Visit ${offer.brand} official site`);
  const pageTitle = zh
    ? `${offer.brand} 返现与优惠券`
    : `${offer.brand} Coupons & Cashback`;

  const sections = [];
  if (announcement) sections.push(announcementSection(announcement));
  sections.push(headerNavSection({ siteName, navLinks, ctaText: visitLabel, ctaUrl }));
  if (disclosureText) sections.push(disclosureSectionFor(disclosureText, "subtle"));
  sections.push({
    component: "Breadcrumb",
    props: {
      items: [
        { text: t.home, href: "/" },
        { text: t.stores, href: "/stores/" },
        { text: offer.brand },
      ],
      bordered: true,
    },
  });
  sections.push({
    component: "StoreHero",
    props: {
      eyebrow: t.stores,
      store: offer.brand,
      title: pageTitle,
      description: offer.shortDescription,
      cashbackRate: offer.cashbackRate || undefined,
      cashbackLabel: zh ? "返现比例" : "Cashback rate",
      rateNote: offer.dealText && offer.hasExplicitDealText ? offer.dealText : undefined,
      logo: offer.logo || undefined,
      category: offer.category,
      couponCount: offer.couponCount,
      couponLabel: zh ? "张优惠券" : "active coupons",
      updatedDate: dateDisplay,
      primaryCta: {
        text: visitLabel,
        href: ctaUrl,
        rel: offer.hasAffiliateUrl ? "sponsored noopener" : "noopener",
      },
    },
  });

  const couponList = normalizeCouponsForList(offer, zh);
  if (couponList.length > 0) {
    sections.push({
      component: "CouponList",
      props: {
        eyebrow: zh ? "活跃优惠" : "Active offers",
        title: zh ? `${offer.brand} 当前优惠` : `${offer.brand} deals right now`,
        coupons: couponList,
        ctaLabel: zh ? "前往使用" : "Get deal",
        copyLabel: zh ? "复制优惠码" : "Copy code",
        expiryPrefix: zh ? "有效期至" : "Expires",
      },
    });
  }

  sections.push({
    component: "ProcessSteps",
    purpose: "method",
    props: {
      eyebrow: zh ? "如何拿到返现" : "How to claim",
      title: zh
        ? `在 ${offer.brand} 拿到返现的三步`
        : `Three steps to ${offer.brand} cashback`,
      steps: [
        {
          title: zh ? "点击下方按钮" : "Click through",
          description: zh
            ? `通过 ${siteName} 的合作链接前往 ${offer.brand}。`
            : `Visit ${offer.brand} via the ${siteName} partner link.`,
        },
        {
          title: zh ? "完成购物" : "Shop as usual",
          description: zh
            ? "正常添加购物车并下单，价格不会因为合作链接而变动。"
            : "Add items, check out — prices stay the same through the affiliate link.",
        },
        {
          title: zh ? "等待结算" : "Cashback lands",
          description: zh
            ? `订单清算后，${offer.cashbackRate || "返现"}会按 ${offer.brand} 政策入账。`
            : `After the order clears, ${offer.cashbackRate || "cashback"} posts per ${offer.brand}'s policy.`,
        },
      ],
      layout: "horizontal",
      numbered: true,
    },
  });

  if (related.length > 0) {
    sections.push({
      component: "StoreGrid",
      purpose: "related-stores",
      props: {
        title: zh ? "你可能也喜欢" : "You might also like",
        stores: related.map((o) => offerToStoreEntry(o, zh)),
        layout: "compact",
        visitLabel: zh ? "前往" : "Visit",
        couponLabel: zh ? "张" : "coupons",
      },
    });
  }

  sections.push({
    component: "CTABand",
    props: {
      title: zh ? `准备在 ${offer.brand} 下单了吗？` : `Ready to shop ${offer.brand}?`,
      description: offer.dealText || offer.shortDescription,
      cta: { text: visitLabel, href: ctaUrl },
      variant: "dark",
    },
  });
  sections.push(disclosureSectionFor(disclosureText || (zh ? "本站包含联盟链接。" : "This site contains affiliate links."), "subtle"));
  sections.push(footerFullSection({ siteName, description, t }));

  const head = renderHeadHtml({
    title: `${pageTitle} | ${siteName}`,
    description: offer.shortDescription,
    canonicalUrl,
    ogImage: offer.image || offer.logo,
    schemaJson: safeJsonForInlineScript({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: offer.brand,
      url: offer.website || offer.affiliateUrl,
      logo: offer.logo,
    }),
  });

  const astroBody = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: head,
    cssImport: "../../../styles/global.css",
    componentsImportRoot: "../../../components/sections",
    sections,
    metadata: { blueprint: "cashback", route: `stores/${offer.slug}`, store: offer.brand },
  });

  return {
    route: `stores/${offer.slug}`,
    title: pageTitle,
    content: astroBody,
    astroBody,
  };
}

// =============================================================================
// Per-category page
// =============================================================================

function buildCategoryPage({ group, siteName, siteUrl, language, dataTheme, navLinks, announcement, disclosureText, description, t, zh }) {
  const canonicalUrl = `${siteUrl}/categories/${group.slug}/`;
  const sections = [];
  if (announcement) sections.push(announcementSection(announcement));
  sections.push(headerNavSection({ siteName, navLinks, ctaText: t.cta?.browseStores, ctaUrl: "/stores/" }));
  if (disclosureText) sections.push(disclosureSectionFor(disclosureText, "subtle"));
  sections.push({
    component: "Breadcrumb",
    props: {
      items: [
        { text: t.home, href: "/" },
        { text: t.categories, href: "/categories/" },
        { text: group.category },
      ],
      bordered: true,
    },
  });
  sections.push({
    component: "PageHero",
    props: {
      eyebrow: t.categories,
      title: zh ? `${group.category} 返现与优惠` : `${group.category} cashback and deals`,
      description: zh
        ? `${group.offers.length} 家 ${group.category} 商家，按返现率排序。`
        : `${group.offers.length} ${group.category.toLowerCase()} stores, sorted by cashback rate.`,
      background: "default",
    },
  });
  sections.push({
    component: "StoreGrid",
    props: {
      stores: group.offers.map((o) => offerToStoreEntry(o, zh)),
      layout: "grid",
      columns: group.offers.length >= 3 ? 3 : Math.max(2, group.offers.length),
      visitLabel: zh ? "前往" : "Visit",
      detailLabel: zh ? "详情" : "Deals",
      couponLabel: zh ? "张" : "coupons",
    },
  });
  sections.push(footerFullSection({ siteName, description, t }));

  const head = renderHeadHtml({
    title: `${group.category} - ${siteName}`,
    description: zh
      ? `${group.category} 商家的返现比例与优惠摘要。`
      : `Cashback rates and offers for ${group.category.toLowerCase()} stores.`,
    canonicalUrl,
  });

  const astroBody = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: head,
    cssImport: "../../../styles/global.css",
    componentsImportRoot: "../../../components/sections",
    sections,
    metadata: { blueprint: "cashback", route: `categories/${group.slug}`, category: group.category },
  });

  return {
    route: `categories/${group.slug}`,
    title: `${group.category} - ${siteName}`,
    content: astroBody,
    astroBody,
  };
}

// =============================================================================
// Section helpers
// =============================================================================

function headerNavSection({ siteName, navLinks, ctaText, ctaUrl }) {
  return {
    component: "HeaderNav",
    props: {
      brand: siteName,
      links: navLinks,
      ...(ctaText && ctaUrl ? { primaryCta: { text: ctaText, href: ctaUrl } } : {}),
      variant: "default",
    },
  };
}

function announcementSection(a) {
  return { component: "AnnouncementBar", props: a };
}

function disclosureSectionFor(textValue, variant) {
  return {
    component: "AffiliateDisclosure",
    props: {
      text: textValue,
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
          heading: t.directory?.allStoresTitle || "Stores",
          links: [
            { text: t.stores, href: "/stores/" },
            { text: t.categories, href: "/categories/" },
          ],
        },
        {
          heading: t.nav?.legal || "Legal",
          links: [
            { text: t.nav?.about || "About", href: "/about/" },
            { text: t.nav?.contact || "Contact", href: "/contact/" },
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

function offerToStoreEntry(o, zh) {
  return {
    store: o.brand,
    slug: o.slug,
    category: o.category,
    logo: o.logo || undefined,
    shortDescription: o.shortDescription,
    cashbackRate: o.cashbackRate || undefined,
    couponCount: o.couponCount || 0,
    dealText: o.hasExplicitDealText ? o.dealText : undefined,
    storeHref: `/stores/${o.slug}/`,
    affiliateUrl: o.affiliateUrl || o.website || undefined,
    visitLabel: o.hasAffiliateUrl
      ? (zh ? "前往" : "Visit")
      : (zh ? "官网" : "Official"),
  };
}

function normalizeCouponsForList(offer, zh) {
  const list = [];
  if (Array.isArray(offer.coupons) && offer.coupons.length > 0) {
    for (const c of offer.coupons) {
      if (!isRecord(c)) continue;
      const code = text(c.code, c.coupon_code, c.couponCode);
      const title = text(c.title, c.headline, c.name);
      const desc = text(c.description, c.text, c.body);
      const expiry = text(c.expiry, c.expires, c.expire_date, c.expiresAt);
      const href = text(c.href, c.url, c.link) || offer.affiliateUrl;
      const discount = text(c.discount, c.amount, c.rate);
      const type = code ? "code" : text(c.type) === "cashback" ? "cashback" : "deal";
      if (!code && !title && !desc) continue;
      list.push({
        ...(code ? { code } : {}),
        ...(title ? { title } : {}),
        ...(desc ? { description: desc } : {}),
        ...(expiry ? { expiry } : {}),
        ...(href ? { href } : {}),
        ...(discount ? { discount } : {}),
        type,
      });
    }
  }
  if (list.length === 0 && offer.hasExplicitDealText) {
    list.push({
      title: offer.dealText,
      type: "deal",
      discount: offer.cashbackRate || (zh ? "优惠" : "Deal"),
      href: offer.affiliateUrl,
    });
  }
  if (list.length === 0 && offer.cashbackRate) {
    list.push({
      title: zh
        ? `在 ${offer.brand} 享受 ${offer.cashbackRate} 返现`
        : `Earn ${offer.cashbackRate} cashback at ${offer.brand}`,
      type: "cashback",
      discount: offer.cashbackRate,
      href: offer.affiliateUrl,
    });
  }
  return list;
}

function pickTopRateOffer(offers) {
  if (!offers || offers.length === 0) return null;
  const scored = offers
    .map((o) => ({ offer: o, rate: parseRate(o.cashbackRate) }))
    .filter((s) => s.rate > 0)
    .sort((a, b) => b.rate - a.rate);
  return scored[0]?.offer || offers[0];
}

function parseRate(value) {
  const v = String(value ?? "");
  const match = v.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function categoryIcon(category) {
  const c = String(category || "").toLowerCase();
  if (/travel|hotel|flight/.test(c)) return "✈";
  if (/fashion|apparel|cloth|shoe/.test(c)) return "✂";
  if (/electronic|tech|gadget|phone|computer/.test(c)) return "⚡";
  if (/home|furnitur|decor|kitchen/.test(c)) return "▦";
  if (/food|grocer|restaur/.test(c)) return "▽";
  if (/beauty|cosmet|skincare/.test(c)) return "✿";
  if (/health|wellness|fitness/.test(c)) return "+";
  return "★";
}

// =============================================================================
// Normalize helpers
// =============================================================================

function defaultNavLinks(t) {
  return [
    { text: t.home, href: "/" },
    { text: t.stores, href: "/stores/" },
    { text: t.categories, href: "/categories/" },
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

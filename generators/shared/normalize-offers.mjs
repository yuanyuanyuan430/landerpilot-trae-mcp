import { ensureArray, placeholderLogoDataUri, toSentence, truncateText, uniqueValues } from "./html.mjs";
import { createUniqueSlug, domainFromUrl, normalizeUrl, slugify } from "./slug.mjs";

const URL_RE = /https?:\/\/[^\s)]+/gi;

export function normalizeOffers(input = {}, options = {}) {
  const rawOffers = readOfferInput(input);
  const defaultCategory = input.category || options.defaultCategory || "Featured";

  if (options.requireInputData && !isDemoMode(input)) {
    assertUsableOfferInput(rawOffers, options.blueprint);
  }

  const normalized = rawOffers.map((offer, index) =>
    normalizeOffer(offer, {
      index,
      defaultCategory,
      siteName: input.site_name || input.siteName || "LanderPilot",
      language: input.language || input.lang || input.locale,
    })
  );
  if (normalized.length > 0) return ensureUniqueOfferSlugs(normalized);

  return ensureUniqueOfferSlugs([
    normalizeOffer(
      {
        brand: input.site_name || input.siteName || "Example Brand",
        website: input.domain ? `https://${input.domain}` : "https://example.com",
        description: input.site_description || input.description || "A generated offer ready for review.",
        category: defaultCategory,
      },
      {
        index: 0,
        defaultCategory,
        siteName: input.site_name || input.siteName || "LanderPilot",
        language: input.language || input.lang || input.locale,
      }
    ),
  ]);
}

export function isDemoMode(input = {}) {
  return input.demo_mode === true || input.demoMode === true;
}

function readOfferInput(input) {
  return Array.isArray(input.offers) && input.offers.length > 0
    ? input.offers
    : parseRawTextOffers(input.raw_text || input.rawText || "");
}

function assertUsableOfferInput(rawOffers, blueprint) {
  if (!Array.isArray(rawOffers) || rawOffers.length === 0) {
    throw new Error(missingOfferDataMessage(blueprint));
  }
  const invalidIndex = rawOffers.findIndex((offer) => !hasRequiredOfferFields(offer));
  if (invalidIndex >= 0) {
    throw new Error(missingOfferDataMessage(blueprint, invalidIndex));
  }
  const incompleteIndex = rawOffers.findIndex((offer) => !hasBlueprintRequiredFields(offer, blueprint));
  if (incompleteIndex >= 0) {
    throw new Error(missingOfferDataMessage(blueprint, incompleteIndex));
  }
}

function hasRequiredOfferFields(offer) {
  return Boolean(explicitOfferName(offer) && explicitOfferUrl(offer));
}

function explicitOfferName(offer) {
  if (!offer || typeof offer !== "object") return "";
  return firstText(offer.brand, offer.name, offer.title, offer.product, offer.store);
}

function explicitOfferUrl(offer) {
  if (!offer || typeof offer !== "object") return "";
  return normalizeUrl(firstText(...officialUrlValues(offer), ...affiliateUrlValues(offer)), "");
}

function hasBlueprintRequiredFields(offer, blueprint) {
  if (blueprint !== "cashback") return true;
  return Boolean(
    firstText(...affiliateUrlValues(offer)) &&
      firstText(offer.cashback_rate, offer.cashbackRate, offer.reward) &&
      hasExplicitCouponOrDeal(offer)
  );
}

function hasExplicitCouponOrDeal(offer) {
  if (!offer || typeof offer !== "object") return false;
  if (Array.isArray(offer.coupons) && offer.coupons.length > 0) return true;
  if (Array.isArray(offer.deals) && offer.deals.length > 0) return true;
  if (firstText(offer.deal_text, offer.dealText, offer.discount, offer.coupon_code, offer.couponCode)) return true;
  return Number(offer.coupon_count ?? offer.couponCount) > 0;
}

function missingOfferDataMessage(blueprint, invalidIndex) {
  const label = blueprint ? `LanderPilot ${blueprint}` : "This LanderPilot data-driven blueprint";
  const rowHint = Number.isInteger(invalidIndex)
    ? ` Row ${invalidIndex + 1} is missing a required name or URL.`
    : "";
  return [
    `${label} requires brand/store data before generation.`,
    `Provide offers[] or parseable raw_text where every brand/store row includes a name plus official, store, or affiliate URL.${rowHint}`,
    blueprint === "cashback"
      ? "Cashback rows also require an affiliate URL, cashback_rate, and either coupon_count, coupons[], deals[], or deal_text so static pages do not invent savings."
      : "",
    "For uploaded CSV, Excel, JSON, Markdown, or TXT files, read and normalize the file into offers[] before running generate-site.",
    "Set demo_mode: true only when the user explicitly asks for sample/demo data.",
  ].filter(Boolean).join(" ");
}

export function normalizeOffer(offer = {}, options = {}) {
  if (!offer || typeof offer !== "object") offer = {};
  const zh = isChineseLanguage(options.language);
  const brand = firstText(
    offer.brand,
    offer.name,
    offer.title,
    offer.product,
    offer.store,
    zh ? `品牌 ${options.index + 1}` : `Brand ${options.index + 1}`
  );
  const website = normalizeUrl(firstText(...officialUrlValues(offer)), "");
  const explicitAffiliateUrl = normalizeUrl(firstText(...affiliateUrlValues(offer)), "");
  const affiliateUrl = normalizeUrl(
    firstText(...affiliateUrlValues(offer)),
    website || "https://example.com"
  );
  const domain = domainFromUrl(website || affiliateUrl);
  const category = firstText(offer.category, options.defaultCategory, "Featured");
  const description = toSentence(
    firstText(offer.description, offer.summary, offer.notes),
    zh
      ? `${brand} 是为这个站点整理的 ${category} 选项。`
      : `${brand} is a ${category.toLowerCase()} option selected for this generated site.`
  );
  const slug = slugify(firstText(offer.slug, brand), `offer-${options.index + 1}`);
  const score = clampScore(Number(offer.score || offer.rating || 8.4 - options.index * 0.1));
  const cashbackRate = firstText(
    offer.cashback_rate,
    offer.cashbackRate,
    offer.reward,
    inferCashbackRate(description),
    zh ? "最高 5%" : "Up to 5%"
  );
  const explicitCouponCount = Number(offer.coupon_count ?? offer.couponCount);
  const coupons = normalizeCoupons(offer.coupons, offer.deals);
  const explicitDealText = firstText(offer.deal_text, offer.dealText, offer.discount, offer.coupon_code, offer.couponCode);
  const couponCount = Math.max(
    Number.isFinite(explicitCouponCount) ? explicitCouponCount : 0,
    coupons.length,
    explicitDealText ? 1 : 0
  );

  return {
    brand,
    slug,
    website,
    affiliateUrl,
    hasAffiliateUrl: Boolean(explicitAffiliateUrl),
    domain,
    category,
    description,
    shortDescription: truncateText(description, 118),
    logo: firstText(offer.logo, offer.image, offer.brand_logo, offer.brandLogo) || placeholderLogoDataUri(brand),
    image: firstText(offer.image, offer.hero_image, offer.og_image) || placeholderLogoDataUri(brand),
    price: firstText(offer.price, offer.price_text, ""),
    dealText: firstText(
      offer.deal_text,
      offer.dealText,
      offer.discount,
      cashbackRate || (zh ? "当前精选优惠" : "Best current deal")
    ),
    hasExplicitDealText: Boolean(explicitDealText),
    coupons,
    cashbackRate,
    couponCount,
    score,
    pros: normalizeBullets(offer.pros, defaultPros(brand, category, zh)),
    cons: normalizeBullets(offer.cons, defaultCons(brand, zh)),
    specs: normalizeSpecs(
      offer.specs,
      zh
        ? { "分类": category, "网站": domain || brand, "适合": category }
        : { Category: category, Website: domain || brand, "Best for": category }
    ),
    faq: normalizeFaq(offer.faq, offer.faqs),
  };
}

function officialUrlValues(offer) {
  return [
    offer.website,
    offer.url,
    offer.store_url,
    offer.storeUrl,
    offer.official_url,
    offer.officialUrl,
    offer.official,
    offer.product_url,
    offer.productUrl,
  ];
}

function affiliateUrlValues(offer) {
  return [
    offer.affiliate_url,
    offer.affiliateUrl,
    offer.affiliate,
    offer.cta_url,
    offer.ctaUrl,
    offer.link,
    offer.offer_url,
    offer.offerUrl,
    offer.deal_url,
    offer.dealUrl,
  ];
}

export function groupOffersByCategory(offers) {
  const categories = uniqueValues(offers.map((offer) => offer.category));
  const usedSlugs = new Set();
  return categories.map((category) => ({
    category,
    slug: createUniqueSlug(category, `category-${usedSlugs.size + 1}`, usedSlugs),
    offers: offers.filter((offer) => offer.category.toLowerCase() === category.toLowerCase()),
  }));
}

function ensureUniqueOfferSlugs(offers) {
  const usedSlugs = new Set();
  return offers.map((offer, index) => ({
    ...offer,
    slug: createUniqueSlug(offer.slug || offer.brand, `offer-${index + 1}`, usedSlugs),
  }));
}

export function parseRawTextOffers(rawText) {
  const lines = String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const offers = [];
  let current = null;
  let pendingGlobalCategory = "";

  for (const line of lines) {
    const category = line.match(/^category\s*:\s*(.+)$/i)?.[1]?.trim();
    if (category) {
      if (current) current.category = category;
      pendingGlobalCategory = category;
      continue;
    }

    const cashback = line.match(/^cashback\s+rate\s*:\s*(.+)$/i)?.[1]?.trim();
    if (cashback && current) {
      current.cashback_rate = cashback;
      continue;
    }

    const couponCount = line.match(/^coupon\s+count\s*:\s*(\d+)$/i)?.[1]?.trim();
    if (couponCount && current) {
      current.coupon_count = Number(couponCount);
      continue;
    }

    const dealText = line.match(/^(?:deal|coupon|discount)\s*:\s*(.+)$/i)?.[1]?.trim();
    if (dealText && current) {
      current.deal_text = dealText;
      continue;
    }

    const price = line.match(/^price\s*:\s*(.+)$/i)?.[1]?.trim();
    if (price && current) {
      current.price = price;
      continue;
    }

    const cta = line.match(/^cta\s+(https?:\/\/\S+)/i)?.[1];
    if (cta && current) {
      current.affiliate_url = cleanUrl(cta);
      continue;
    }

    if (looksLikeOfferLine(line)) {
      current = parseOfferLine(line, offers.length);
      if (pendingGlobalCategory && !current.category) current.category = pendingGlobalCategory;
      offers.push(current);
      continue;
    }

    if (current) {
      current.description = [current.description, line].filter(Boolean).join(" ");
    }
  }

  if (pendingGlobalCategory) {
    for (const offer of offers) {
      if (!offer.category) offer.category = pendingGlobalCategory;
    }
  }

  return offers;
}

function parseOfferLine(line, index) {
  const urls = extractUrls(line);
  const officialMatch = line.match(/official\s+(https?:\/\/\S+)/i);
  const affiliateMatch = line.match(/affiliate\s+(https?:\/\/\S+)/i);
  const beforeUrl = line.split(/https?:\/\//i)[0].trim();
  const brand = beforeUrl
    .replace(/[-*•]/g, " ")
    .replace(/\bofficial\b|\baffiliate\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    brand,
    website: cleanUrl(officialMatch?.[1] || urls[0] || ""),
    affiliate_url: cleanUrl(affiliateMatch?.[1] || urls[1] || urls[0] || ""),
  };
}

function looksLikeOfferLine(line) {
  return extractUrls(line).length > 0 && /(^|[\s:])(official|affiliate|https?:\/\/)/i.test(line);
}

function extractUrls(value) {
  URL_RE.lastIndex = 0;
  const urls = [];
  let match;
  while ((match = URL_RE.exec(String(value ?? ""))) !== null) {
    urls.push(cleanUrl(match[0]));
  }
  URL_RE.lastIndex = 0;
  return urls;
}

function cleanUrl(value) {
  return normalizeUrl(String(value ?? "").trim().replace(/[),.;]+$/g, ""), "");
}

function firstText(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeBullets(value, fallback) {
  const items = ensureArray(value)
    .flatMap((item) => String(item).split(/\n|;/))
    .map((item) => item.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function normalizeSpecs(value, fallback) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return fallback;
}

function normalizeCoupons(...values) {
  return values
    .flatMap((value) => ensureArray(value))
    .map((item) => {
      if (item && typeof item === "object") {
        return {
          title: firstText(item.title, item.name, item.code, item.coupon_code, item.couponCode),
          description: firstText(item.description, item.text, item.summary, item.terms),
          code: firstText(item.code, item.coupon_code, item.couponCode),
          expires: firstText(item.expires, item.expires_at, item.expiresAt, item.expiration),
          url: normalizeUrl(firstText(item.url, item.affiliate_url, item.affiliateUrl, item.link), ""),
        };
      }
      return { title: firstText(item), description: "", code: "", expires: "", url: "" };
    })
    .filter((item) => item.title || item.description || item.code);
}

function normalizeFaq(...values) {
  return values
    .flatMap((value) => ensureArray(value))
    .map((item) => {
      if (item && typeof item === "object") {
        return {
          question: firstText(item.question, item.q, item.title),
          answer: firstText(item.answer, item.a, item.description, item.text),
        };
      }
      const [question, answer] = String(item).split(/\s*\|\s*/);
      return { question: firstText(question), answer: firstText(answer) };
    })
    .filter((item) => item.question && item.answer);
}

function defaultPros(brand, category, zh) {
  return zh
    ? [
        `适合正在对比 ${category} 的用户`,
        `${brand} 有清晰的官方访问入口`,
        "关键优惠信息便于快速比较",
      ]
    : [
        `Clear fit for ${category.toLowerCase()} shoppers`,
        `${brand} has a direct official destination`,
        "Useful offer details can be compared quickly",
      ];
}

function defaultCons(brand, zh) {
  return zh
    ? [
        `${brand} 的价格和优惠可能变化`,
        "不同地区的可用性可能不同",
        "购买前需要确认最终条款",
      ]
    : [
        `${brand} pricing and promos can change`,
        "Availability may vary by region",
        "Always verify final terms before purchase",
      ];
}

function inferCashbackRate(text) {
  return String(text ?? "").match(/(?:up\s+to\s+)?\d+(?:\.\d+)?%/i)?.[0] || "";
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 8.4;
  return Math.max(6, Math.min(9.8, Math.round(value * 10) / 10));
}

function isChineseLanguage(language) {
  return String(language || "").toLowerCase().startsWith("zh");
}

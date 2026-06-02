import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureArray,
  placeholderVisualDataUri,
  safeJsonForInlineScript,
  toSentence,
  truncateText,
} from "../../generators/shared/html.mjs";
import {
  loadBlueprintI18n,
  normalizeLanguage,
} from "../../generators/shared/i18n.mjs";
import { normalizeUrl, siteUrlFromDomain } from "../../generators/shared/slug.mjs";
import {
  renderAstroPage,
  renderHeadHtml,
} from "../../generators/shared/render-astro-page.mjs";
import { resolveIndustryTheme } from "../../generators/shared/industry-themes/index.mjs";

const blueprintRoot = dirname(fileURLToPath(import.meta.url));
const variants = new Set(["corporate-saas", "corporate-minimal"]);

export async function produce({ input = {} } = {}) {
  const language = normalizeLanguage(input);
  const t = loadBlueprintI18n(blueprintRoot, language);
  const profile = mergeRecords(input.company, input.business, input.product, input.organization);
  const siteName = text(input.site_name, input.siteName, input.name, profile.name, "LanderPilot Site");
  const siteUrl = siteUrlFromDomain(
    input.domain,
    normalizeUrl(input.site_url || input.siteUrl, "https://example.com")
  );
  const description = toSentence(
    text(
      input.site_description,
      input.siteDescription,
      input.description,
      profile.description,
      profile.summary
    ),
    format(t.defaults.description, { siteName })
  );
  const variant = chooseVariant(input.variant, input.template_variant, input.template);
  const industry = resolveIndustryTheme(text(input.industry, input.theme_industry, input.template_industry));
  const industryId = industry?.id || "saas";
  const dataTheme = `ganhuo-${industryId}`;

  const contactEmail = text(input.contact_email, input.email, profile.contact_email, profile.email);
  const contactHref = contactEmail
    ? `mailto:${contactEmail}`
    : normalizeHref(text(input.contact_url, profile.contact_url), "/contact/");
  const ctaUrl = normalizeHref(
    text(input.hero_cta_url, input.cta_url, input.url, profile.cta_url, profile.url),
    contactHref
  );
  const ctaText = text(
    input.hero_cta_text,
    input.cta_text,
    input.cta_primary,
    input.primary_cta,
    profile.cta_primary,
    profile.ctaPrimary,
    profile.cta,
    t.cta.getStarted,
    t.getStarted
  );
  const secondaryCtaText = text(
    input.hero_demo_text,
    input.cta_secondary,
    input.secondary_cta,
    profile.cta_secondary,
    profile.ctaSecondary,
    t.cta.viewFeatures
  );
  const demoUrl = normalizeHref(
    text(input.hero_demo_url, input.cta_secondary_url, profile.cta_secondary_url),
    "#features"
  );
  const heroTitle = text(
    input.hero_title,
    input.headline,
    input.tagline,
    profile.hero_title,
    profile.headline,
    profile.tagline,
    format(t.defaults.heroTitle, { siteName })
  );
  const heroSubtitle = text(
    input.hero_subtitle,
    input.hero_description,
    input.subtitle,
    profile.hero_subtitle,
    profile.subtitle,
    profile.description,
    description
  );
  const heroImage = text(input.hero_image, placeholderVisualDataUri(`${siteName} Dashboard`));

  const features = normalizeFeatures(input, profile, t);
  const stats = normalizeStats(input, profile);
  const integrations = normalizeIntegrations(input, profile);
  const pricing = normalizePricingPlans(normalizePricingSource(input, profile));
  const processSteps = normalizeProcessSteps(input, profile, t);
  const testimonials = normalizeTestimonials(input, profile, t);

  const ctaTitle = text(input.cta_title, format(t.defaults.ctaTitle, { siteName }));
  const ctaDescription = text(input.cta_description, description);
  const ctaButtonText = text(input.cta_button_text, ctaText);
  const ctaButtonUrl = normalizeHref(input.cta_button_url, ctaUrl);

  const aboutTitle = text(input.about_title, format(t.defaults.aboutTitle, { siteName }));
  const aboutDescription = text(input.about_description, description);

  const navLinks = normalizeNavLinks(input, t, {
    hasProcess: processSteps.length > 0,
    hasIntegrations: integrations.length > 0,
  });
  const announcement = normalizeAnnouncement(input, t);
  const team = normalizeTeam(input, profile);
  const contactFields = normalizeContactFields(input);

  const sections = variant === "corporate-minimal"
    ? buildMinimalSections({
        siteName,
        heroTitle,
        heroSubtitle,
        ctaText,
        ctaUrl,
        ctaTitle,
        ctaDescription,
        ctaButtonText,
        ctaButtonUrl,
        features,
        aboutTitle,
        aboutDescription,
        navLinks,
        announcement,
        team,
        t,
      })
    : buildSaasSections({
        siteName,
        heroTitle,
        heroSubtitle,
        ctaText,
        secondaryCtaText,
        ctaUrl,
        demoUrl,
        heroImage,
        features,
        stats,
        integrations,
        pricing,
        processSteps,
        testimonials,
        ctaTitle,
        ctaDescription,
        ctaButtonText,
        ctaButtonUrl,
        description,
        navLinks,
        announcement,
        team,
        t,
      });

  const metaTitle = truncateText(
    text(input.meta_title, profile.meta_title, `${siteName} - ${heroTitle}`),
    68
  );
  const metaDescription = truncateText(text(input.meta_description, description), 158);
  const ogImage = text(input.og_image, input.hero_image, placeholderVisualDataUri(siteName));

  const schemaJson = safeJsonForInlineScript({
    "@context": "https://schema.org",
    "@type": variant === "corporate-saas" ? "SoftwareApplication" : "Organization",
    name: siteName,
    url: `${siteUrl}/`,
    applicationCategory: variant === "corporate-saas" ? "BusinessApplication" : undefined,
    description,
    offers:
      variant === "corporate-saas"
        ? { "@type": "AggregateOffer", priceCurrency: "USD" }
        : undefined,
    logo: text(input.site_logo, input.logo, undefined),
  });

  const organizationSchemaJson = safeJsonForInlineScript({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: `${siteUrl}/`,
    logo: text(input.site_logo, input.logo, undefined),
    description,
  });

  const indexHead = renderHeadHtml({
    title: metaTitle,
    description: metaDescription,
    canonicalUrl: `${siteUrl}/`,
    ogImage,
    schemaJson,
    organizationSchemaJson,
  });

  const indexAstro = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: indexHead,
    cssImport: "../styles/global.css",
    componentsImportRoot: "../components/sections",
    sections,
    metadata: {
      blueprint: "corporate",
      route: "index",
      variant,
      industry: industryId,
    },
  });

  const supportPagePaths = [
    ["about", format(t.support.aboutTitle, { siteName }), aboutDescription],
    [
      "contact",
      t.support.contactTitle,
      format(t.support.contactDescription, { siteName }),
      contactHref,
      contactEmail || text(input.contact_label, input.contact_url, profile.contact_label, t.cta.contactTeam),
    ],
    ["privacy", t.support.privacyTitle, t.support.privacyDescription],
    ["terms", t.support.termsTitle, t.support.termsDescription],
  ];

  const supportPages = supportPagePaths.map(([route, title, supportDescription, actionHref, actionLabel]) => {
    const supportSections = [];
    if (announcement) supportSections.push(announcementSection(announcement));
    supportSections.push(
      headerNavSection({
        siteName,
        navLinks,
        ctaText: ctaButtonText,
        ctaUrl: ctaButtonUrl,
        variant: "default",
      })
    );
    supportSections.push(
      pageHeroSection({
        siteName,
        title,
        description: supportDescription,
        breadcrumbs: [
          { text: t.nav.home || "Home", href: "/" },
          { text: title },
        ],
        t,
      })
    );

    // Contact page: replace generic CTA with a real ContactForm if the user
    // gave us fields. Otherwise fall back to the actionHref link.
    if (route === "contact" && contactFields && contactFields.length > 0) {
      supportSections.push(
        contactFormSection({
          contactFields,
          ctaUrl: ctaButtonUrl,
          contactEmail: actionHref && actionHref.startsWith("mailto:") ? actionHref.replace(/^mailto:/, "") : null,
          t,
          layout: "split",
        })
      );
    } else if (route === "contact") {
      supportSections.push({
        component: "CTABand",
        props: {
          title: actionLabel || t.cta.contactTeam,
          description: supportDescription,
          cta: { text: actionLabel || t.cta.contactTeam, href: actionHref || "/" },
          variant: "tinted",
        },
      });
    }

    // About page: append team grid when team data exists.
    if (route === "about" && team.length > 0) {
      supportSections.push(aboutTeamSection({ team, t }));
    }

    supportSections.push(
      variant === "corporate-minimal"
        ? footerMinimalSection({ siteName, t })
        : footerFullSection({ siteName, description, t })
    );

    const supportHead = renderHeadHtml({
      title: `${title} - ${siteName}`,
      description: supportDescription,
      canonicalUrl: `${siteUrl}/${route}/`,
    });

    const supportAstro = renderAstroPage({
      lang: language,
      dataTheme,
      headHtml: supportHead,
      cssImport: "../../styles/global.css",
      componentsImportRoot: "../../components/sections",
      sections: supportSections,
      metadata: {
        blueprint: "corporate",
        route,
        variant,
        industry: industryId,
      },
    });

    return {
      route,
      title: `${title} - ${siteName}`,
      content: supportAstro,
      astroBody: supportAstro,
    };
  });

  const pages = [
    {
      route: "index",
      title: siteName,
      content: indexAstro,
      astroBody: indexAstro,
    },
    ...supportPages,
  ];

  const renderedSections = sections.map((s) => s.purpose || sectionCategory(s.component));
  const warnings = corporateWarnings(input, profile, {
    siteUrl,
    ctaUrl,
    hasPricing: pricing.plans.length > 0,
    hasStats: stats.length > 0,
    hasIntegrations: integrations.length > 0,
  });

  return {
    blueprint: "corporate",
    variant,
    title: siteName,
    description,
    pages,
    warnings,
    theme: { industry: industryId },
    summary: {
      siteName,
      variant,
      language,
      industry: industryId,
      pageCount: pages.length,
      sections: renderedSections,
      featureCount: features.length,
      pricingPlanCount: variant === "corporate-minimal" ? 0 : pricing.plans.length || 3,
      processStepCount: processSteps.length,
      testimonialCount: testimonials.length,
    },
  };
}

// =============================================================================
// Section builders — pure functions: data + i18n → { component, props }
// =============================================================================

function buildSaasSections({
  siteName,
  heroTitle,
  heroSubtitle,
  ctaText,
  secondaryCtaText,
  ctaUrl,
  demoUrl,
  heroImage,
  features,
  stats,
  integrations,
  pricing,
  processSteps,
  testimonials,
  ctaTitle,
  ctaDescription,
  ctaButtonText,
  ctaButtonUrl,
  description,
  navLinks,
  announcement,
  team,
  t,
}) {
  const list = [];

  if (announcement) list.push(announcementSection(announcement));
  list.push(
    headerNavSection({
      siteName,
      navLinks,
      ctaText,
      ctaUrl,
      secondaryCta: secondaryCtaText ? { text: secondaryCtaText, href: demoUrl } : undefined,
      variant: "default",
    })
  );

  list.push({
    component: "HeroSplit",
    props: {
      brand: siteName,
      title: heroTitle,
      subtitle: heroSubtitle,
      primaryCta: { text: ctaText, href: ctaUrl },
      secondaryCta: { text: secondaryCtaText, href: demoUrl },
      ...(heroImage ? { image: { src: heroImage, alt: siteName } } : {}),
    },
  });

  const statsItems = statsForSection(stats, t);
  if (statsItems.length > 0) {
    list.push({
      component: "StatsStrip",
      props: { stats: statsItems },
    });
  }

  if (features.length > 0) {
    list.push({
      component: "FeaturesAlternating",
      props: {
        eyebrow: t.sections.features.kicker,
        title: t.sections.features.title,
        description: t.sections.features.description,
        items: features.slice(0, 4).map((feature, index) => ({
          index: pad2(index + 1),
          title: feature.title,
          description: feature.description,
          image: {
            src: placeholderVisualDataUri(`${siteName} ${feature.title}`),
            alt: feature.title,
          },
        })),
      },
    });
  }

  if (processSteps.length > 0) {
    list.push({
      component: "ProcessSteps",
      purpose: "process",
      props: {
        eyebrow: t.sections.process.kicker,
        title: t.sections.process.title,
        description: t.sections.process.description,
        steps: processSteps.slice(0, 4).map((step) => ({
          title: step.title,
          description: step.description,
        })),
        layout: processSteps.length >= 4 ? "horizontal" : "horizontal",
        numbered: true,
      },
    });
  }

  const integrationItems = integrationsForSection(integrations, t);
  if (integrationItems.length > 0) {
    list.push({
      component: "LogoCloud",
      props: {
        eyebrow: t.sections.integrations.kicker,
        title: t.sections.integrations.title,
        description: t.sections.integrations.description,
        items: integrationItems,
        variant: "chips",
      },
    });
  }

  list.push({
    component: "Pricing3Tier",
    props: {
      eyebrow: t.sections.pricing.kicker,
      title: t.sections.pricing.title,
      description: t.sections.pricing.description,
      plans: pricingForSection(pricing, ctaUrl, t),
    },
  });

  if (testimonials.length > 0) {
    list.push({
      component: "Testimonials",
      props: {
        eyebrow: t.sections.testimonials.kicker,
        title: t.sections.testimonials.title,
        description: t.sections.testimonials.description,
        items: testimonials.map((q) => ({
          quote: q.quote,
          name: q.name,
          ...(q.title ? { role: q.title } : {}),
        })),
      },
    });
  }

  if (Array.isArray(team) && team.length > 0) {
    list.push(aboutTeamSection({ team, t }));
  }

  list.push({
    component: "CTABand",
    props: {
      title: ctaTitle,
      description: ctaDescription,
      cta: { text: ctaButtonText, href: ctaButtonUrl },
      variant: "dark",
    },
  });

  list.push(footerFullSection({ siteName, description, t }));

  return list;
}

function buildMinimalSections({
  siteName,
  heroTitle,
  heroSubtitle,
  ctaText,
  ctaUrl,
  ctaTitle,
  ctaDescription,
  ctaButtonText,
  ctaButtonUrl,
  features,
  aboutDescription,
  navLinks,
  announcement,
  team,
  t,
}) {
  const list = [];
  if (announcement) list.push(announcementSection(announcement));
  list.push(
    headerNavSection({
      siteName,
      navLinks,
      ctaText,
      ctaUrl,
      variant: "default",
    })
  );
  list.push({
    component: "HeroCentered",
    props: {
      brand: siteName,
      title: heroTitle,
      subtitle: heroSubtitle,
      primaryCta: { text: ctaText, href: ctaUrl },
    },
  });
  list.push({
    component: "Features3Col",
    props: {
      items: features.slice(0, 3).map((feature) => ({
        title: feature.title,
        description: feature.description,
      })),
      variant: "minimal",
    },
  });
  if (Array.isArray(team) && team.length > 0) {
    list.push(aboutTeamSection({ team, t }));
  }
  list.push({
    component: "CTABand",
    props: {
      title: ctaTitle,
      description: ctaDescription || aboutDescription,
      cta: { text: ctaButtonText, href: ctaButtonUrl },
      variant: "tinted",
    },
  });
  list.push(footerMinimalSection({ siteName, t }));
  return list;
}

function footerFullSection({ siteName, description, t }) {
  return {
    component: "FooterFull",
    props: {
      brand: siteName,
      tagline: description,
      groups: [
        {
          heading: t.footer.product,
          links: [
            { text: t.nav.features, href: "#features" },
            { text: t.nav.pricing, href: "#pricing" },
            { text: t.nav.integrations, href: "#integrations" },
          ],
        },
        {
          heading: t.footer.company,
          links: [
            { text: t.nav.about, href: "/about/" },
            { text: t.nav.contact, href: "/contact/" },
          ],
        },
        {
          heading: t.footer.legal,
          links: [
            { text: t.footer.privacy, href: "/privacy/" },
            { text: t.footer.terms, href: "/terms/" },
          ],
        },
      ],
      year: new Date().getFullYear(),
      rights: t.footer.rights,
    },
  };
}

function footerMinimalSection({ siteName, t }) {
  return {
    component: "FooterMinimal",
    props: {
      brand: siteName,
      links: [
        { text: t.nav.features, href: "#features" },
        { text: t.nav.about, href: "/about/" },
        { text: t.footer.privacy, href: "/privacy/" },
        { text: t.footer.terms, href: "/terms/" },
      ],
      year: new Date().getFullYear(),
      rights: t.footer.rights,
    },
  };
}

// =============================================================================
// Data adapters — normalized data → section props
// =============================================================================

function statsForSection(rawStats, t) {
  const stats = rawStats.length > 0 ? rawStats : ensureArray(t?.defaults?.stats);
  if (stats.length === 0) return [];
  return stats.slice(0, 4).map((item) => {
    const value =
      item && typeof item === "object"
        ? text(item.value, item.number, item.metric)
        : String(item);
    const label =
      item && typeof item === "object"
        ? text(item.label, item.name, t?.defaults?.metricLabel)
        : t?.defaults?.metricLabel || "";
    return { value, label };
  });
}

function integrationsForSection(rawIntegrations, t) {
  const integrations = rawIntegrations.length > 0
    ? rawIntegrations
    : ensureArray(t?.defaults?.integrations);
  if (integrations.length === 0) return [];
  return integrations.slice(0, 8).map((item) => ({
    name:
      item && typeof item === "object"
        ? text(item.name, item.title)
        : String(item),
  }));
}

function pricingForSection(pricing, ctaUrl, t) {
  const plans = pricing.plans.length > 0 ? pricing.plans : ensureArray(t?.defaults?.pricingPlans);
  return plans.slice(0, 3).map((plan) => {
    const name = text(plan.name, plan.title, t.pricing.planFallback);
    const price = normalizePrice(plan.price, pricing.currency, "$0");
    const periodRaw = text(plan.period, pricing.period, t.pricing.periodFallback);
    const per = periodRaw ? (periodRaw.startsWith("/") ? periodRaw : `/${periodRaw}`) : undefined;
    const featured =
      isTruthyFlag(plan.featured) ||
      isTruthyFlag(plan.highlight) ||
      isTruthyFlag(plan.highlighted);
    const features = ensureArray(plan.features).length > 0
      ? ensureArray(plan.features)
      : [t.pricing.coreFeaturesIncluded];
    const cta = text(plan.cta, plan.cta_text, plan.button_text, `${t.pricing.choose} ${name}`);
    return {
      name,
      price,
      ...(per ? { per } : {}),
      ...(text(plan.description, plan.summary) ? { description: text(plan.description, plan.summary) } : {}),
      features: features.map(String),
      cta: { text: cta, href: normalizeUrl(text(plan.url, plan.cta_url), ctaUrl) },
      ...(featured ? { featured: true, badge: t.pricing.popular } : {}),
    };
  });
}

function sectionCategory(componentName) {
  const map = {
    HeroSplit: "hero",
    HeroCentered: "hero",
    StatsStrip: "stats",
    FeaturesAlternating: "features",
    Features3Col: "features",
    LogoCloud: "integrations",
    Pricing3Tier: "pricing",
    PricingCompare: "pricing",
    Testimonials: "testimonials",
    CTABand: "cta",
    FAQ: "faq",
    FooterFull: "footer",
    FooterMinimal: "footer",
  };
  return map[componentName] || componentName.toLowerCase();
}

// =============================================================================
// Normalize helpers — unchanged from previous producer; lifted here verbatim
// =============================================================================

function chooseVariant(...values) {
  for (const value of values) {
    const variant = text(value);
    if (variants.has(variant)) return variant;
  }
  return "corporate-saas";
}

function normalizeHref(value, fallback = "") {
  const textValue = text(value);
  if (!textValue) return fallback;
  if (/^(mailto:|tel:|#|\/)/i.test(textValue)) return textValue;
  return normalizeUrl(textValue, fallback);
}

function corporateWarnings(input, profile, facts) {
  const warnings = [];
  if (!text(input.domain, input.site_url, input.siteUrl)) {
    warnings.push(
      "domain-missing: canonical URL uses example.com until the customer provides a real domain."
    );
  }
  if (
    !text(
      input.hero_cta_url,
      input.cta_url,
      input.url,
      profile.cta_url,
      profile.url,
      input.contact_email,
      input.email
    )
  ) {
    warnings.push(
      "cta-fallback: primary CTA points to the generated contact page until a real booking/contact URL is provided."
    );
  }
  if (!facts.hasPricing)
    warnings.push(
      "pricing-draft: pricing cards use draft defaults and must be replaced or removed before publishing."
    );
  if (!facts.hasStats)
    warnings.push(
      "stats-draft: stat blocks use draft defaults and must be replaced or removed before publishing."
    );
  if (!facts.hasIntegrations)
    warnings.push(
      "integrations-draft: integration chips use draft defaults and must be replaced before publishing."
    );
  return warnings;
}

function normalizeFeatures(input, profile, t) {
  const raw = firstNonEmptyArray(
    input.features,
    profile.features,
    input.capabilities,
    profile.capabilities,
    featuresFromRawText(input.raw_text || "")
  );
  const features = raw.map((item, index) => {
    if (item && typeof item === "object") {
      return {
        title: text(item.title, item.name, format(t.defaults.capabilityTitle, { index: index + 1 })),
        description: text(
          item.description,
          item.text,
          item.summary,
          t.defaults.capabilityDescription
        ),
      };
    }
    return {
      title: text(item, format(t.defaults.capabilityTitle, { index: index + 1 })),
      description: t.defaults.capabilityPromiseDescription,
    };
  });
  return features.length > 0 ? features.slice(0, 6) : t.defaults.features;
}

function featuresFromRawText(rawText) {
  const match = String(rawText).match(/features?\s*:\s*(.+)/i);
  if (!match) return [];
  return match[1]
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeStats(input, profile) {
  return firstNonEmptyArray(input.stats, profile.stats, input.metrics, profile.metrics);
}

function normalizeIntegrations(input, profile) {
  return firstNonEmptyArray(input.integrations, profile.integrations);
}

function normalizePricingSource(input, profile) {
  return firstValue(
    input.pricing,
    profile.pricing,
    input.plans,
    profile.plans,
    input.tiers,
    profile.tiers
  );
}

function normalizePricingPlans(value) {
  const config = isRecord(value) ? value : {};
  const plans = firstNonEmptyArray(
    config.tiers,
    config.plans,
    config.items,
    isRecord(value) && (value.name || value.title || value.price) ? [value] : [],
    Array.isArray(value) ? value : []
  );
  return {
    plans,
    currency: text(config.currency, "$"),
    period: text(config.period, config.interval, ""),
  };
}

function normalizeProcessSteps(input, profile, t) {
  return firstNonEmptyArray(
    input.how_it_works,
    profile.how_it_works,
    input.process,
    profile.process,
    input.steps,
    profile.steps
  )
    .map((item, index) => {
      if (isRecord(item)) {
        return {
          step: text(item.step, item.number, String(index + 1)),
          title: text(item.title, item.name, format(t.process.stepTitle, { index: index + 1 })),
          description: text(item.description, item.text, item.summary),
        };
      }
      return {
        step: String(index + 1),
        title: text(item, format(t.process.stepTitle, { index: index + 1 })),
        description: "",
      };
    })
    .slice(0, 4);
}

function normalizeTestimonials(input, profile, t) {
  return firstNonEmptyArray(
    input.testimonials,
    profile.testimonials,
    input.quotes,
    profile.quotes
  )
    .map((item) => {
      if (isRecord(item)) {
        return {
          quote: text(item.quote, item.text, item.content),
          name: text(item.name, item.author, t.testimonials.customer),
          title: text(item.title, item.role, item.company),
        };
      }
      return { quote: text(item), name: t.testimonials.customer, title: "" };
    })
    .filter((item) => item.quote)
    .slice(0, 3);
}

function normalizePrice(value, currency, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return `${currency}${value}`;
  return text(value, fallback);
}

function isTruthyFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|yes|1)$/i.test(value.trim());
  return Boolean(value);
}

function firstValue(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isRecord(value) && Object.keys(value).length === 0) continue;
    return value;
  }
  return undefined;
}

function firstNonEmptyArray(...values) {
  for (const value of values) {
    const array = ensureArray(value).filter((item) => item !== "" && item != null);
    if (array.length > 0) return array;
  }
  return [];
}

function mergeRecords(...values) {
  return Object.assign({}, ...values.filter(isRecord));
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(...values) {
  for (const value of values) {
    if (value == null) continue;
    const out = String(value).trim();
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

// =============================================================================
// v2 B2 normalize helpers — nav links / announcement / team / contact fields
// =============================================================================

function defaultNavLinks(t, opts = {}) {
  const links = [{ text: t.nav.features, href: "#features" }];
  if (opts.hasProcess) links.push({ text: t.nav.process, href: "#process" });
  if (opts.hasIntegrations) links.push({ text: t.nav.integrations, href: "#integrations" });
  links.push({ text: t.nav.pricing, href: "#pricing" });
  links.push({ text: t.nav.contact, href: "/contact/" });
  return links;
}

function normalizeNavLinks(input, t, opts) {
  if (Array.isArray(input.nav_links) && input.nav_links.length > 0) {
    return input.nav_links
      .map((l) => ({
        text: text(l && (l.text || l.label || l.name)),
        href: text(l && (l.href || l.url)) || "#",
      }))
      .filter((l) => l.text);
  }
  return defaultNavLinks(t, opts);
}

function normalizeAnnouncement(input, t) {
  const raw = input.announcement;
  if (!raw) return null;
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) return null;
    return { text: value, variant: "primary" };
  }
  if (!isRecord(raw)) return null;
  const value = text(raw.text, raw.message, raw.content);
  if (!value) return null;
  const link = raw.link && isRecord(raw.link)
    ? {
        text: text(raw.link.text, raw.link.label, t?.announcement?.linkText || "Learn more"),
        href: text(raw.link.href, raw.link.url) || "#",
      }
    : null;
  return {
    text: value,
    ...(link ? { link } : {}),
    variant: text(raw.variant) || "primary",
  };
}

function normalizeTeam(input, profile) {
  const raw = firstNonEmptyArray(input.team, profile.team, input.members, profile.members);
  return raw
    .map((m) => {
      if (!isRecord(m)) return null;
      const name = text(m.name);
      if (!name) return null;
      const out = {
        name,
        role: text(m.role, m.title, m.position) || "",
      };
      const bio = text(m.bio, m.description, m.summary);
      if (bio) out.bio = bio;
      const avatarSrc = text(m.avatar && (m.avatar.src || m.avatar), m.image && (m.image.src || m.image), m.photo);
      if (avatarSrc) {
        out.avatar = { src: avatarSrc, alt: text(m.avatar && m.avatar.alt, m.image && m.image.alt, name) };
      }
      if (Array.isArray(m.links) && m.links.length > 0) {
        out.links = m.links
          .map((l) => {
            if (!isRecord(l)) return null;
            const href = text(l.href, l.url);
            if (!href) return null;
            return {
              label: text(l.label, l.text, l.icon, "Link"),
              href,
              icon: text(l.icon) || undefined,
            };
          })
          .filter(Boolean);
      }
      return out;
    })
    .filter(Boolean);
}

function normalizeContactFields(input) {
  const raw = input.contact_fields ?? input.contactFields;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw
    .map((f) => {
      if (!isRecord(f)) return null;
      const name = text(f.name);
      const label = text(f.label, f.name);
      if (!name || !label) return null;
      const out = {
        name,
        label,
        type: text(f.type) || "text",
        required: isTruthyFlag(f.required),
      };
      const placeholder = text(f.placeholder);
      if (placeholder) out.placeholder = placeholder;
      if (typeof f.rows === "number") out.rows = f.rows;
      if (Array.isArray(f.options)) {
        out.options = f.options
          .map((opt) =>
            isRecord(opt)
              ? { value: text(opt.value), label: text(opt.label, opt.value) }
              : { value: String(opt), label: String(opt) }
          )
          .filter((opt) => opt.value);
      }
      if (isTruthyFlag(f.fullWidth ?? f.full_width)) out.fullWidth = true;
      return out;
    })
    .filter(Boolean);
}

// =============================================================================
// v2 B2 section builders
// =============================================================================

function headerNavSection({ siteName, navLinks, ctaText, ctaUrl, secondaryCta, variant = "default" }) {
  return {
    component: "HeaderNav",
    props: {
      brand: siteName,
      links: navLinks,
      ...(ctaText && ctaUrl ? { primaryCta: { text: ctaText, href: ctaUrl } } : {}),
      ...(secondaryCta ? { secondaryCta } : {}),
      variant,
    },
  };
}

function announcementSection(announcement) {
  return {
    component: "AnnouncementBar",
    props: announcement,
  };
}

function aboutTeamSection({ team, t, columns }) {
  return {
    component: "AboutTeam",
    purpose: "team",
    props: {
      eyebrow: t.sections.team.kicker,
      title: t.sections.team.title,
      description: t.sections.team.description,
      members: team,
      columns: columns || (team.length >= 4 ? 4 : team.length >= 3 ? 3 : 2),
    },
  };
}

function contactFormSection({ contactFields, ctaUrl, contactEmail, t, layout = "split" }) {
  const items = [];
  if (contactEmail) items.push({ label: "Email", value: contactEmail });
  return {
    component: "ContactForm",
    purpose: "contact-form",
    props: {
      eyebrow: t.sections.contact.kicker,
      title: t.sections.contact.title,
      description: t.sections.contact.description,
      fields: contactFields,
      submitText: t.sections.contact.submitText,
      layout,
      ...(layout === "split" && items.length > 0 ? { splitContent: { items } } : {}),
    },
  };
}

function pageHeroSection({ siteName, title, description, breadcrumbs, t }) {
  return {
    component: "PageHero",
    props: {
      eyebrow: siteName,
      title,
      ...(description ? { description } : {}),
      ...(breadcrumbs ? { breadcrumbs } : {}),
      background: "tinted",
    },
  };
}

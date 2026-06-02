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
} from "../../generators/shared/i18n.mjs";
import { normalizeUrl, siteUrlFromDomain, slugify } from "../../generators/shared/slug.mjs";
import {
  renderAstroPage,
  renderHeadHtml,
} from "../../generators/shared/render-astro-page.mjs";
import { resolveIndustryTheme } from "../../generators/shared/industry-themes/index.mjs";

const blueprintRoot = dirname(fileURLToPath(import.meta.url));
const variants = new Set(["blog-magazine", "blog-personal"]);

export async function produce({ input = {} } = {}) {
  const language = normalizeLanguage(input);
  const t = loadBlueprintI18n(blueprintRoot, language);
  const profile = mergeRecords(input.company, input.business, input.product, input.organization);
  const siteName = text(
    input.site_name,
    input.siteName,
    input.name,
    profile.name,
    "Field Notes"
  );
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
  const industry = resolveIndustryTheme(
    text(input.industry, input.theme_industry, input.template_industry) || "portfolio"
  );
  const industryId = industry?.id || "portfolio";
  const dataTheme = `ganhuo-${industryId}`;

  const contactEmail = text(input.contact_email, input.email, profile.contact_email, profile.email);
  const contactHref = contactEmail
    ? `mailto:${contactEmail}`
    : normalizeHref(text(input.contact_url, profile.contact_url), "/contact/");
  const aboutDescription = text(input.about_description, description);

  const posts = normalizePosts(input, t);
  const warnings = blogWarnings(input, posts);

  const navLinks = normalizeNavLinks(input, t);
  const announcement = normalizeAnnouncement(input, t);
  const team = normalizeTeam(input, profile);
  const contactFields = normalizeContactFields(input);

  const indexHeroTitle = text(input.hero_title, input.headline, format(t.defaults.indexHeroTitle, { siteName }));
  const indexHeroDescription = text(input.hero_description, input.tagline, format(t.defaults.indexHeroDescription, { siteName }), description);
  const ctaTitle = text(input.cta_title, format(t.defaults.ctaTitle, { siteName }));
  const ctaUrl = normalizeHref(text(input.cta_url, input.url, profile.cta_url), contactHref);
  const ctaText = text(input.cta_text, t.cta.subscribe);
  const newsletterAction = text(input.newsletter_action, "");

  const isPersonal = variant === "blog-personal";
  const footerSection = isPersonal
    ? footerMinimalSection({ siteName, t })
    : footerFullSection({ siteName, description, t });

  // -------- index page (blog list) --------
  const indexSections = [];
  if (announcement) indexSections.push(announcementSection(announcement));
  indexSections.push(
    headerNavSection({
      siteName,
      navLinks,
      ctaText,
      ctaUrl,
      variant: "default",
    })
  );
  indexSections.push({
    component: "PageHero",
    props: {
      eyebrow: t.sections.blog.kicker,
      title: indexHeroTitle,
      description: indexHeroDescription,
      align: "start",
      size: "compact",
      background: "default",
    },
  });
  if (posts.length > 0) {
    indexSections.push({
      component: "BlogList",
      props: {
        posts: posts.map(postToListEntry),
        layout: posts.length >= 4 ? "featured" : posts.length === 1 ? "list" : "grid",
        columns: 3,
      },
    });
  }
  indexSections.push(newsletterSection({ t, action: newsletterAction }));
  indexSections.push(footerSection);

  // -------- per-post pages --------
  const postPages = posts.map((post) => buildPostPage({
    post,
    siteName,
    siteUrl,
    language,
    dataTheme,
    navLinks,
    announcement,
    team,
    description,
    isPersonal,
    footerSection,
    t,
    newsletterAction,
  }));

  // -------- support pages --------
  const supportPagePaths = [
    ["about", format(t.support.aboutTitle, { siteName }), aboutDescription, null, null, /*append team*/ true],
    [
      "contact",
      t.support.contactTitle,
      format(t.support.contactDescription, { siteName }),
      contactHref,
      contactEmail || text(input.contact_label, t.cta.contactTeam),
      false,
    ],
    ["privacy", t.support.privacyTitle, t.support.privacyDescription, null, null, false],
    ["terms", t.support.termsTitle, t.support.termsDescription, null, null, false],
  ];

  const supportPages = supportPagePaths.map(([route, title, supportDescription, actionHref, actionLabel, appendTeam]) => {
    const sections = [];
    if (announcement) sections.push(announcementSection(announcement));
    sections.push(
      headerNavSection({
        siteName,
        navLinks,
        ctaText,
        ctaUrl,
        variant: "default",
      })
    );
    sections.push({
      component: "PageHero",
      props: {
        eyebrow: siteName,
        title,
        description: supportDescription,
        breadcrumbs: [
          { text: t.nav.home || "Home", href: "/" },
          { text: title },
        ],
        background: "tinted",
      },
    });

    if (route === "contact" && contactFields && contactFields.length > 0) {
      sections.push(contactFormSection({
        contactFields,
        contactEmail,
        t,
        layout: "split",
      }));
    } else if (route === "contact" && actionHref) {
      sections.push({
        component: "CTABand",
        props: {
          title: actionLabel || t.cta.contactTeam,
          description: supportDescription,
          cta: { text: actionLabel || t.cta.contactTeam, href: actionHref },
          variant: "tinted",
        },
      });
    }

    if (appendTeam && team.length > 0) {
      sections.push(aboutTeamSection({ team, t }));
    }

    sections.push(footerSection);

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
      metadata: { blueprint: "blog", route, variant, industry: industryId },
    });

    return {
      route,
      title: `${title} - ${siteName}`,
      content: astroBody,
      astroBody,
    };
  });

  // -------- assemble index page --------
  const metaTitle = truncateText(text(input.meta_title, `${siteName} — ${indexHeroDescription}`), 68);
  const metaDescription = truncateText(text(input.meta_description, indexHeroDescription, description), 158);

  const schemaJson = safeJsonForInlineScript({
    "@context": "https://schema.org",
    "@type": "Blog",
    name: siteName,
    url: `${siteUrl}/`,
    description,
    blogPost: posts.slice(0, 10).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${siteUrl}/blog/${p.slug}/`,
      datePublished: p.date,
      author: p.author ? { "@type": "Person", name: p.author.name } : undefined,
    })),
  });

  const indexHead = renderHeadHtml({
    title: metaTitle,
    description: metaDescription,
    canonicalUrl: `${siteUrl}/`,
    schemaJson,
  });

  const indexAstro = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: indexHead,
    cssImport: "../styles/global.css",
    componentsImportRoot: "../components/sections",
    sections: indexSections,
    metadata: { blueprint: "blog", route: "index", variant, industry: industryId },
  });

  const pages = [
    { route: "index", title: siteName, content: indexAstro, astroBody: indexAstro },
    ...postPages,
    ...supportPages,
  ];

  return {
    blueprint: "blog",
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
      postCount: posts.length,
      sections: indexSections.map((s) => s.purpose || sectionCategory(s.component)),
      hasTeam: team.length > 0,
      hasContactForm: !!(contactFields && contactFields.length > 0),
      hasAnnouncement: !!announcement,
    },
  };
}

// =============================================================================
// Per-post page builder
// =============================================================================

function buildPostPage({ post, siteName, siteUrl, language, dataTheme, navLinks, announcement, team, description, isPersonal, footerSection, t, newsletterAction }) {
  const sections = [];
  if (announcement) sections.push(announcementSection(announcement));
  sections.push(
    headerNavSection({
      siteName,
      navLinks,
      ctaText: t.cta.subscribe,
      ctaUrl: "#newsletter",
      variant: "default",
    })
  );
  sections.push({
    component: "Breadcrumb",
    props: {
      items: [
        { text: t.nav.home || "Home", href: "/" },
        { text: t.nav.blog, href: "/" },
        { text: post.title },
      ],
      bordered: true,
    },
  });
  sections.push({
    component: "BlogPost",
    props: {
      title: post.title,
      ...(post.excerpt ? { excerpt: post.excerpt } : {}),
      ...(post.category ? { category: post.category } : {}),
      ...(post.tags && post.tags.length > 0 ? { tags: post.tags } : {}),
      ...(post.date ? { date: post.date } : {}),
      ...(post.readingTime ? { readingTime: post.readingTime } : {}),
      ...(post.author ? { author: post.author } : {}),
      ...(post.cover ? { cover: post.cover } : {}),
      contentHtml: post.contentHtml || t.defaults.placeholderPostContent,
    },
  });
  sections.push(newsletterSection({ t, action: newsletterAction }));
  sections.push(footerSection);

  const canonicalUrl = `${siteUrl}/blog/${post.slug}/`;
  const head = renderHeadHtml({
    title: `${post.title} — ${siteName}`,
    description: post.excerpt || description,
    canonicalUrl,
    ...(post.cover ? { ogImage: post.cover.src } : {}),
    schemaJson: safeJsonForInlineScript({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      datePublished: post.date,
      url: canonicalUrl,
      ...(post.author ? { author: { "@type": "Person", name: post.author.name } } : {}),
      ...(post.cover ? { image: post.cover.src } : {}),
      description: post.excerpt || description,
    }),
  });

  const astroBody = renderAstroPage({
    lang: language,
    dataTheme,
    headHtml: head,
    cssImport: "../../../styles/global.css",
    componentsImportRoot: "../../../components/sections",
    sections,
    metadata: {
      blueprint: "blog",
      route: `blog/${post.slug}`,
      variant: "post",
      industry: dataTheme.replace(/^ganhuo-/, ""),
    },
  });

  return {
    route: `blog/${post.slug}`,
    title: `${post.title} — ${siteName}`,
    content: astroBody,
    astroBody,
  };
}

// =============================================================================
// Section helpers
// =============================================================================

function headerNavSection({ siteName, navLinks, ctaText, ctaUrl, variant = "default" }) {
  return {
    component: "HeaderNav",
    props: {
      brand: siteName,
      links: navLinks,
      ...(ctaText && ctaUrl ? { primaryCta: { text: ctaText, href: ctaUrl } } : {}),
      variant,
    },
  };
}

function announcementSection(announcement) {
  return { component: "AnnouncementBar", props: announcement };
}

function aboutTeamSection({ team, t }) {
  return {
    component: "AboutTeam",
    purpose: "team",
    props: {
      eyebrow: t.sections.team.kicker,
      title: t.sections.team.title,
      description: t.sections.team.description,
      members: team,
      columns: team.length >= 4 ? 4 : team.length >= 3 ? 3 : 2,
    },
  };
}

function contactFormSection({ contactFields, contactEmail, t, layout = "split" }) {
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

function newsletterSection({ t, action }) {
  return {
    component: "NewsletterSignup",
    props: {
      eyebrow: t.sections.newsletter.eyebrow,
      title: t.sections.newsletter.title,
      description: t.sections.newsletter.description,
      submitText: t.sections.newsletter.submitText,
      privacyNote: t.sections.newsletter.privacyNote,
      variant: "centered",
      ...(action ? { action } : {}),
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
          heading: t.footer.writing,
          links: [
            { text: t.nav.blog, href: "/" },
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
        { text: t.nav.about, href: "/about/" },
        { text: t.nav.contact, href: "/contact/" },
        { text: t.footer.privacy, href: "/privacy/" },
        { text: t.footer.terms, href: "/terms/" },
      ],
      year: new Date().getFullYear(),
      rights: t.footer.rights,
    },
  };
}

// =============================================================================
// Data adapters
// =============================================================================

function postToListEntry(post) {
  return {
    title: post.title,
    ...(post.excerpt ? { excerpt: post.excerpt } : {}),
    href: `/blog/${post.slug}/`,
    ...(post.cover ? { cover: post.cover } : {}),
    ...(post.category ? { category: post.category } : {}),
    ...(post.tags && post.tags.length > 0 ? { tags: post.tags } : {}),
    ...(post.date ? { date: post.date } : {}),
    ...(post.readingTime ? { readingTime: post.readingTime } : {}),
    ...(post.author ? { author: { name: post.author.name, avatar: post.author.avatar?.src } } : {}),
  };
}

function normalizePosts(input, t) {
  const raw = firstNonEmptyArray(input.posts, input.articles, input.entries);
  const used = new Set();
  return raw
    .map((p, idx) => normalizePost(p, idx, used, t))
    .filter(Boolean);
}

function normalizePost(p, idx, usedSlugs, t) {
  if (!isRecord(p)) return null;
  const title = text(p.title, p.headline, t.defaults.placeholderPostTitle);
  let slug = text(p.slug, p.url, slugify(title));
  slug = slug.replace(/^\/+|\/+$/g, "").replace(/^blog\//, "");
  if (!slug) slug = `post-${idx + 1}`;
  let unique = slug;
  let n = 2;
  while (usedSlugs.has(unique)) unique = `${slug}-${n++}`;
  usedSlugs.add(unique);

  const author = isRecord(p.author)
    ? {
        name: text(p.author.name, t.post.placeholderAuthor),
        ...(text(p.author.role, p.author.title) ? { role: text(p.author.role, p.author.title) } : {}),
        ...(text(p.author.avatar && (p.author.avatar.src || p.author.avatar))
          ? { avatar: { src: text(p.author.avatar && (p.author.avatar.src || p.author.avatar)), alt: text(p.author.avatar && p.author.avatar.alt, p.author.name) } }
          : {}),
      }
    : text(p.author)
      ? { name: text(p.author) }
      : null;

  const cover = isRecord(p.cover)
    ? {
        src: text(p.cover.src, p.cover.url),
        ...(text(p.cover.alt) ? { alt: text(p.cover.alt) } : { alt: title }),
        ...(text(p.cover.caption) ? { caption: text(p.cover.caption) } : {}),
      }
    : text(p.cover)
      ? { src: text(p.cover), alt: title }
      : null;

  const tags = ensureArray(p.tags).map((t) => text(t)).filter(Boolean);

  return {
    slug: unique,
    title,
    excerpt: text(p.excerpt, p.summary, p.description) || "",
    contentHtml: text(p.contentHtml, p.content, p.html, p.body) || t.defaults.placeholderPostContent,
    date: text(p.date, p.published, p.publishedAt, p.publish_date),
    readingTime: text(p.readingTime, p.reading_time, p.minutes),
    category: text(p.category, p.section),
    tags,
    author,
    cover,
  };
}

function blogWarnings(input, posts) {
  const warnings = [];
  if (!Array.isArray(input.posts) || input.posts.length === 0) {
    warnings.push("posts-missing: blueprint generated with placeholder posts; replace before publishing.");
  }
  const drafts = posts.filter((p) => !p.contentHtml || p.contentHtml.includes("Replace this placeholder"));
  if (drafts.length > 0) {
    warnings.push(`draft-posts: ${drafts.length} post(s) still use placeholder content.`);
  }
  if (!text(input.domain, input.site_url, input.siteUrl)) {
    warnings.push("domain-missing: canonical URLs use example.com until the customer provides a real domain.");
  }
  return warnings;
}

function defaultNavLinks(t) {
  return [
    { text: t.nav.blog, href: "/" },
    { text: t.nav.about, href: "/about/" },
    { text: t.nav.contact, href: "/contact/" },
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
    const value = raw.trim();
    if (!value) return null;
    return { text: value, variant: "primary" };
  }
  if (!isRecord(raw)) return null;
  const value = text(raw.text, raw.message);
  if (!value) return null;
  const link = isRecord(raw.link)
    ? { text: text(raw.link.text, t?.sections?.announcement?.linkText || "Read more"), href: text(raw.link.href) || "#" }
    : null;
  return {
    text: value,
    ...(link ? { link } : {}),
    variant: text(raw.variant) || "primary",
  };
}

function normalizeTeam(input, profile) {
  const raw = firstNonEmptyArray(input.team, profile.team, input.members);
  return raw
    .map((m) => {
      if (!isRecord(m)) return null;
      const name = text(m.name);
      if (!name) return null;
      const out = { name, role: text(m.role, m.title) || "" };
      const bio = text(m.bio, m.description);
      if (bio) out.bio = bio;
      const avatarSrc = text(m.avatar && (m.avatar.src || m.avatar), m.image && (m.image.src || m.image));
      if (avatarSrc) out.avatar = { src: avatarSrc, alt: text(m.avatar && m.avatar.alt, name) };
      if (Array.isArray(m.links) && m.links.length > 0) {
        out.links = m.links
          .map((l) => isRecord(l) && text(l.href, l.url)
            ? { label: text(l.label, l.text, "Link"), href: text(l.href, l.url), icon: text(l.icon) || undefined }
            : null)
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
      const out = { name, label, type: text(f.type) || "text", required: isTruthyFlag(f.required) };
      if (text(f.placeholder)) out.placeholder = text(f.placeholder);
      if (typeof f.rows === "number") out.rows = f.rows;
      if (Array.isArray(f.options)) {
        out.options = f.options
          .map((opt) => isRecord(opt) ? { value: text(opt.value), label: text(opt.label, opt.value) } : { value: String(opt), label: String(opt) })
          .filter((o) => o.value);
      }
      if (isTruthyFlag(f.fullWidth ?? f.full_width)) out.fullWidth = true;
      return out;
    })
    .filter(Boolean);
}

// =============================================================================
// Misc
// =============================================================================

function chooseVariant(...values) {
  for (const value of values) {
    const v = text(value);
    if (variants.has(v)) return v;
  }
  return "blog-magazine";
}

function sectionCategory(componentName) {
  const map = {
    HeroSplit: "hero",
    HeroCentered: "hero",
    PageHero: "page-hero",
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
    HeaderNav: "header",
    AnnouncementBar: "announcement",
    ContactForm: "contact-form",
    NewsletterSignup: "newsletter",
    AboutTeam: "team",
    Breadcrumb: "breadcrumb",
    BlogList: "blog-list",
    BlogPost: "blog-post",
    Timeline: "timeline",
    ProcessSteps: "process",
    ContentBento: "bento",
    ImageGallery: "gallery",
    VideoEmbed: "video",
    ComparisonTable: "comparison",
    NotFound: "404",
  };
  return map[componentName] || componentName.toLowerCase();
}

function normalizeHref(value, fallback = "") {
  const v = text(value);
  if (!v) return fallback;
  if (/^(mailto:|tel:|#|\/)/i.test(v)) return v;
  return normalizeUrl(v, fallback);
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

function isTruthyFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|yes|1)$/i.test(value.trim());
  return Boolean(value);
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

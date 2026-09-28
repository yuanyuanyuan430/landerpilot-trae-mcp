import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "../../generators/shared/html.mjs";
import { loadBlueprintI18n } from "../../generators/shared/i18n.mjs";
import { renderAstroPage, renderHeadHtml } from "../../generators/shared/render-astro-page.mjs";

const blueprintRoot = dirname(fileURLToPath(import.meta.url));

export async function produce({ input = {} } = {}) {
  const requestedLanguage = input.language ?? "zh-CN";
  if (!["zh", "zh-CN", "en"].includes(requestedLanguage)) {
    throw new Error("Promotion language must be zh-CN or en.");
  }
  const language = requestedLanguage === "en" ? "en" : "zh-CN";
  const t = loadBlueprintI18n(blueprintRoot, language).promotion;
  const title = input.site_name ?? t.siteName;
  // Titles are plain text, including in Astro's HTML template (where braces
  // would otherwise be executable expressions). No arbitrary HTML is input.
  if (typeof title !== "string" || !title.trim() || title.length > 80 || /[<>{}\u0000-\u001f\u007f]/.test(title)) {
    throw new Error("Promotion site_name must be 1–80 characters of plain text without HTML or braces.");
  }
  const siteName = title.trim();
  const navigation = [
    { text: t.nav.home, href: "/" },
    { text: t.nav.guide, href: "/guide/" },
    { text: t.nav.about, href: "/about/" },
    { text: t.nav.disclosure, href: "/disclosure/" },
  ];
  const header = (route) => ({
    component: "HeaderNav",
    props: {
      brand: siteName,
      variant: "default",
      links: navigation.map((link) => ({ ...link, active: link.href === (route === "index" ? "/" : `/${route}/`) })),
      primaryCta: { text: t.readGuide, href: "/guide/" },
    },
  });
  const disclosure = {
    component: "AffiliateDisclosure",
    props: { text: t.disclosureNote, link: { text: t.nav.disclosure, href: "/disclosure/" }, position: "footer" },
  };
  const footer = { component: "FooterMinimal", props: { brand: siteName, links: navigation, rights: t.rights } };
  const homeSections = [
    { component: "HeroCentered", props: {
      brand: t.eyebrow,
      title: t.headline,
      subtitle: t.description,
      primaryCta: { text: t.readGuide, href: "/guide/" },
      secondaryCta: { text: t.nav.about, href: "/about/" },
    } },
    { component: "Features3Col", props: { title: t.featureTitle, variant: "minimal", items: t.features } },
    { component: "ProcessSteps", props: { title: t.processTitle, steps: t.steps, numbered: true } },
  ];
  const pages = [
    page("index", siteName, t.description, homeSections),
    ...["guide", "about", "disclosure"].map((route) => {
      const article = t.articles[route];
      return page(route, article.title, article.description, [{
        component: "BlogPost",
        props: {
          title: article.title,
          excerpt: article.description,
          contentHtml: article.sections.map((section) =>
            `<h2>${escapeHtml(section.title)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}`
          ).join("\n"),
        },
      }]);
    }),
  ];

  return {
    blueprint: "promotion",
    variant: "shopping-guide",
    title: siteName,
    description: t.description,
    theme: { industry: "ecommerce" },
    pages,
    summary: {
      language,
      sections: ["header-nav", "hero-centered", "features-3col", "process-steps", "blog-post", "affiliate-disclosure", "footer-minimal"],
      contentPolicy: "General shopping guidance; no invented products, deals, reviews, traffic or endorsements.",
    },
    warnings: [t.generationNote],
  };

  function page(route, pageTitle, description, sections) {
    const root = route === "index" ? ".." : "../..";
    const astroBody = renderAstroPage({
      lang: language,
      dataTheme: "ganhuo-ecommerce",
      cssImport: `${root}/styles/global.css`,
      componentsImportRoot: `${root}/components/sections`,
      headHtml: renderHeadHtml({ title: route === "index" ? siteName : `${pageTitle} · ${siteName}`, description }),
      sections: [header(route), ...sections, disclosure, footer],
      metadata: { blueprint: "promotion", route },
    });
    return { route, title: pageTitle, astroBody };
  }
}

/**
 * Post-build script: generates static HTML pages for blog routes so that
 * crawlers / share-preview bots see real SEO meta tags instead of the
 * generic 404.html SPA redirect.
 *
 * For each blog post in content/blogs.json it creates:
 *   dist/blogs/<slug>/index.html
 *
 * It also creates dist/blogs/index.html for the blog listing page.
 *
 * The built index.html is a clean shell (no SEO meta). This script
 * replaces <title> and injects all SEO tags before </head>.
 *
 * Additionally, it regenerates dist/sitemap.xml to include all blog URLs.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

const BASE_URL = "https://motebaya.github.io";
const SITE_NAME = "Portofolio - Motebaya";

// ── Load blog data ──────────────────────────────────────────────────
const blogsJson = readFileSync(resolve(ROOT, "content/blogs.json"), "utf-8");
const posts = JSON.parse(blogsJson);

// ── Read the built index.html as template ───────────────────────────
const indexHtml = readFileSync(resolve(DIST, "index.html"), "utf-8");

/**
 * Escape HTML special characters in user-provided strings to prevent
 * injection inside attribute values / text nodes.
 */
function esc(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build a full HTML page by injecting SEO meta tags into the clean
 * index.html template. Replaces <title> and inserts all meta/link/script
 * tags right before </head>.
 */
function buildPage({ title, description, url, image, type, extra }) {
  let html = indexHtml;

  // Replace <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);

  // Build SEO tags to inject
  const seoTags = [
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    ``,
    `<!-- Open Graph -->`,
    `<meta property="og:type" content="${esc(type)}" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1280" />`,
    `<meta property="og:image:height" content="720" />`,
    `<meta property="og:locale" content="en_US" />`,
    ``,
    `<!-- Twitter Card -->`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];

  // Add extra head tags (article:published_time, author, keywords, tags)
  if (extra?.headTags) {
    seoTags.push(``, `<!-- Article metadata -->`);
    seoTags.push(extra.headTags);
  }

  // Add JSON-LD structured data
  if (extra?.jsonLd) {
    seoTags.push(
      ``,
      `<!-- JSON-LD Structured Data -->`,
      `<script type="application/ld+json">${JSON.stringify(extra.jsonLd)}</script>`,
    );
  }

  // Indent each line and inject before </head>
  const injection = seoTags.map((line) => (line ? `    ${line}` : "")).join("\n");
  html = html.replace("</head>", `${injection}\n  </head>`);

  return html;
}

// ── Inject SEO into the home page (dist/index.html) ─────────────────
// The source index.html is a clean shell so Helmet can manage tags
// per-page without duplication. But crawlers see the static HTML, so
// we inject the home page SEO here at build time.
{
  const html = buildPage({
    title: "Motebaya - Portfolio",
    description:
      "Portfolio of Motebaya - developer experienced in Python, JavaScript, PHP, and Ruby. Web scraping, automation, and full-stack projects.",
    url: `${BASE_URL}/`,
    image: `${BASE_URL}/cover.webp`,
    type: "website",
    extra: {
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Motebaya",
        alternateName: "davins",
        url: BASE_URL,
        sameAs: [
          "https://github.com/motebaya",
          "https://t.me/dvinchii",
          "https://x.com/vinsmochi71",
          "https://www.youtube.com/@ItsMochino",
        ],
        knowsAbout: ["Python", "JavaScript", "PHP", "Ruby", "Web Scraping", "Automation"],
      },
    },
  });

  writeFileSync(resolve(DIST, "index.html"), html, "utf-8");
  console.log("  updated: dist/index.html (home page SEO)");
}

// ── Generate blog listing page ──────────────────────────────────────
{
  const dir = resolve(DIST, "blogs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const html = buildPage({
    title: `All Blog Posts | ${SITE_NAME}`,
    description:
      "Technical blog articles, deep dives, and dev notes on Python, JavaScript, Ruby, automation, and reverse engineering.",
    url: `${BASE_URL}/blogs`,
    image: `${BASE_URL}/cover.webp`,
    type: "website",
    extra: {
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Motebaya Blog",
        url: `${BASE_URL}/blogs`,
        description: "Technical blog articles and deep dives.",
        author: {
          "@type": "Person",
          name: "Motebaya",
          url: BASE_URL,
        },
      },
    },
  });

  writeFileSync(resolve(dir, "index.html"), html, "utf-8");
  console.log("  created: dist/blogs/index.html");
}

// ── Generate individual article pages ───────────────────────────────
for (const post of posts) {
  const slug = post.blogUrl.replace(/\.md$/, "");
  const dir = resolve(DIST, "blogs", slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const articleUrl = `${BASE_URL}/blogs/${slug}`;
  const imageUrl = `${BASE_URL}/images/blog/${post.thumbnail}`;

  const tagsMeta = (post.tags || [])
    .map((tag) => `<meta property="article:tag" content="${esc(tag)}" />`)
    .join("\n");

  const html = buildPage({
    title: `${post.title} | ${SITE_NAME}`,
    description: post.description,
    url: articleUrl,
    image: imageUrl,
    type: "article",
    extra: {
      headTags: [
        `<meta property="article:published_time" content="${esc(post.publishDate)}" />`,
        `<meta property="article:author" content="${esc(post.author)}" />`,
        `<meta name="author" content="${esc(post.author)}" />`,
        `<meta name="keywords" content="${esc((post.tags || []).join(", "))}" />`,
        tagsMeta,
      ].join("\n"),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        image: imageUrl,
        url: articleUrl,
        datePublished: post.publishDate,
        author: {
          "@type": "Person",
          name: post.author,
          url: BASE_URL,
        },
        publisher: {
          "@type": "Person",
          name: "Motebaya",
          url: BASE_URL,
        },
        keywords: (post.tags || []).join(", "),
      },
    },
  });

  writeFileSync(resolve(dir, "index.html"), html, "utf-8");
  console.log(`  created: dist/blogs/${slug}/index.html`);
}

// ── Regenerate sitemap.xml with blog URLs ───────────────────────────
{
  const today = new Date().toISOString().split("T")[0];

  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/blogs</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;

  for (const post of posts) {
    const slug = post.blogUrl.replace(/\.md$/, "");
    sitemap += `  <url>
    <loc>${BASE_URL}/blogs/${slug}</loc>
    <lastmod>${post.publishDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;
  }

  sitemap += `</urlset>\n`;

  writeFileSync(resolve(DIST, "sitemap.xml"), sitemap, "utf-8");
  console.log("  created: dist/sitemap.xml (with blog URLs)");
}

console.log(`\n  Done! Generated pages for ${posts.length} blog articles.`);

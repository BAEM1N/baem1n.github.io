import type { APIRoute } from "astro";
import { SITE } from "@/config";

// A <sitemapindex> must reference url-set sitemaps, NOT another index.
// sitemap-index.xml is itself a <sitemapindex> (→ sitemap-0.xml), so referencing
// it here produced an illegal nested index that crawlers silently drop. Point
// straight at the url-set (sitemap-0.xml) instead. 116 URLs < 50k → single file.
const sitemapEntries = ["sitemap-priority.xml", "sitemap-0.xml"] as const;

const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString();
  const entries = sitemapEntries
    .map((path) => {
      const loc = new URL(path, SITE.website).href;
      return `<sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${lastmod}</lastmod></sitemap>`;
    })
    .join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    },
  );
};

import type { APIRoute } from "astro";
import { SITE } from "@/config";

const priorityPaths = [
  "/",
  "/posts/runpod-referral-gpu-cloud/",
  "/posts/vultr-referral-cloud-server/",
  "/en/",
  "/en/posts/runpod-referral-gpu-cloud/",
  "/en/posts/vultr-referral-cloud-server/",
] as const;

const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString();
  const urls = priorityPaths
    .map((path) => {
      const loc = new URL(path, SITE.website).href;
      return `<url><loc>${xmlEscape(loc)}</loc><lastmod>${lastmod}</lastmod><priority>1.0</priority></url>`;
    })
    .join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    },
  );
};

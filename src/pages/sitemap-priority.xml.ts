import type { APIRoute } from "astro";
import { SITE } from "@/config";

const priorityPaths = [
  "/",
  "/about/",
  "/posts/korean-rag-bench-final-analysis/",
  "/posts/korean-rag-bench-methodology/",
  "/posts/llm-bench-03-results-tables/",
  "/posts/arize-phoenix-llmops-observability/",
  "/posts/arize-phoenix-langchain-tracing/",
  "/posts/phoenix-callbackhandler-openinference/",
  "/posts/langchain-age-langgraph-agent/",
  "/posts/graphrag-with-postgresql/",
  "/en/",
  "/en/about/",
  "/en/posts/korean-rag-bench-final-analysis/",
  "/en/posts/korean-rag-bench-methodology/",
  "/en/posts/llm-bench-03-results-tables/",
  "/en/posts/arize-phoenix-llmops-observability/",
  "/en/posts/arize-phoenix-langchain-tracing/",
  "/en/posts/phoenix-callbackhandler-openinference/",
  "/en/posts/langchain-age-langgraph-agent/",
  "/en/posts/graphrag-with-postgresql/",
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

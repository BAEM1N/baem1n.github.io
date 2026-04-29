import type { APIRoute } from "astro";

const getRobotsTxt = (
  prioritySitemapURL: URL,
  fullSitemapURL: URL,
) => `# Default
User-agent: *
Allow: /

# AI Crawlers - explicitly welcome
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Bytespider
Allow: /

User-agent: CCBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: FacebookBot
Allow: /

Sitemap: ${prioritySitemapURL.href}
Sitemap: ${fullSitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  const prioritySitemapURL = new URL("sitemap.xml", site);
  const fullSitemapURL = new URL("sitemap-index.xml", site);
  return new Response(getRobotsTxt(prioritySitemapURL, fullSitemapURL));
};

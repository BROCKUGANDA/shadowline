import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.SITE_URL ?? "https://shadowline.aiazimara.com";
  return {
    rules: [
      // Private surfaces stay private; everything else, including AI
      // crawlers, is explicitly welcome — this is a public research site.
      { userAgent: "*", allow: "/", disallow: ["/app", "/app/", "/api/", "/login"] },
      // Answer/generative engines — the content is meant to be cited.
      { userAgent: ["GPTBot", "ChatGPT-User", "OAI-SearchBot"], allow: "/" },
      { userAgent: ["ClaudeBot", "anthropic-ai", "Claude-Web"], allow: "/" },
      { userAgent: ["PerplexityBot", "Perplexity-User"], allow: "/" },
      { userAgent: ["Google-Extended", "Googlebot"], allow: "/" },
      { userAgent: ["Applebot", "Applebot-Extended"], allow: "/" },
      { userAgent: ["CCBot"], allow: "/" },
      { userAgent: ["Bytespider"], allow: "/" },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

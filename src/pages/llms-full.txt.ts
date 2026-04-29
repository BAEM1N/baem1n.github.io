import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import getSortedPosts from "@/utils/getSortedPosts";
import { SITE } from "@/config";

export const GET: APIRoute = async () => {
  const posts = await getCollection("blog");
  const sortedPosts = getSortedPosts(posts);

  const header = `# ${SITE.title}

> ${SITE.desc}

Site: ${SITE.website}
Author: ${SITE.author}
Language: ${SITE.lang ?? "en"}

## Pages
- [About](/about/): About the author and credentials
- [Posts](/posts/): All Korean blog posts
- [English Posts](/en/posts/): All English blog posts
- [Tags](/tags/): Topic index
- [Archives](/archives/): Archive page
- [Search](/search/): Site search
- [RSS Feed](/rss.xml): RSS Feed

---

## Blog Posts (${sortedPosts.length} total)

`;

  const postSections = sortedPosts.map((post) => {
    const { title, description, pubDatetime, modDatetime, tags } = post.data;
    const date = modDatetime ?? pubDatetime;
    const tagList = tags.join(", ");

    return `### ${title}

- Date: ${date.toISOString().split("T")[0]}
- URL: [${title}](/posts/${post.id}/)
- Tags: ${tagList}
- Description: ${description}

${post.body ?? ""}
`;
  });

  const body = header + postSections.join("\n---\n\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};

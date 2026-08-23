import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { SITE } from "@/config";

export const BLOG_PATH = "src/data/blog";
export const BLOG_EN_PATH = "src/data/blog/en";

const blogSchema = ({ image }: { image: () => any }) =>
  z.object({
    author: z.string().default(SITE.author),
    pubDatetime: z.date(),
    modDatetime: z.date().optional().nullable(),
    title: z.string(),
    featured: z.boolean().optional(),
    // featured 섹션 내 표시 순서(작을수록 위). 미지정 시 날짜 내림차순으로 뒤에 붙는다.
    // 발행일(pubDatetime)을 순서용으로 조작하지 않기 위한 별도 필드.
    featuredOrder: z.number().optional(),
    draft: z.boolean().optional(),
    tags: z.array(z.string()).default(["others"]),
    ogImage: image().or(z.string()).optional(),
    description: z.string(),
    canonicalURL: z.string().optional(),
    hideEditPost: z.boolean().optional(),
    timezone: z.string().optional(),
    aiAssisted: z.boolean().optional(),
    articleType: z.enum(["BlogPosting", "TechArticle"]).optional(),
    proficiencyLevel: z.string().optional(),
    dependencies: z.string().optional(),
  });

const blog = defineCollection({
  loader: glob({ pattern: "[^_]*.md", base: `./${BLOG_PATH}` }),
  schema: blogSchema,
});

const blogEn = defineCollection({
  loader: glob({ pattern: "[^_]*.md", base: `./${BLOG_EN_PATH}` }),
  schema: blogSchema,
});

export const collections = { blog, "blog-en": blogEn };

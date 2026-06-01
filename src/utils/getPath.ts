import { BLOG_PATH } from "@/content.config";
import { slugifyStr } from "./slugify";

/**
 * Get full path of a blog post
 * @param id - id of the blog post (aka slug)
 * @param filePath - the blog post full file location
 * @param includeBase - whether to include `/posts` in return value
 * @returns blog post path
 */
export function getPath(
  id: string,
  filePath: string | undefined,
  includeBase = true
) {
  const pathSegments = filePath
    ?.replace(BLOG_PATH, "")
    .split("/")
    .filter(path => path !== "") // remove empty string in the segments ["", "other-path"] <- empty string will be removed
    .filter(path => !path.startsWith("_")) // exclude directories start with underscore "_"
    .slice(0, -1) // remove the last segment_ file name_ since it's unnecessary
    .map(segment => slugifyStr(segment)); // slugify each segment path

  const basePath = includeBase ? "/posts" : "";

  // Making sure `id` does not contain the directory
  const blogId = id.split("/");
  const slug = blogId.length > 0 ? blogId.slice(-1) : blogId;

  // Locale sub-directories (e.g. "en") route as `/<locale>/posts/<slug>` — the
  // locale is a PREFIX before the base path, not a segment after it. Without this,
  // an EN post (`src/data/blog/en/foo.md`) would wrongly resolve to `/posts/en/foo`
  // (404) instead of the real route `/en/posts/foo`, breaking og:image and prev/next.
  const LOCALES = ["en"];
  let segments = pathSegments ?? [];
  let localePrefix = "";
  if (segments.length > 0 && LOCALES.includes(segments[0])) {
    localePrefix = `/${segments[0]}`;
    segments = segments.slice(1);
  }

  // If not inside a (non-locale) sub-dir, simply return the file path
  if (segments.length < 1) {
    return [`${localePrefix}${basePath}`, slug].join("/");
  }

  return [`${localePrefix}${basePath}`, ...segments, slug].join("/");
}

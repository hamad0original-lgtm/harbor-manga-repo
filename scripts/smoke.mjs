import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile(resolve(import.meta.dirname, "../plugins/mangadex.plugin.js"), "utf8");
const harbor = {
  async http(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20_000);
    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
      if (options.responseType === "json") return await response.json();
      return {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

const plugin = new Function("harbor", source + "\nreturn plugin;")(harbor);

const popular = await plugin.popular(0);
assert(Array.isArray(popular) && popular.length > 0, "popular() returned no titles");
assert(popular[0].id && popular[0].title, "popular() returned an invalid summary");

const search = await plugin.search("One Piece", 0);
assert(Array.isArray(search) && search.length > 0, "search() returned no results");

const detail = await plugin.detail(search[0].id);
assert(detail && detail.id === search[0].id && detail.title, "detail() returned invalid data");

const chapters = await plugin.chapters(search[0].id);
assert(Array.isArray(chapters) && chapters.length > 0, "chapters() returned no English chapters");
assert(chapters[0].id && "chapter" in chapters[0] && "pages" in chapters[0], "invalid chapter shape");

const readable = chapters.find((chapter) => chapter.pages > 0) || chapters[0];
const pages = await plugin.pageUrls(readable.id);
assert(Array.isArray(pages) && pages.length > 0, "pageUrls() returned no pages");
assert(pages.every((url) => /^https?:\/\//i.test(url)), "pageUrls() returned a relative URL");

const tags = await plugin.tags();
assert(Array.isArray(tags) && tags.length > 0, "tags() returned no tags");

console.log(JSON.stringify({
  popular: popular.length,
  search: search.length,
  title: detail.title,
  chapters: chapters.length,
  pages: pages.length,
  tags: tags.length,
}, null, 2));

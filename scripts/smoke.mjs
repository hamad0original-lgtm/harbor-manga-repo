import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pluginId = process.argv[2] || "mangadex";
const queries = { mangadex: "One Piece", comix: "One Piece" };
if (!(pluginId in queries)) throw new Error("Unknown plugin: " + pluginId);
const searchQuery = process.argv[3] || queries[pluginId];
const requestedChapter = process.argv[4];
const source = await readFile(resolve(import.meta.dirname, `../plugins/${pluginId}.plugin.js`), "utf8");
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

const search = await plugin.search(searchQuery, 0);
assert(Array.isArray(search) && search.length > 0, "search() returned no results");

const detail = await plugin.detail(search[0].id);
assert(detail && detail.id === search[0].id && detail.title, "detail() returned invalid data");

const chapters = await plugin.chapters(search[0].id);
assert(Array.isArray(chapters) && chapters.length > 0, "chapters() returned no English chapters");
assert(chapters[0].id && "chapter" in chapters[0] && "pages" in chapters[0], "invalid chapter shape");
if (pluginId === "comix" && detail.lastChapter) {
  assert(
    chapters.at(-1)?.chapter === detail.lastChapter,
    `Read latest would open ${chapters.at(-1)?.chapter} instead of ${detail.lastChapter}`,
  );
}

const readable = requestedChapter
  ? chapters.find((chapter) => chapter.chapter === requestedChapter)
  : chapters.find((chapter) => chapter.pages > 0) || chapters[0];
assert(
  readable,
    `chapter ${requestedChapter || "sample"} was not found in ${detail.title}; ` +
    `search matches: ${search.slice(0, 5).map((item) => item.title).join(" | ")}; ` +
    `highest chapters: ${chapters.slice(0, 20).map((chapter) => chapter.chapter).join(", ")}; ` +
    `lowest chapters: ${chapters.slice(-20).map((chapter) => chapter.chapter).join(", ")}`,
);
const rawPages = await plugin.pageUrls(readable.id);
assert(Array.isArray(rawPages) && rawPages.length > 0, "pageUrls() returned no pages");
const pages = rawPages.map((page) => typeof page === "string" ? page : page && page.url).filter(Boolean);
assert(pages.every((url) => /^https?:\/\//i.test(url)), "pageUrls() returned a relative URL");

let imageStatus = "not checked";
if (pluginId === "comix") {
  const pageHeaders = typeof rawPages[0] === "object" ? rawPages[0].headers : undefined;
  const image = await fetch(pages[0], {
    headers: {
      ...pageHeaders,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  imageStatus = `${image.status} ${image.headers.get("content-type") || "unknown"}`;
  assert(
    image.ok && /^image\//i.test(image.headers.get("content-type") || ""),
    "reader image request failed: " + imageStatus,
  );
  await image.body?.cancel();
}

const tags = typeof plugin.tags === "function" ? await plugin.tags() : [];
if (typeof plugin.tags === "function") {
  assert(Array.isArray(tags) && tags.length > 0, "tags() returned no tags");
}

console.log(JSON.stringify({
  plugin: plugin.name,
  popular: popular.length,
  search: search.length,
  title: detail.title,
  chapter: readable.chapter,
  chapters: chapters.length,
  latest: chapters.at(-1)?.chapter,
  pages: rawPages.length,
  image: imageStatus,
  tags: typeof plugin.tags === "function" ? tags.length : "not supported",
}, null, 2));

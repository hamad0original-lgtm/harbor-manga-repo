import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requests = [];
const manga = {
  id: "manga-1",
  attributes: {
    title: { en: "Test Manga" },
    altTitles: [{ ja: "テスト" }],
    description: { en: "Description" },
    year: 2026,
    status: "ongoing",
    contentRating: "safe",
    lastChapter: "2",
  },
  relationships: [
    { type: "cover_art", attributes: { fileName: "cover.jpg" } },
    { type: "author", attributes: { name: "Test Author" } },
  ],
};

const harbor = {
  async http(url, options) {
    requests.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname === "/manga/tag") {
      return { result: "ok", data: [{ id: "tag-1", attributes: { name: { en: "Action" }, group: "genre" } }] };
    }
    if (parsed.pathname === "/manga/manga-1/feed") {
      return {
        result: "ok",
        data: [{
          id: "chapter-1",
          attributes: {
            chapter: "2",
            volume: "1",
            title: "The Test",
            pages: 2,
            translatedLanguage: "en",
            publishAt: "2026-01-01T00:00:00Z",
          },
          relationships: [{ type: "scanlation_group", attributes: { name: "Test Group" } }],
        }],
      };
    }
    if (parsed.pathname === "/manga/manga-1") return { result: "ok", data: manga };
    if (parsed.pathname === "/at-home/server/chapter-1") {
      return { result: "ok", baseUrl: "https://uploads.example", chapter: { hash: "hash", data: ["1.jpg", "2.jpg"] } };
    }
    if (parsed.pathname === "/manga") return { result: "ok", data: [manga] };
    throw new Error("Unexpected request: " + url);
  },
};

const source = await readFile(resolve(import.meta.dirname, "../plugins/mangadex.plugin.js"), "utf8");
const plugin = new Function("harbor", source + "\nreturn plugin;")(harbor);

const popular = await plugin.popular(48, "tag-1");
assert(popular.length === 1 && popular[0].title === "Test Manga", "popular mapping failed");
assert(popular[0].cover.endsWith("/manga-1/cover.jpg.256.jpg"), "cover mapping failed");
assert(requests[0].url.includes("offset=48"), "popular offset was not passed through");
assert(requests[0].url.includes("includedTags%5B%5D=tag-1"), "tag filter was not passed through");

const search = await plugin.search("test title", 0);
assert(search.length === 1, "search mapping failed");
assert(requests[1].url.includes("title=test+title"), "search query was not encoded");

const detail = await plugin.detail("manga-1");
assert(detail.author === "Test Author" && detail.description === "Description", "detail mapping failed");

const chapters = await plugin.chapters("manga-1");
assert(chapters.length === 1, "chapter mapping failed");
assert(chapters[0].chapter === "2" && chapters[0].pages === 2, "chapter shape is invalid");
assert(chapters[0].group === "Test Group", "scanlation group attribution is missing");

const pages = await plugin.pageUrls("chapter-1");
assert(pages.length === 2 && pages[0] === "https://uploads.example/data/hash/1.jpg", "page URL mapping failed");

const tags = await plugin.tags();
assert(tags.length === 1 && tags[0].name === "Action", "tag mapping failed");

assert(requests.every((request) => request.options.responseType === "json"), "API requests must ask Harbor for JSON");
console.log("All MangaDex provider contract tests passed.");

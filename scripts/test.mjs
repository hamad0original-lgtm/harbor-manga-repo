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
console.log("MangaDex provider contract tests passed.");

const comixRequests = [];
const comixManga = {
  hid: "test-hid",
  title: "Test Comix",
  altTitles: ["Alternate Test"],
  synopsis: "Comix description",
  poster: { large: "https://static.comix.to/cover.jpg" },
  year: 2026,
  status: "releasing",
  contentRating: "safe",
  latestChapter: 2,
  authors: [{ title: "Test Writer" }],
  artists: [{ title: "Test Artist" }],
};

const comixHarbor = {
  async http(url, options) {
    comixRequests.push({ url, options });
    const parsed = new URL(url);
    const path = parsed.pathname.replace("/api/v1", "");
    let result;
    if (path === "/manga/test-hid/chapters") {
      const page = Number(parsed.searchParams.get("page"));
      result = {
        items: page === 1
          ? [{ id: 101, number: 2, name: "Second", group: { name: "Test Scans" } }]
          : [{ id: 100, number: 1, name: "First", isOfficial: true }],
        meta: { lastPage: 2 },
      };
    } else if (path === "/manga/test-hid") {
      result = comixManga;
    } else if (path === "/chapters/101") {
      result = { pages: { baseUrl: "https://static.comix.to/pages", items: [{ url: "1.jpg" }] } };
    } else if (path === "/manga") {
      result = { items: [comixManga], meta: { lastPage: 1 } };
    } else {
      throw new Error("Unexpected Comix request: " + url);
    }
    return { status: 200, ok: true, headers: {}, body: JSON.stringify({ result }) };
  },
};

const comixSource = await readFile(resolve(import.meta.dirname, "../plugins/comix.plugin.js"), "utf8");
const comix = new Function("harbor", comixSource + "\nreturn plugin;")(comixHarbor);

const comixPopular = await comix.popular(28);
assert(comixPopular.length === 1 && comixPopular[0].id === "test-hid", "Comix popular mapping failed");
const popularUrl = new URL(comixRequests[0].url);
assert(popularUrl.searchParams.get("page") === "2", "Comix offset-to-page mapping failed");
assert(
  popularUrl.searchParams.get("_") === "IZ-P1pUtzvpsKTY7dkbUEuwzSWypH3KIyulHx1WmsirlEp96jPXS7g",
  "Comix request signature changed",
);
assert(comixRequests[0].options.responseType === "text", "Comix encrypted responses must be read as text");

const comixSearch = await comix.search("test title", 0);
assert(comixSearch[0].title === "Test Comix", "Comix search mapping failed");
assert(new URL(comixRequests[1].url).searchParams.get("keyword") === "test title", "Comix search encoding failed");

const comixDetail = await comix.detail("test-hid");
assert(comixDetail.author === "Test Writer, Test Artist", "Comix creator mapping failed");

const comixChapters = await comix.chapters("test-hid");
assert(comixChapters.length === 2, "Comix chapter pagination failed");
assert(comixChapters[0].chapter === "2" && comixChapters[0].group === "Test Scans", "Comix chapter mapping failed");
assert(comixChapters[1].group === "Official", "Comix official chapter attribution failed");

const comixPages = await comix.pageUrls("101");
assert(comixPages[0].url === "https://static.comix.to/pages/1.jpg", "Comix page mapping failed");
assert(comixPages[0].headers.Referer === "https://comix.to/", "Comix reader referer is missing");

assert(comixRequests.every((request) => new URL(request.url).searchParams.has("_")), "Comix requests must be signed");
console.log("Comix provider contract tests passed.");

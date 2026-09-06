/* Replace BASE, selectors, and IDs to create a Harbor manga source plugin. */

const BASE = "https://example-manga-host.test";

async function getDoc(path) {
  const response = await harbor.http(BASE + path, { responseType: "text" });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + path);
  return harbor.parseHtml(response.body);
}

function abs(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  return BASE + (url.startsWith("/") ? url : "/" + url);
}

function cardToSummary(element) {
  const link = element.querySelector("a.cover");
  const image = element.querySelector("img");
  const href = link && link.attr("href");
  if (!href) return null;
  return {
    id: href.replace(/^\/manga\//, "").replace(/\/$/, ""),
    title: (link.attr("title") || element.querySelector(".title")?.text() || "").trim(),
    cover: abs(image?.attr("data-src") || image?.attr("src")),
  };
}

const plugin = {
  id: "example-source",
  name: "Example Source",

  async popular(offset, tagId) {
    const page = Math.floor(offset / 48) + 1;
    const tag = tagId ? "&genre=" + encodeURIComponent(tagId) : "";
    const doc = await getDoc("/browse?sort=popular&page=" + page + tag);
    return doc.querySelectorAll(".grid .card").map(cardToSummary).filter(Boolean);
  },

  async search(query, offset, tagId) {
    const page = Math.floor(offset / 48) + 1;
    const tag = tagId ? "&genre=" + encodeURIComponent(tagId) : "";
    const doc = await getDoc("/search?q=" + encodeURIComponent(query) + "&page=" + page + tag);
    return doc.querySelectorAll(".grid .card").map(cardToSummary).filter(Boolean);
  },

  async detail(id) {
    const doc = await getDoc("/manga/" + id);
    const root = doc.querySelector(".series");
    if (!root) return null;
    return {
      id,
      title: root.querySelector("h1")?.text() || id,
      cover: abs(root.querySelector("img.poster")?.attr("src")),
      description: root.querySelector(".summary")?.text(),
      status: root.querySelector(".status")?.text(),
      author: root.querySelector(".author")?.text(),
    };
  },

  async chapters(id) {
    const doc = await getDoc("/manga/" + id + "/chapters");
    return doc.querySelectorAll(".chapter-list li a").map((link) => ({
      id: (link.attr("href") || "").replace(/^\//, ""),
      chapter: link.attr("data-number") || null,
      title: link.querySelector(".name")?.text(),
      volume: link.attr("data-volume") || null,
      pages: 0,
      language: "en",
      publishAt: link.querySelector(".date")?.attr("datetime") || undefined,
    })).filter((chapter) => chapter.id);
  },

  async pageUrls(chapterId) {
    const doc = await getDoc("/" + chapterId);
    return doc.querySelectorAll(".reader img")
      .map((image) => abs(image.attr("data-src") || image.attr("src")))
      .filter(Boolean);
  },
};

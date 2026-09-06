/* Harbor manga source plugin for MangaDex's public API. */

const API = "https://api.mangadex.org";
const COVERS = "https://uploads.mangadex.org/covers";
const PAGE_SIZE = 48;
const LANGUAGE = "en";

function params(entries) {
  const query = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== "") query.append(key, String(value));
  }
  return query.toString();
}

async function api(path, entries) {
  const query = entries && entries.length ? "?" + params(entries) : "";
  const data = await harbor.http(API + path + query, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Hamad-Harbor-Manga-Repo/1.0 (+https://github.com/hamad0original-lgtm/harbor-manga-repo)",
    },
    responseType: "json",
  });
  if (!data || data.result === "error") {
    const message = data && Array.isArray(data.errors) && data.errors[0]
      ? data.errors[0].detail || data.errors[0].title
      : "MangaDex request failed";
    throw new Error(message);
  }
  return data;
}

function localized(value, preferred) {
  if (!value || typeof value !== "object") return "";
  return value[preferred] || value.en || value.ja || Object.values(value).find(Boolean) || "";
}

function alternateTitle(attributes) {
  const titles = Array.isArray(attributes.altTitles) ? attributes.altTitles : [];
  for (const title of titles) {
    const value = localized(title, LANGUAGE);
    if (value) return value;
  }
  return undefined;
}

function relationship(item, type) {
  return (Array.isArray(item.relationships) ? item.relationships : []).find((rel) => rel.type === type);
}

function coverUrl(item) {
  const cover = relationship(item, "cover_art");
  const fileName = cover && cover.attributes && cover.attributes.fileName;
  return fileName ? COVERS + "/" + item.id + "/" + fileName + ".256.jpg" : undefined;
}

function toSummary(item) {
  if (!item || !item.id || !item.attributes) return null;
  const attributes = item.attributes;
  return {
    id: item.id,
    title: localized(attributes.title, LANGUAGE) || item.id,
    altTitle: alternateTitle(attributes),
    cover: coverUrl(item),
    year: typeof attributes.year === "number" ? attributes.year : undefined,
    status: attributes.status || undefined,
    description: localized(attributes.description, LANGUAGE) || undefined,
    contentRating: attributes.contentRating || undefined,
    lastChapter: attributes.lastChapter || undefined,
  };
}

function mangaQuery(offset, tagId, title) {
  const entries = [
    ["limit", PAGE_SIZE],
    ["offset", Math.max(0, Number(offset) || 0)],
    ["includes[]", "cover_art"],
    ["availableTranslatedLanguage[]", LANGUAGE],
    ["contentRating[]", "safe"],
    ["contentRating[]", "suggestive"],
    ["hasAvailableChapters", "true"],
  ];
  if (title) entries.push(["title", title], ["order[relevance]", "desc"]);
  else entries.push(["order[followedCount]", "desc"]);
  if (tagId) entries.push(["includedTags[]", tagId], ["includedTagsMode", "AND"]);
  return entries;
}

const plugin = {
  id: "mangadex",
  name: "MangaDex",

  async popular(offset, tagId) {
    const result = await api("/manga", mangaQuery(offset, tagId));
    return (Array.isArray(result.data) ? result.data : []).map(toSummary).filter(Boolean);
  },

  async search(query, offset, tagId) {
    const result = await api("/manga", mangaQuery(offset, tagId, String(query || "").trim()));
    return (Array.isArray(result.data) ? result.data : []).map(toSummary).filter(Boolean);
  },

  async detail(id) {
    const result = await api("/manga/" + encodeURIComponent(id), [
      ["includes[]", "cover_art"],
      ["includes[]", "author"],
      ["includes[]", "artist"],
    ]);
    const summary = toSummary(result.data);
    if (!summary) return null;
    const creators = (Array.isArray(result.data.relationships) ? result.data.relationships : [])
      .filter((rel) => rel.type === "author" || rel.type === "artist")
      .map((rel) => rel.attributes && rel.attributes.name)
      .filter(Boolean);
    return { ...summary, author: [...new Set(creators)].join(", ") || undefined };
  },

  async chapters(id) {
    const result = await api("/manga/" + encodeURIComponent(id) + "/feed", [
      ["limit", 500],
      ["offset", 0],
      ["translatedLanguage[]", LANGUAGE],
      ["contentRating[]", "safe"],
      ["contentRating[]", "suggestive"],
      ["includes[]", "scanlation_group"],
      ["order[volume]", "desc"],
      ["order[chapter]", "desc"],
      ["includeFutureUpdates", 0],
    ]);
    return (Array.isArray(result.data) ? result.data : []).map((item) => {
      const attributes = item.attributes || {};
      const group = relationship(item, "scanlation_group");
      return {
        id: item.id,
        chapter: attributes.chapter == null ? null : String(attributes.chapter),
        title: attributes.title || undefined,
        volume: attributes.volume == null ? null : String(attributes.volume),
        pages: Number.isInteger(attributes.pages) && attributes.pages >= 0 ? attributes.pages : 0,
        language: attributes.translatedLanguage || LANGUAGE,
        group: group && group.attributes ? group.attributes.name : undefined,
        publishAt: attributes.publishAt || attributes.readableAt || undefined,
      };
    });
  },

  async pageUrls(chapterId) {
    const result = await api("/at-home/server/" + encodeURIComponent(chapterId));
    const chapter = result.chapter || {};
    if (!result.baseUrl || !chapter.hash || !Array.isArray(chapter.data)) return [];
    return chapter.data.map((fileName) => result.baseUrl + "/data/" + chapter.hash + "/" + fileName);
  },

  async tags() {
    const result = await api("/manga/tag");
    return (Array.isArray(result.data) ? result.data : []).map((tag) => ({
      id: tag.id,
      name: localized(tag.attributes && tag.attributes.name, LANGUAGE) || tag.id,
      group: tag.attributes && tag.attributes.group ? tag.attributes.group : "Genre",
    }));
  },
};

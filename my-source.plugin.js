/* ------------------------------------------------------------------
 * Harbor manga source plugin — skeleton
 *
 * Runs sandboxed in an isolated worker. There is NO fetch, NO DOM,
 * NO localStorage. Network goes through harbor.http(url, opts) and
 * parsing through harbor.parseHtml(html).
 *
 * Parsed nodes expose:  .querySelector(sel)  .querySelectorAll(sel)
 *                       .attr(name)          .text()
 *
 * Fill in the SELECTORS block and the five methods below.
 * Every "TODO" is a selector you need to read off the target site.
 * ------------------------------------------------------------------ */

// ==================================================================
// 1. CONFIG  — the only lines most sites need you to change
// ==================================================================

const ID   = "my-source";                        // MUST match repo.json
const NAME = "My Source";
const BASE = "https://example-manga-host.test";  // no trailing slash

// URL shapes. {q} = search query, {p} = page number, {id} = manga id.
const URLS = {
  popular: (p)    => `${BASE}/browse?order=popular&page=${p}`,
  latest:  (p)    => `${BASE}/browse?order=latest&page=${p}`,
  search:  (q, p) => `${BASE}/search?q=${encodeURIComponent(q)}&page=${p}`,
  manga:   (id)   => `${BASE}/manga/${id}/`,
  chapter: (cid)  => `${BASE}/chapter/${cid}/`,
};

// CSS selectors, all in one place so you never hunt through the code.
const SEL = {
  card:        ".manga-list .card",   // TODO one result in a grid
  cardLink:    "a.cover",             // TODO the <a> holding the href
  cardImg:     "img",                 // TODO the cover <img>
  cardTitle:   ".title",              // TODO fallback title node

  nextPage:    "a.next, .pagination .next",  // TODO presence = more pages

  detailTitle: "h1.entry-title",      // TODO
  detailCover: ".summary_image img",  // TODO
  detailDesc:  ".description-summary p",
  detailAuthor:".author-content",
  detailStatus:".post-status .summary-content",
  detailGenre: ".genres-content a",

  chapterRow:  "li.wp-manga-chapter", // TODO one row in the chapter list
  chapterLink: "a",
  chapterDate: ".chapter-release-date",

  pageImg:     ".reading-content img",// TODO the page images in the reader
};

// ==================================================================
// 2. HELPERS
// ==================================================================

// Turn a relative/protocol-relative href into an absolute URL.
function abs(u) {
  if (!u) return "";
  u = String(u).trim();
  if (u.startsWith("//")) return "https:" + u;
  if (/^https?:\/\//i.test(u)) return u;
  return BASE.replace(/\/$/, "") + (u.startsWith("/") ? u : "/" + u);
}

function txt(el)        { return el ? (el.text() || "").trim() : ""; }
function attr(el, name) { return el ? (el.attr(name) || "").trim() : ""; }

// Lazy-loaded covers hide the real URL in a data- attribute.
function imgSrc(img) {
  return abs(
    attr(img, "data-src") ||
    attr(img, "data-lazy-src") ||
    attr(img, "data-original") ||
    attr(img, "src")
  );
}

// Fetch + parse in one call. Tolerates http() returning a string or an
// object, so you don't have to care which shape your build hands back.
async function getDoc(url, opts) {
  const res  = await harbor.http(url, opts);
  const html = typeof res === "string"
    ? res
    : (res && (res.body ?? res.text ?? res.data)) || "";
  return harbor.parseHtml(html);
}

// A site's manga id is whatever you can round-trip back into a URL.
// Keep it short and opaque — Harbor hands it straight back to
// detail() and chapters() without touching it.
function idFromHref(href) {
  return String(href || "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/manga\//, "")
    .replace(/\/$/, "");
}

// Parse one grid card into a listing entry. Return null to skip it.
function parseCard(el) {
  const link = el.querySelector(SEL.cardLink) || el.querySelector("a");
  if (!link) return null;
  const href = attr(link, "href");
  if (!href) return null;

  return {
    id:    idFromHref(href),
    title: (attr(link, "title") || txt(el.querySelector(SEL.cardTitle))).trim(),
    cover: imgSrc(el.querySelector(SEL.cardImg)),
  };
}

// Shared listing routine for popular / latest / search.
async function listPage(url) {
  const doc   = await getDoc(url);
  const items = (doc.querySelectorAll(SEL.card) || [])
    .map(parseCard)
    .filter(Boolean);

  return { items, hasNext: !!doc.querySelector(SEL.nextPage) };
}

// ==================================================================
// 3. THE PROVIDER
// ==================================================================

const plugin = {
  // id must match the manifest id in repo.json
  id: ID,
  name: NAME,
  lang: "en",
  baseUrl: BASE,

  // Grid of popular titles. Called with a 1-based page number.
  async popular(page = 1) {
    return listPage(URLS.popular(page));
  },

  // Optional: newest chapters. Delete if the site has no such view.
  async latest(page = 1) {
    return listPage(URLS.latest(page));
  },

  // Search results, same shape as popular().
  async search(query, page = 1) {
    return listPage(URLS.search(query, page));
  },

  // One title's metadata. `id` is exactly what you put in parseCard.
  async detail(id) {
    const doc = await getDoc(URLS.manga(id));

    return {
      id,
      title:       txt(doc.querySelector(SEL.detailTitle)),
      cover:       imgSrc(doc.querySelector(SEL.detailCover)),
      description: txt(doc.querySelector(SEL.detailDesc)),
      author:      txt(doc.querySelector(SEL.detailAuthor)),
      artist:      "",
      // "ongoing" | "completed" | "unknown"
      status:      normaliseStatus(txt(doc.querySelector(SEL.detailStatus))),
      genres:      (doc.querySelectorAll(SEL.detailGenre) || []).map(txt).filter(Boolean),
    };
  },

  // Chapter list, newest first. Harbor hands `id` back from detail().
  async chapters(id) {
    const doc  = await getDoc(URLS.manga(id));
    const rows = doc.querySelectorAll(SEL.chapterRow) || [];

    return rows.map((row, i) => {
      const link = row.querySelector(SEL.chapterLink);
      const href = attr(link, "href");
      const name = txt(link);

      return {
        // Opaque id handed straight back to pageUrls().
        id:     idFromHref(href).replace(/^chapter\//, ""),
        title:  name,
        // Pull the numeral out of "Chapter 12.5" for correct ordering.
        number: parseFloat((name.match(/(\d+(?:\.\d+)?)/) || [])[1]) || (rows.length - i),
        date:   txt(row.querySelector(SEL.chapterDate)),
      };
    });
  },

  // Ordered list of image URLs for one chapter. This is the method
  // that most often needs a site-specific trick — see the note below.
  async pageUrls(chapterId) {
    const doc = await getDoc(URLS.chapter(chapterId));

    const imgs = (doc.querySelectorAll(SEL.pageImg) || [])
      .map(imgSrc)
      .filter(Boolean);

    if (imgs.length) return imgs;

    // Fallback: many readers ship the page list as JSON inside a
    // <script> tag instead of as <img> elements. Uncomment and adapt.
    //
    // const scripts = doc.querySelectorAll("script") || [];
    // for (const s of scripts) {
    //   const m = (s.text() || "").match(/"images"\s*:\s*(\[[^\]]+\])/);
    //   if (m) return JSON.parse(m[1]).map(abs);
    // }

    return [];
  },

  // Optional: browsable genre/tag list.
  async tags() {
    const doc = await getDoc(`${BASE}/genres/`);
    return (doc.querySelectorAll("a.genre-item") || []).map((a) => ({
      id:   idFromHref(attr(a, "href")),
      name: txt(a),
    })).filter((t) => t.id && t.name);
  },
};

function normaliseStatus(s) {
  const v = (s || "").toLowerCase();
  if (v.includes("ongoing") || v.includes("publishing")) return "ongoing";
  if (v.includes("complete") || v.includes("finished"))  return "completed";
  return "unknown";
}

// ==================================================================
// 4. REGISTRATION
// ==================================================================
// Harbor picks the provider up off the sandbox global. Both forms are
// here so the file works whichever one your build expects — check the
// "Download full API reference" file and keep only the right one.

globalThis.plugin = plugin;
if (typeof module !== "undefined" && module.exports) module.exports = plugin;

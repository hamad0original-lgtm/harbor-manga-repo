# Harbor manga source plugin API

Harbor installs manga sources from static HTTPS repositories. A source is one JavaScript
file evaluated as a function body with a single `harbor` argument. Declare a top-level
`plugin` object or call `harbor.register(provider)`.

## Provider contract

```ts
type MangaProvider = {
  id: string;
  name: string;
  popular(offset: number, tagId?: string): Promise<MangaSummary[]>;
  search(query: string, offset: number, tagId?: string): Promise<MangaSummary[]>;
  detail(id: string): Promise<MangaSummary | null>;
  chapters(id: string): Promise<MangaChapter[]>;
  pageUrls(chapterId: string): Promise<string[]>;
  tags?(): Promise<MangaTag[]>;
};
```

`offset` is an item offset, not a page number. Harbor's page size is 48, so a paged
backend normally uses `Math.floor(offset / 48) + 1`. IDs are opaque and are returned to
the corresponding detail, chapter, and page calls unchanged.

## Return values

```ts
type MangaSummary = {
  id: string;
  title: string;
  altTitle?: string;
  cover?: string;
  year?: number;
  status?: string;
  description?: string;
  contentRating?: string;
  lastChapter?: string;
  author?: string;
};

type MangaChapter = {
  id: string;
  chapter: string | null;
  title?: string;
  volume?: string | null;
  pages: number;
  language: string;
  group?: string;
  publishAt?: string;
};

type MangaTag = { id: string; name: string; group?: string };
```

Summaries without `id` or `title`, chapters without `id`, and relative image URLs are
dropped. Cover and page URLs must be absolute HTTP(S) URLs. Do not set `downloaded`.
Harbor caps results at 500 summaries, 5,000 chapters, 2,000 page URLs, and 1,000 tags.

## Host bridge

```js
await harbor.http(url, options);
await harbor.parseHtml(html);
harbor.register(provider);
harbor.log("message");
```

HTTP options:

```ts
type HttpOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  responseType?: "text" | "json" | "base64";
  timeoutMs?: number;
};
```

For text and base64, `harbor.http` returns `{ status, ok, headers, body }`. For JSON it
returns the parsed JSON value, or `null` for invalid JSON. Only public HTTP(S) endpoints
are allowed. Private, loopback, link-local, and unsafe redirect targets are blocked.
Cookies are not sent. Sensitive or connection-specific headers are stripped. Response
bodies are capped at 8 MB and each plugin may have at most six requests in flight.

`harbor.parseHtml(html)` returns a document with:

```js
const element = doc.querySelector(".card a");
const elements = doc.querySelectorAll(".card");
const text = element.text();
const href = element.attr("href");
```

Supported selectors include tags, IDs, classes, `*`, common attribute selectors,
descendants, direct children, and comma-separated groups. Script, style, and iframe tags
are removed. If a site embeds data in a script, inspect the raw HTTP text with a regular
expression instead of `parseHtml`.

## Worker limits

The worker has standard JavaScript built-ins, timers, `URL`, `URLSearchParams`,
`TextEncoder`, `TextDecoder`, `atob`, `btoa`, `crypto`, and `console`.

It does not expose `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`,
storage, `Worker`, `self`, `globalThis`, `window`, `document`, `location`, `navigator`, or
`postMessage`. Source files must be under 2 MB. Method timeouts are 20 seconds for
popular/search/detail, 25 seconds for chapters, 30 seconds for page URLs, and 15 seconds
for tags.

## Manifest

```json
{
  "name": "My Manga Repo",
  "plugins": [
    {
      "id": "my-source",
      "name": "My Source",
      "version": "1.0.0",
      "lang": "en",
      "nsfw": false,
      "icon": "https://example.com/icon.png",
      "entry": "plugins/my-source.plugin.js"
    }
  ]
}
```

Only `id`, `name`, and `entry` are required. Provider and manifest IDs must match.
Relative entry paths resolve against the URL of `repo.json`.

Use a public static HTTPS host such as `raw.githubusercontent.com`, GitHub Pages, an
object store, or your own web server. In Harbor, open **Manga → Set up a source →
Extensions**, add the `repo.json` URL, and install the source.

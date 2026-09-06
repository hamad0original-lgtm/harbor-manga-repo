# Harbor manga repo — setup

A Harbor plugin repository is just **static files on an HTTPS host**. No server,
no build step, no account beyond GitHub. Two files is a valid repo.

```
harbor-manga-repo/
├── repo.json              <- the manifest Harbor reads
├── my-source.plugin.js    <- one JS file per source
└── icons/
    └── my-source.png      <- optional, 128x128 or so
```

---

## 1. Create the GitHub repo

1. New **public** repo named `harbor-manga-repo`. Public matters — Harbor
   fetches these files anonymously and cannot log in.
2. Drop `repo.json`, `my-source.plugin.js` and `icons/` in the root.
3. Commit.

## 2. Turn on GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → branch `main`, folder
`/ (root)` → Save. Give it a minute or two.

Your manifest URL is then:

```
https://<your-username>.github.io/harbor-manga-repo/repo.json
```

Open that URL in a browser first. If you see the JSON, Harbor will too. If you
get a 404, Pages hasn't finished deploying or the branch/folder is wrong.

**Alternative — a raw gist.** Create a gist with both files, then use the
`https://gist.githubusercontent.com/.../raw/repo.json` URL. It works, but the
raw URL changes on every edit unless you use the revision-less form, and raw
GitHub is aggressively cached (~5 min) and rate-limited. Pages is less
annoying to live with.

## 3. Install it

Harbor → Manga sources → **Bring your own extensions → Add a repository** →
paste the `repo.json` URL → **Add**. Your plugin appears in the list; install it.

---

## The two rules that break people

**`id` must match in both places.** The `id` field in `repo.json` and the `id`
property inside the plugin object have to be byte-identical. Mismatched ids is
the single most common "it installed but does nothing" cause.

**`entry` is resolved relative to `repo.json`.** Keep both files in the same
directory and `entry` stays a bare filename. If you move the plugin into a
`plugins/` subfolder, `entry` becomes `plugins/my-source.plugin.js`.

## Manifest fields

| field     | notes                                                        |
|-----------|--------------------------------------------------------------|
| `id`      | lowercase-with-dashes, unique, matches the plugin object      |
| `name`    | shown in Harbor's source list                                 |
| `version` | semver string; bump it to ship an update                      |
| `lang`    | ISO code — `en`, `ar`, `ja`, or `all` for multi-language      |
| `nsfw`    | boolean; Harbor uses this for filtering                       |
| `icon`    | absolute HTTPS URL, not a relative path                       |
| `entry`   | path to the JS file, relative to `repo.json`                  |

## Shipping updates

Edit the plugin, **bump `version` in `repo.json`**, push. Harbor sees the new
version on the next repo refresh. If you don't bump the version, clients that
already installed it may keep the cached copy.

## Adding more sources

Append another object to the `plugins` array and add its JS file. One repo can
carry as many sources as you like — which is the real payoff: reinstalling
your whole collection on a new device is one URL paste.

---

## Writing the scraper

Everything site-specific in `my-source.plugin.js` lives in two blocks at the
top: `URLS` (the URL shapes) and `SEL` (the CSS selectors). Fill those in from
the target site's HTML and the rest of the file usually works unchanged.

Order of work that wastes the least time:

1. `popular()` — get one grid of covers showing up. Nothing else matters until
   listings render.
2. `detail()` — title, cover, description.
3. `chapters()` — get the ordering right; `number` drives sort, so pull the
   numeral out of "Chapter 12.5" rather than trusting list order.
4. `pageUrls()` — the hard one. If the reader lazy-loads, the real URL is in
   `data-src`, not `src`. If there are no `<img>` tags at all, the page list is
   JSON inside a `<script>` tag — the commented fallback in the file handles
   that shape.

Remember the sandbox: no `fetch`, no `document`, no storage. `harbor.http` and
`harbor.parseHtml` are the entire surface.

## Before you point this anywhere

Harbor's own banner is the operative rule: publicly accessible pages only,
nothing behind a login, paywall or access control, and never official or
licensed publisher sites. A repo you publish is a repo other people may
install, and what it scrapes is on you.

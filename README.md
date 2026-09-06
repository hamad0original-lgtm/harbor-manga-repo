# Hamad's Harbor Manga Repo

A personal [Harbor](https://github.com/harborstremio/harbor) manga source repository.
It currently includes a working English-language MangaDex source using MangaDex's public
API. No account, token, build step, or server is required.

## Add it to Harbor

In Harbor, open **Manga → Set up a source → Extensions**, then add this URL:

```text
https://raw.githubusercontent.com/hamad0original-lgtm/harbor-manga-repo/main/repo.json
```

Refresh the repository, install **MangaDex**, and enable it. GitHub Pages is optional;
Harbor supports `raw.githubusercontent.com` directly.

## Repository layout

```text
repo.json                          Harbor's install manifest
plugins/mangadex.plugin.js         The installed MangaDex provider
examples/source-template.plugin.js A valid starting point for another source
schema/repo.schema.json            Manifest schema for editors and CI
scripts/validate.mjs               Dependency-free repository validator
harbor-manga-plugin-api.md         Harbor's plugin contract reference
```

## Validate changes

Node.js 20 or newer is recommended.

```sh
npm run validate
npm test
```

The validator checks the manifest, duplicate IDs, entry paths, JavaScript syntax, and
the five required provider methods. The tests exercise all provider methods with mocked
MangaDex responses. GitHub Actions runs both checks after every push and pull request.

To make a small live request to MangaDex from your machine, run `npm run smoke`.

## Add another source

1. Copy `examples/source-template.plugin.js` into `plugins/`.
2. Give it a unique lowercase ID and name.
3. Implement `popular`, `search`, `detail`, `chapters`, and `pageUrls` for the target.
4. Add the matching entry to `repo.json`.
5. Run `npm run validate` and bump its manifest version whenever its code changes.

Plugins run in an isolated worker. They have no DOM, `fetch`, storage, cookies, or
access to Harbor data. Use `harbor.http` for public HTTP(S) requests and
`harbor.parseHtml` for HTML. Only target sites and content you are authorized to access,
and follow their terms and applicable law.

MangaDex requires attribution to MangaDex and to scanlation groups when chapters are
shown. This plugin exposes group names in chapter metadata and this repository identifies
MangaDex as the source. Review the current MangaDex acceptable-use terms before publishing
derived applications or services.

## License

Repository code is available under the [MIT License](LICENSE). Content, metadata,
artwork, trademarks, and third-party services remain the property of their respective
owners and are governed by their own terms.

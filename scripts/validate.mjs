import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "repo.json");
const requiredMethods = ["popular", "search", "detail", "chapters", "pageUrls"];

function fail(message) {
  console.error("ERROR: " + message);
  process.exitCode = 1;
}

function isInsideRoot(path) {
  return path === root || path.startsWith(root + sep);
}

let repo;
try {
  repo = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  fail("repo.json is not valid JSON: " + error.message);
  process.exit(1);
}

if (!repo || typeof repo.name !== "string" || !repo.name.trim()) fail("repo.json needs a name");
if (!Array.isArray(repo.plugins) || repo.plugins.length === 0) fail("repo.json needs at least one plugin");

const ids = new Set();
for (const [index, item] of (repo.plugins || []).entries()) {
  const label = `plugins[${index}]`;
  if (!item || typeof item !== "object") {
    fail(label + " must be an object");
    continue;
  }
  for (const field of ["id", "name", "entry"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) fail(`${label}.${field} is required`);
  }
  if (ids.has(item.id)) fail("duplicate plugin id: " + item.id);
  ids.add(item.id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id || "")) fail(`${label}.id must be lowercase kebab-case`);
  if (item.icon !== undefined && !/^https:\/\//i.test(item.icon)) fail(`${label}.icon must be an absolute HTTPS URL`);
  if (item.nsfw !== undefined && typeof item.nsfw !== "boolean") fail(`${label}.nsfw must be boolean`);

  const entryPath = resolve(root, item.entry || "");
  if (!isInsideRoot(entryPath)) {
    fail(`${label}.entry escapes the repository root`);
    continue;
  }

  let source;
  try {
    source = await readFile(entryPath, "utf8");
  } catch (error) {
    fail(`${label}.entry cannot be read: ${error.message}`);
    continue;
  }
  if (source.length > 2 * 1024 * 1024) fail(`${label}.entry exceeds Harbor's 2 MB limit`);

  let registered;
  const harbor = { register(provider) { registered = provider; } };
  try {
    const declared = new Function("harbor", source + "\nreturn typeof plugin === 'undefined' ? undefined : plugin;")(harbor);
    registered ||= declared;
  } catch (error) {
    fail(`${label}.entry does not load in Harbor's function-body model: ${error.message}`);
    continue;
  }

  if (!registered || typeof registered !== "object") {
    fail(`${label}.entry did not declare plugin or call harbor.register()`);
    continue;
  }
  if (registered.id !== item.id) fail(`${label}.id does not match provider id ${JSON.stringify(registered.id)}`);
  if (registered.name !== item.name) fail(`${label}.name does not match provider name ${JSON.stringify(registered.name)}`);
  for (const method of requiredMethods) {
    if (typeof registered[method] !== "function") fail(`${label}.entry is missing ${method}()`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validated ${repo.plugins.length} Harbor plugin(s) in ${repo.name}.`);

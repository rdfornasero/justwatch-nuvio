const fs = require("node:fs/promises");
const path = require("node:path");
const JustWatch = require("justwatch-api");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const SNAPSHOTS = path.join(ROOT, "data", "snapshots");
const ID_MAP_FILE = path.join(ROOT, "data", "id-map.json");
const LOCALE = "en_US";
const PAGE_SIZE = 100;
const PAGES_PER_FEED = 2;
const REQUEST_DELAY_MS = 250;
const justwatch = new JustWatch({ locale: LOCALE });

const SERVICES = [
  { slug: "netflix", aliases: ["netflix"], fallback: "nfx" },
  { slug: "prime-video", aliases: ["amazon prime video", "prime video", "amazon video"], fallback: "amp" },
  { slug: "disney-plus", aliases: ["disney plus", "disney+"], fallback: "dnp" },
  { slug: "hulu", aliases: ["hulu"], fallback: "hlu" },
  { slug: "max", aliases: ["max", "hbo max"], fallback: "mxx" },
  { slug: "apple-tv-plus", aliases: ["apple tv", "apple tv+"], fallback: "atp" },
  { slug: "paramount-plus", aliases: ["paramount plus", "paramount+"], fallback: "pplus" },
  { slug: "peacock", aliases: ["peacock"], fallback: "pc" }
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const failedLookups = new Map();

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}
function extractItems(response) {
  if (Array.isArray(response)) return response;
  for (const key of ["items", "results", "titles", "data"]) {
    if (Array.isArray(response && response[key])) return response[key];
  }
  return [];
}
function getJwId(item) {
  const value = item && (item.id ?? (item.content && item.content.id));
  return value === undefined || value === null ? null : String(value);
}
function directImdb(item) {
  if (!item) return null;
  const values = [
    item.imdb_id,
    item.external_ids && item.external_ids.imdb_id,
    item.external_ids && item.external_ids.imdb,
    item.externalIds && item.externalIds.imdbId,
    item.content && item.content.imdb_id,
    item.content && item.content.external_ids && item.content.external_ids.imdb_id
  ];
  return values.find(value => typeof value === "string" && /^tt\d+$/.test(value)) || null;
}
function posterUrl(value) {
  if (typeof value !== "string" || !value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return "https://images.justwatch.com" + value;
  return undefined;
}
function yearOf(item, detail) {
  const value = (item && (item.original_release_year ?? item.release_year ?? item.year)) ??
    (detail && (detail.original_release_year ?? detail.release_year ?? detail.year));
  const year = Number(String(value ?? "").slice(0, 4));
  return Number.isInteger(year) && year > 1870 && year < 2100 ? year : null;
}
function providerArray(response) {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.providers)) return response.providers;
  if (response && Array.isArray(response.items)) return response.items;
  return [];
}
function providerFor(providers, service) {
  const match = providers.find(provider => {
    const labels = [provider.clear_name, provider.name, provider.technical_name, provider.short_name]
      .filter(Boolean).map(value => String(value).toLowerCase());
    return service.aliases.some(alias => labels.some(label => label === alias || label.includes(alias)));
  });
  if (!match) {
    console.warn("Provider not found in JustWatch US provider list: " + service.slug + "; using fallback short code.");
    return service.fallback;
  }
  // JustWatch title-search provider filters use short names (for example nfx / amp).
  return match.short_name || match.technical_name || service.fallback;
}
async function resolveImdb(item, contentType, idMap) {
  const direct = directImdb(item);
  if (direct) return direct;
  const jwId = getJwId(item);
  if (!jwId) return null;
  if (Object.prototype.hasOwnProperty.call(idMap, jwId)) return idMap[jwId] || null;
  if (failedLookups.has(jwId)) return failedLookups.get(jwId);
  await sleep(REQUEST_DELAY_MS);
  try {
    const detail = await justwatch.getTitle(contentType === "series" ? "show" : "movie", jwId);
    const imdb = directImdb(detail);
    if (imdb) idMap[jwId] = imdb;
    else failedLookups.set(jwId, null);
    return imdb;
  } catch (error) {
    console.warn("IMDb lookup failed for JustWatch ID " + jwId + ": " + error.message);
    failedLookups.set(jwId, null);
    return null;
  }
}
function normalize(item, imdb, contentType, detail) {
  const title = item.title || item.name || (detail && (detail.title || detail.name));
  if (!imdb || !title) return null;
  const meta = { id: imdb, type: contentType, name: title, posterShape: "poster" };
  const poster = posterUrl(item.poster || item.poster_url || item.images && item.images.poster || detail && detail.poster);
  const year = yearOf(item, detail);
  const description = item.short_description || item.description || detail && (detail.short_description || detail.description);
  const fullPath = item.full_path || detail && detail.full_path;
  if (poster) meta.poster = poster;
  if (year) meta.releaseInfo = String(year);
  if (description) meta.description = description;
  if (typeof fullPath === "string") {
    const url = fullPath.startsWith("http") ? fullPath : "https://www.justwatch.com" + fullPath;
    meta.links = [{ name: "JustWatch", category: "other", url }];
  }
  return meta;
}
async function fetchFeed(contentType, providerCode) {
  const options = {
    content_types: [contentType === "series" ? "show" : "movie"],
    page_size: PAGE_SIZE
  };
  if (providerCode) {
    options.providers = [providerCode];
    options.monetization_types = ["flatrate"];
  }
  const items = [];
  for (let page = 1; page <= PAGES_PER_FEED; page++) {
    // The package's search() rejects unknown fields; keep to its documented options.
    const response = await justwatch.search({ ...options, page });
    items.push(...extractItems(response));
    await sleep(500);
  }
  return items;
}
async function buildMetas(items, contentType, idMap) {
  const metas = [];
  const used = new Set();
  for (const item of items) {
    const imdb = await resolveImdb(item, contentType, idMap);
    if (!imdb || used.has(imdb)) continue;
    const meta = normalize(item, imdb, contentType, null);
    if (meta) {
      used.add(imdb);
      metas.push(meta);
    }
  }
  return metas;
}
async function writeCatalog(type, id, metas) {
  await writeJson(path.join(SITE, "catalog", type, id + ".json"), { metas });
}
async function main() {
  await fs.mkdir(SITE, { recursive: true });
  await fs.mkdir(SNAPSHOTS, { recursive: true });
  const manifest = await readJson(path.join(ROOT, "manifest.json"), null);
  if (!manifest) throw new Error("manifest.json is missing");
  await writeJson(path.join(SITE, "manifest.json"), manifest);
  await fs.writeFile(path.join(SITE, ".nojekyll"), "");
  const idMap = await readJson(ID_MAP_FILE, {});
  let providers = [];
  try {
    providers = providerArray(await justwatch.getProviders());
  } catch (error) {
    console.warn("Could not load provider list: " + error.message);
  }

  for (const type of ["movie", "series"]) {
    const globalItems = await fetchFeed(type, null);
    const globalMetas = await buildMetas(globalItems, type, idMap);
    const currentYear = new Date().getUTCFullYear();
    const newReleases = globalMetas
      .filter(meta => Number(meta.releaseInfo) >= currentYear - 1)
      .sort((a, b) => Number(b.releaseInfo || 0) - Number(a.releaseInfo || 0));

    await writeCatalog(type, "jw_" + type + "_popular", globalMetas);
    await writeCatalog(type, "jw_" + type + "_trending", globalMetas.slice(0, 50));
    await writeCatalog(type, "jw_" + type + "_new_releases", newReleases);

    const allRecent = [];
    for (const service of SERVICES) {
      const providerCode = providerFor(providers, service);
      let serviceItems = [];
      try {
        serviceItems = await fetchFeed(type, providerCode);
      } catch (error) {
        console.error("Provider feed failed for " + service.slug + " (" + type + "): " + error.message);
      }
      const serviceMetas = await buildMetas(serviceItems, type, idMap);
      const snapshot = path.join(SNAPSHOTS, service.slug + "-" + type + ".json");
      const previousIds = await readJson(snapshot, null);
      const currentIds = serviceMetas.map(meta => meta.id);
      let newlyDetected = [];
      if (Array.isArray(previousIds)) {
        const previous = new Set(previousIds);
        newlyDetected = serviceMetas.filter(meta => !previous.has(meta.id));
      }
      await writeJson(snapshot, currentIds);
      await writeCatalog(type, "jw_" + service.slug + "_" + type + "_popular", serviceMetas);
      await writeCatalog(type, "jw_" + service.slug + "_" + type + "_recently_added", newlyDetected);
      allRecent.push(...newlyDetected);
    }
    const deduped = [...new Map(allRecent.map(meta => [meta.id, meta])).values()];
    await writeCatalog(type, "jw_" + type + "_recently_added", deduped);
  }
  await writeJson(ID_MAP_FILE, idMap);
  console.log("Refresh complete. JustWatch-to-IMDb mappings cached: " + Object.keys(idMap).length);
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

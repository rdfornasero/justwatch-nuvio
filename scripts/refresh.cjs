const fs = require("node:fs/promises");
const path = require("node:path");
const { SimpleJustWatch } = require("simple-justwatch-js");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const SNAPSHOTS = path.join(ROOT, "data", "snapshots");
const COUNTRY = "US";
const LANGUAGE = "en";
const PAGE_SIZE = 100;
const PROVIDER_SAMPLE_LIMIT = 250;
const justwatch = new SimpleJustWatch();

const SERVICES = [
  { slug: "netflix", aliases: ["netflix"] },
  { slug: "prime-video", aliases: ["amazon prime video", "prime video"] },
  { slug: "disney-plus", aliases: ["disney plus", "disney+"] },
  { slug: "hulu", aliases: ["hulu"] },
  { slug: "max", aliases: ["max", "hbo max"] },
  { slug: "apple-tv-plus", aliases: ["apple tv", "apple tv+"] },
  { slug: "paramount-plus", aliases: ["paramount plus", "paramount+"] },
  { slug: "peacock", aliases: ["peacock"] }
];

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}
function connectionItems(connection) {
  if (Array.isArray(connection)) return connection;
  return Array.isArray(connection && connection.edges)
    ? connection.edges.map(edge => edge && edge.node).filter(Boolean)
    : [];
}
function imdbId(item) {
  const id = item && item.externalIds && item.externalIds.imdbId;
  return typeof id === "string" && /^tt\d+$/.test(id) ? id : null;
}
function normalize(item, type) {
  const id = imdbId(item);
  const title = item && item.title;
  if (!id || !title) return null;
  const meta = { id, type, name: title, posterShape: "poster" };
  const poster = item.posterFullUrl || item.posterUrl;
  const year = Number(item.originalReleaseYear);
  if (typeof poster === "string" && /^https?:\/\//i.test(poster)) meta.poster = poster;
  if (Number.isInteger(year) && year > 1870 && year < 2100) meta.releaseInfo = String(year);
  if (item.shortDescription) meta.description = item.shortDescription;
  if (item.url) meta.links = [{ name: "JustWatch", category: "other", url: item.url }];
  return meta;
}
function providerDisplayNames(provider) {
  return [provider.clearName, provider.name, provider.shortName, provider.technicalName, provider.slug]
    .filter(Boolean).map(value => String(value).toLowerCase().trim());
}
function findProvider(providers, service) {
  const exact = providers.find(provider =>
    service.aliases.some(alias => providerDisplayNames(provider).includes(alias))
  );
  if (exact) return exact;
  return providers.find(provider => {
    const labels = providerDisplayNames(provider);
    return service.aliases.some(alias => labels.some(label =>
      label.includes(alias) || alias.includes(label)
    ));
  }) || null;
}
async function getPopular(type, sortBy) {
  const connection = await justwatch.popular({
    country: COUNTRY,
    language: LANGUAGE,
    count: PAGE_SIZE,
    objectTypes: [type === "movie" ? "MOVIE" : "SHOW"],
    sortBy
  });
  return connectionItems(connection);
}
async function getNewReleases(type) {
  const connection = await justwatch.newTitles({
    country: COUNTRY,
    language: LANGUAGE,
    count: PAGE_SIZE,
    objectTypes: [type === "movie" ? "MOVIE" : "SHOW"]
  });
  return connectionItems(connection);
}
async function getProviderTitles(provider, type) {
  return justwatch.titlesByProvider(provider.shortName, {
    country: COUNTRY,
    language: LANGUAGE,
    objectTypes: [type === "movie" ? "MOVIE" : "SHOW"],
    maxCount: PROVIDER_SAMPLE_LIMIT
  });
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

  const providers = await justwatch.providers({ country: COUNTRY, language: LANGUAGE });
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error("JustWatch returned no streaming providers for " + COUNTRY);
  }
  const providerMap = new Map();
  for (const service of SERVICES) {
    const provider = findProvider(providers, service);
    if (provider && provider.shortName) providerMap.set(service.slug, provider);
    else console.warn("Provider not found in JustWatch US directory: " + service.slug);
  }

  for (const type of ["movie", "series"]) {
    const globalPopular = await getPopular(type, "POPULAR");
    const globalTrending = await getPopular(type, "TRENDING");
    const globalNew = await getNewReleases(type);
    const popularMetas = globalPopular.map(item => normalize(item, type)).filter(Boolean);
    const trendingMetas = globalTrending.map(item => normalize(item, type)).filter(Boolean);
    const currentYear = new Date().getUTCFullYear();
    const newMetas = globalNew.map(item => normalize(item, type)).filter(Boolean)
      .filter(meta => Number(meta.releaseInfo) >= currentYear - 1);

    await writeCatalog(type, "jw_" + type + "_popular", popularMetas);
    await writeCatalog(type, "jw_" + type + "_trending", trendingMetas);
    await writeCatalog(type, "jw_" + type + "_new_releases", newMetas);

    const allRecentlyAdded = [];
    for (const service of SERVICES) {
      const provider = providerMap.get(service.slug);
      if (!provider) {
        await writeCatalog(type, "jw_" + service.slug + "_" + type + "_popular", []);
        await writeCatalog(type, "jw_" + service.slug + "_" + type + "_recently_added", []);
        continue;
      }
      try {
        const items = await getProviderTitles(provider, type);
        const metas = items.map(item => normalize(item, type)).filter(Boolean);
        const snapshot = path.join(SNAPSHOTS, service.slug + "-" + type + ".json");
        const previousIds = await readJson(snapshot, null);
        const currentIds = metas.map(meta => meta.id);
        let newlyDetected = [];
        if (Array.isArray(previousIds)) {
          const previous = new Set(previousIds);
          newlyDetected = metas.filter(meta => !previous.has(meta.id));
        }
        // First run is a baseline only; later rows list titles newly appearing in the sampled provider catalogue.
        await writeJson(snapshot, currentIds);
        await writeCatalog(type, "jw_" + service.slug + "_" + type + "_popular", metas);
        await writeCatalog(type, "jw_" + service.slug + "_" + type + "_recently_added", newlyDetected);
        allRecentlyAdded.push(...newlyDetected);
        console.log(service.slug + " " + type + ": " + metas.length + " titles, " + newlyDetected.length + " newly detected");
      } catch (error) {
        console.error("Could not refresh " + service.slug + " " + type + ": " + error.message);
        // Keep existing published files and snapshots intact on a service-specific failure.
      }
    }
    const uniqueRecent = [...new Map(allRecentlyAdded.map(meta => [meta.id, meta])).values()];
    await writeCatalog(type, "jw_" + type + "_recently_added", uniqueRecent);
  }
  console.log("JustWatch refresh finished for " + COUNTRY + ".");
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

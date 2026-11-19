import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const LIMIT = Math.min(200, Math.max(20, Number(process.env.CATALOG_LIMIT || 100)));
const COUNTRY = "US";
const providers = [
  ["netflix", "n"], ["prime-video", "p"], ["disney-plus", "d"], ["hulu", "hulu"],
  ["max", "hbo"], ["apple-tv-plus", "atp"], ["paramount-plus", "pplus"], ["peacock", "pc"]
];
await mkdir(path.join(DATA, "services"), { recursive: true });

function imdbId(item) {
  for (const candidate of [item.imdb_id, item.external_ids?.imdb_id, item.external_ids?.imdb]) {
    if (typeof candidate === "string" && /^tt\d+$/.test(candidate)) return candidate;
  }
  return null;
}
function normalize(item, type) {
  const id = imdbId(item);
  if (!id) return null;
  const year = item.release_year ?? item.original_release_year ?? item.year;
  return {
    id, type,
    name: item.title || item.name || "Untitled",
    poster: item.poster || item.poster_url || item.images?.poster || undefined,
    posterShape: "poster",
    releaseInfo: year ? String(year).slice(0, 4) : undefined,
    description: item.short_description || item.description || undefined
  };
}
async function write(file, metas) {
  const full = path.join(DATA, file);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify({ metas: metas.slice(0, LIMIT) }, null, 2) + "\n");
}
async function getClient() {
  const mod = await import("justwatch-api");
  const Ctor = mod.JustWatch || mod.default?.JustWatch || mod.default;
  if (typeof Ctor !== "function") throw new Error("justwatch-api did not expose a client constructor");
  return new Ctor({ country: COUNTRY });
}
async function query(client, type, options) {
  const methods = type === "movie" ? ["getMovies", "searchMovies"] : ["getShows", "getSeries", "searchShows"];
  for (const name of methods) {
    if (typeof client[name] !== "function") continue;
    const result = await client[name](options);
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.items)) return result.items;
    if (Array.isArray(result?.results)) return result.results;
  }
  throw new Error("No compatible JustWatch query method found for " + type);
}

const client = await getClient();
for (const type of ["movie", "series"]) {
  let all = [];
  try {
    all = await query(client, type, { country: COUNTRY, page: 1, page_size: LIMIT, sort_by: "popularity_desc" });
  } catch (error) {
    console.error("Base query failed for", type, error);
  }
  const metas = all.map(item => normalize(item, type)).filter(Boolean);
  await write(`${type}-popular.json`, metas);
  await write(`${type}-trending.json`, metas);
  const currentYear = new Date().getUTCFullYear();
  await write(`${type}-new-releases.json`, metas.filter(item => Number(item.releaseInfo) >= currentYear - 1));
  // Do not misrepresent original release dates as service-addition dates.
  await write(`${type}-recently-added.json`, []);

  for (const [service, provider] of providers) {
    let serviceItems = [];
    try {
      serviceItems = await query(client, type, {
        country: COUNTRY, page: 1, page_size: LIMIT,
        providers: [provider], monetization_types: ["flatrate"], sort_by: "popularity_desc"
      });
    } catch (error) {
      console.warn(`Provider query failed: ${service}/${type}: ${error.message}`);
    }
    const serviceMetas = serviceItems.map(item => normalize(item, type)).filter(Boolean);
    await write(`services/${service}-${type}-popular.json`, serviceMetas);
    await write(`services/${service}-${type}-recently-added.json`, []);
  }
}
console.log("Refresh finished. Recently-added rows remain empty until a verified addition date is available.");

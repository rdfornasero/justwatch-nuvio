const fs = require("node:fs/promises");
const path = require("node:path");
const { SimpleJustWatch } = require("simple-justwatch-js");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const SNAPSHOTS = path.join(ROOT, "data", "snapshots");
const COUNTRY = "US";
const LANGUAGE = "en";
const CURRENT_YEAR = new Date().getUTCFullYear();
const PAGE_SIZE = 100;
const PROVIDER_SAMPLE_LIMIT = 250;
const justwatch = new SimpleJustWatch();

const SERVICES = [
  { slug: "netflix", aliases: ["netflix"] },
  { slug: "prime-video", aliases: ["amazon prime video", "prime video"] },
  { slug: "disney-plus", aliases: ["disney plus", "disney+"] },
  { slug: "hulu", aliases: ["hulu"] },
  { slug: "max", aliases: ["hbo", "hbo max", "max"] },
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
function getReleaseYear(item) {
  // JustWatch can return far-future placeholder years for announced titles.
  // Prefer the actual ISO release date when available, then fall back to its year.
  const date = typeof item.originalReleaseDate === "string" ? item.originalReleaseDate : "";
  const dateMatch = date.match(/^(\d{4})-\d{2}-\d{2}/);
  const candidate = dateMatch ? Number(dateMatch[1]) : Number(item.originalReleaseYear);
  if (!Number.isInteger(candidate) || candidate < 1888 || candidate > CURRENT_YEAR) return null;
  return candidate;
}
function normalize(item, type) {
  const id = imdbId(item);
  const title = item && item.title;
  if (!id || !title) return null;
  const meta = { id, type, name: title, posterShape: "poster" };
  const poster = item.posterFullUrl || item.posterUrl;
  const year = getReleaseYear(item);
  if (typeof poster === "string" && /^https?:\/\//i.test(poster)) meta.poster = poster;
  if (year) meta.releaseInfo = String(year);
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


const TOP_TEN_QUERY = [
  "query GetStreamingChartInfo(",
  "  $countryStreamingCharts: Country",
  "  $country: Country!",
  "  $language: Language!",
  "  $filter: StreamingChartsFilter",
  "  $first: Int!",
  ") {",
  "  streamingCharts(country: $countryStreamingCharts, filter: $filter, first: $first) {",
  "    edges {",
  "      streamingChartInfo { rank }",
  "      node {",
  "        ... on MovieOrShowOrSeason {",
  "          content(country: $country, language: $language) {",
  "            title",
  "            fullPath",
  "            originalReleaseDate",
  "            originalReleaseYear",
  "            posterUrl(profile: S718, format: JPG)",
  "            externalIds { imdbId }",
  "          }",
  "        }",
  "      }",
  "    }",
  "  }",
  "}"
].join("\n");

async function getTopTenToday(type) {
  const objectType = type === "movie" ? "MOVIE" : "SHOW";
  const response = await fetch("https://apis.justwatch.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Platform": "WEB",
      "User-Agent": "Mozilla/5.0"
    },
    body: JSON.stringify({
      operationName: "GetStreamingChartInfo",
      query: TOP_TEN_QUERY,
      variables: {
        countryStreamingCharts: COUNTRY,
        country: COUNTRY,
        language: LANGUAGE,
        first: 10,
        filter: {
          objectType,
          category: "DAILY_POPULARITY_SAME_CONTENT_TYPE"
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error("JustWatch Top 10 request failed with HTTP " + response.status);
  }
  const payload = await response.json();
  if (payload.errors && !payload.data?.streamingCharts?.edges) {
    throw new Error("JustWatch Top 10 GraphQL error: " +
      (payload.errors[0]?.message || "unknown error"));
  }

  const edges = payload.data?.streamingCharts?.edges;
  if (!Array.isArray(edges)) {
    throw new Error("JustWatch Top 10 response did not contain chart entries");
  }

  const seen = new Set();
  return edges
    .map(edge => {
      const content = edge?.node?.content;
      const id = content?.externalIds?.imdbId;
      const title = content?.title;
      if (typeof id !== "string" || !/^tt\d+$/.test(id) || !title || seen.has(id)) return null;
      seen.add(id);

      const meta = { id, type, name: title, posterShape: "poster" };
      const poster = content.posterUrl;
      if (typeof poster === "string" && poster) {
        meta.poster = poster.startsWith("http")
          ? poster : "https://images.justwatch.com" + poster;
      }
      const date = typeof content.originalReleaseDate === "string" ? content.originalReleaseDate : "";
      const yearMatch = date.match(/^(\d{4})-\d{2}-\d{2}/);
      const year = yearMatch ? Number(yearMatch[1]) : Number(content.originalReleaseYear);
      if (Number.isInteger(year) && year >= 1888 && year <= CURRENT_YEAR) {
        meta.releaseInfo = String(year);
      }
      if (content.fullPath) {
        const url = content.fullPath.startsWith("http")
          ? content.fullPath : "https://www.justwatch.com" + content.fullPath;
        meta.links = [{ name: "JustWatch", category: "other", url }];
      }
      return { rank: Number(edge?.streamingChartInfo?.rank) || Number.MAX_SAFE_INTEGER, meta };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10)
    .map(entry => entry.meta);
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

  // Remove catalogue files retired from the manifest so they are not left on the published site.
  for (const type of ["movie", "series"]) {
    for (const retiredId of ["jw_" + type + "_new_releases", "jw_" + type + "_daily_streaming_charts", ...(type === "movie" ? ["jw_movie_pay_per_view", "tmdb_movie_new_ppv_releases"] : [])]) {
      await fs.rm(path.join(SITE, "catalog", type, retiredId + ".json"), { force: true });
    }
  }

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
    const popularMetas = globalPopular.map(item => normalize(item, type)).filter(Boolean);
    const trendingMetas = globalTrending.map(item => normalize(item, type)).filter(Boolean);

    await writeCatalog(type, "jw_" + type + "_popular", popularMetas);
    await writeCatalog(type, "jw_" + type + "_trending", trendingMetas);

    try {
      const topTen = await getTopTenToday(type);
      if (topTen.length > 0) {
        await writeCatalog(type, "jw_" + type + "_top_10_today", topTen);
        console.log("Top 10 today " + type + ": " + topTen.length + " titles");
      } else {
        console.warn("JustWatch Top 10 today " + type + " returned no valid titles; keeping the last published list.");
      }
    } catch (error) {
      console.error("Could not refresh Top 10 today (" + type + "): " + error.message);
      // Keep the last successfully published Top 10 if JustWatch is temporarily unavailable.
    }



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

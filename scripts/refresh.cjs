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



const BLURAY_TRENDING_URL = "https://www.blu-ray.com/movies/releasedates.php";
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const BLURAY_IMDB_OVERRIDES = new Map([["obsession|2025", "tt37287335"]]);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function htmlText(value) {
  return decodeHtml(String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
function cleanBluRayTitle(value) {
  return htmlText(value)
    .replace(/^\s*\d{1,2}\s*\.?\s*/, "")
    .replace(/\s+(?:4K|UHD|Blu-ray|DVD|3D|SteelBook|Steelbook)+$/i, "")
    .trim();
}
async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MovieCatalogRefresh/1.0; +https://github.com/rdfornasero/justwatch-nuvio)",
      "Accept": "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error("Blu-ray.com request failed with HTTP " + response.status);
  return response.text();
}
async function tmdbGet(endpoint, params = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY GitHub Actions secret is missing.");
  const url = new URL(TMDB_API_BASE + endpoint);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("TMDB request failed with HTTP " + response.status + " for " + endpoint);
  const payload = await response.json();
  if (payload && payload.success === false) {
    throw new Error("TMDB API error: " + (payload.status_message || "unknown error"));
  }
  return payload;
}
async function mapWithConcurrency(items, limit, mapper) {
  const output = [];
  for (let index = 0; index < items.length; index += limit) {
    output.push(...await Promise.all(items.slice(index, index + limit).map(mapper)));
  }
  return output;
}
function getYearNearProductHeading(html) {
  const heading = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  const start = heading ? heading.index + heading[0].length : 0;
  const nearby = htmlText(html.slice(start, start + 9000));
  const match = nearby.match(/\b((?:18|19|20)\d{2})\b/);
  const year = match ? Number(match[1]) : null;
  return Number.isInteger(year) && year >= 1888 && year <= CURRENT_YEAR + 5 ? year : null;
}
async function getBluRayTrendingCandidates() {
  const html = await fetchPage(BLURAY_TRENDING_URL);
  const lower = html.toLowerCase();
  const start = lower.indexOf("trending blu-ray movies");
  const end = start >= 0 ? lower.indexOf("trending in theaters", start) : -1;
  if (start < 0 || end <= start) {
    throw new Error("Could not locate the Trending Blu-ray Movies section.");
  }

  const section = html.slice(start, end);
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const seenUrls = new Set();
  const candidates = [];
  let match;
  while ((match = anchorPattern.exec(section)) !== null && candidates.length < 15) {
    const attrs = match[1];
    const rawHref = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rawHref) continue;
    let url;
    try { url = new URL(rawHref, "https://www.blu-ray.com").toString(); }
    catch { continue; }
    const pathname = new URL(url).pathname;
    if (!/^\/movies\/[^/]+\/\d+\/?$/i.test(pathname) || seenUrls.has(url)) continue;

    const inner = match[2];
    const alt = inner.match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1];
    const title = cleanBluRayTitle(htmlText(inner) || alt || attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1]);
    if (!title) continue;

    seenUrls.add(url);
    candidates.push({ title, url, productId: pathname.match(/\/(\d+)\/?$/)?.[1] || "" });
  }

  if (candidates.length < 10) {
    throw new Error("Only " + candidates.length + " Trending Blu-ray Movies entries were parsed; refusing to replace the last good catalogue.");
  }
  return candidates.slice(0, 15);
}
function normalizedTitle(value) {
  return String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
async function resolveBluRayMovie(candidate) {
  let year = null;
  try {
    const productHtml = await fetchPage(candidate.url);
    year = getYearNearProductHeading(productHtml);
  } catch (error) {
    console.warn("Could not read Blu-ray.com detail page for " + candidate.title + ": " + error.message);
  }

  const search = await tmdbGet("/search/movie", {
    query: candidate.title,
    language: "en-US",
    include_adult: "false",
    ...(year ? { year } : {})
  });
  const results = Array.isArray(search.results) ? search.results : [];
  if (results.length === 0) {
    console.warn("No TMDB match for Blu-ray.com title: " + candidate.title);
    return null;
  }

  const sourceKey = normalizedTitle(candidate.title);
  const exactMatches = results.filter(item => normalizedTitle(item.title) === sourceKey);
  let chosen = year
    ? exactMatches.find(item => String(item.release_date || "").startsWith(String(year)))
    : null;
  if (!chosen && exactMatches.length > 0) chosen = exactMatches[0];
  if (!chosen && results.length === 1) chosen = results[0];
  if (!chosen) {
    console.warn("Ambiguous TMDB match for Blu-ray.com title: " + candidate.title + (year ? " (" + year + ")" : ""));
    return null;
  }

  const details = await tmdbGet("/movie/" + chosen.id, { language: "en-US" });
  const overrideKey = normalizedTitle(candidate.title) + "|" + (year || "");
  const id = details.imdb_id || BLURAY_IMDB_OVERRIDES.get(overrideKey);
  if (typeof id !== "string" || !/^tt\d+$/.test(id)) {
    console.warn("TMDB did not provide an IMDb ID for: " + candidate.title);
    return null;
  }

  const meta = {
    id,
    type: "movie",
    name: details.title || chosen.title || candidate.title,
    posterShape: "poster",
    links: [{ name: "Blu-ray.com", category: "other", url: candidate.url }]
  };
  const poster = details.poster_path || chosen.poster_path;
  if (poster) meta.poster = TMDB_IMAGE_BASE + poster;
  const releaseYear = typeof details.release_date === "string"
    ? Number(details.release_date.slice(0, 4)) : year;
  if (Number.isInteger(releaseYear) && releaseYear >= 1888 && releaseYear <= CURRENT_YEAR + 5) {
    meta.releaseInfo = String(releaseYear);
  }
  if (details.overview) meta.description = details.overview;
  return meta;
}
async function getBluRayTrendingMovies() {
  const candidates = await getBluRayTrendingCandidates();
  console.log("Blu-ray.com Trending top 15: " + candidates.map((item, index) => (index + 1) + ". " + item.title).join(" | "));
  const resolved = await mapWithConcurrency(candidates, 3, async candidate => {
    try { return await resolveBluRayMovie(candidate); }
    catch (error) {
      console.warn("Could not resolve Blu-ray.com title " + candidate.title + ": " + error.message);
      return null;
    }
  });

  const seen = new Set();
  const metas = [];
  for (const meta of resolved) {
    if (!meta || seen.has(meta.id)) continue;
    seen.add(meta.id);
    metas.push(meta);
  }
  if (metas.length < 8) {
    throw new Error("Only " + metas.length + " unique Blu-ray movies were resolved; keeping the last good catalogue.");
  }
  return metas.slice(0, 15);
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

    if (type === "movie") {
      try {
        const bluRayTrending = await getBluRayTrendingMovies();
        await writeCatalog("movie", "bluray_com_trending_movies", bluRayTrending);
        console.log("Blu-ray.com Trending Blu-ray Movies: " + bluRayTrending.length + " unique titles");
      } catch (error) {
        console.error("Could not refresh Blu-ray.com Trending Blu-ray Movies: " + error.message);
        // Keep the last successfully published list if the source or metadata lookup is temporarily unavailable.
      }
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

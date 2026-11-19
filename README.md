# Movie & TV Catalogues for Nuvio

Personal US-region catalogues for Nuvio and other Stremio-protocol clients.

## Catalogue rows

**New PPV Releases** — movies with a US digital release date in the last 90 days and current US rental and/or purchase availability. Discovery is sourced from TMDB's US digital-release calendar (release type 4), rather than JustWatch's general popular-title feed. The scraper checks each title's US availability and keeps only titles with rental and/or purchase offers and no reported subscription, free, or ad-supported offers. Up to four TMDB result pages are checked each day, with the newest digital releases first.

**Top 10 Today** — separate movie and TV show rows containing the ten highest-ranked titles in JustWatch's US daily streaming charts.

**Popular** and **Trending** are general JustWatch US catalogues. Each of the eight subscribed streaming services also has its own **Popular** and **Recently Added** rows for movies and TV shows.

The catalogue does not include combined New Movies / New TV Shows rows, daily chart feeds beyond the Top 10, or pay-per-view TV rows.

## Hosting

This is a static Stremio add-on. GitHub Actions refreshes the catalogue data daily and publishes protocol JSON files to GitHub Pages. The Nvidia Shield only downloads the manifest and JSON catalogues; it does not run the scraper.

The refresh workflow reads the TMDB v3 API key from the repository Actions secret named `TMDB_API_KEY`. The key is not stored in the repository; the script uses TMDB's `api_key` query authentication.

## Installation

Add this manifest URL in Nuvio:

`https://rdfornasero.github.io/justwatch-nuvio/manifest.json`

If Nuvio has cached the previous manifest, remove and reinstall the add-on using the same URL.

## Data sources and limitations

The digital-release discovery uses TMDB's Discover API with US region, digital release type 4, a rolling 90-day release window, and US rent/buy availability filters. TMDB release dates and movie metadata are used for discovery, posters, descriptions, and IMDb identifiers.

The movie watch-provider endpoint is powered by JustWatch. Its use requires attribution to JustWatch; accordingly, this catalogue identifies the availability data source as JustWatch. Availability can be incomplete or change between daily refreshes. TMDB digital release dates indicate a digital home release, not a guaranteed permanent storefront listing.

The scraper checks up to four Discover pages (up to 80 candidate titles) per daily run. Titles without a valid IMDb ID are omitted because the Nuvio catalogue uses IMDb identifiers. If TMDB is unavailable or the secret is missing, the last successfully published PPV catalogue is retained.

Top 10 and streaming-service catalogue rows continue to use JustWatch's unofficial, community-maintained client and undocumented public GraphQL endpoint. Provider identifiers are taken from JustWatch's current US provider directory. HBO is mapped to JustWatch's HBO/Max provider.

Recently Added is an approximation: the scraper compares each provider's sampled catalogue (up to 250 titles) against the previous daily sample. The first run establishes the baseline. Later rows show titles newly detected in the sample; this is not an official exact service-addition timestamp.

This add-on supplies catalogue rows only. It does not supply streams, watch history or recommendations.

This product uses the TMDB API but is not endorsed or certified by TMDB.

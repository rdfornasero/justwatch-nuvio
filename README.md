# JustWatch Catalogues for Nuvio

Personal US-region catalogues for Nuvio and other Stremio-protocol clients.

## Catalogue rows

**New Movies** and **New TV Shows** are built only from these subscribed services: Netflix, Prime Video, Apple TV+, HBO/Max, Hulu, Disney+, Peacock and Paramount+. Titles are deduplicated across services.

The new-release rows use JustWatch's release-year-sorted feed for each subscribed provider and include titles from the current and previous calendar year. Future placeholder years (for example 2032 or 2099) are rejected rather than displayed as release years.

**Popular** and **Trending** remain general JustWatch US catalogues. Each service also has its own Popular and Recently Added rows for movies and TV shows.

## Hosting

This is a static Stremio add-on. GitHub Actions refreshes the catalogue data daily and publishes protocol JSON files to GitHub Pages. The Nvidia Shield only downloads the manifest and JSON catalogues; it does not run the scraper.

## One-time setup

1. Open this repository's **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. The workflow runs automatically after code changes and daily at 10:23 UTC. You can also run it from **Actions → Refresh and publish JustWatch catalogues → Run workflow**.
4. Once a workflow succeeds, add this manifest URL in Nuvio:

   `https://rdfornasero.github.io/justwatch-nuvio/manifest.json`

5. On the Shield, open **Nuvio → Settings → Addons → Add Addon**, paste the URL and install.

## Data limitations

The scraper uses `simple-justwatch-js`, an unofficial, community-maintained client for JustWatch's undocumented public GraphQL endpoint. The endpoint or schema may change without notice. Keep request volume reasonable.

Provider identifiers are taken from JustWatch's current US provider directory. HBO is mapped to JustWatch's HBO/Max provider. Titles are included only when JustWatch supplies a valid IMDb ID.

Release years are read from JustWatch's original release date/year. Future placeholder years are omitted from all rows. The New Movies and New TV Shows rows additionally require a valid release year between the previous calendar year and the current year, and must appear in at least one of the eight subscribed-service feeds.

Recently Added is an approximation: the scraper compares each provider's sampled catalogue (up to 250 titles) against the previous daily sample. The first run establishes the baseline and leaves these rows empty. Later rows show titles newly detected in the sample; this is not an official exact service-addition timestamp.

Trending and Popular use JustWatch's distinct sort modes. This add-on supplies catalogue rows only; it does not supply streams, watch history or recommendations.

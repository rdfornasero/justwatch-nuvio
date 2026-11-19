# JustWatch Catalogues for Nuvio

Personal US-region catalogues for Nuvio and other Stremio-protocol clients.

## Catalogue rows

General movies and TV: New Releases, Trending, Popular and Recently Added.

Streaming services: Netflix, Prime Video, Disney+, Hulu, Max, Apple TV+, Paramount+ and Peacock, each with Popular and Recently Added rows for movies and TV.

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

The scraper uses `simple-justwatch-js`, an unofficial, community-maintained client for JustWatch's public GraphQL endpoint. The endpoint is undocumented and may change without notice. The library author explicitly warns users about possible schema changes and rate limits. Use this for a personal project and keep request volume reasonable.

Provider identifiers are taken from JustWatch's current US provider directory. The add-on includes only titles with a valid IMDb ID in JustWatch's result.

Recently Added is an approximation: the scraper compares each provider's sampled catalogue (up to 250 titles) against the previous daily sample. The first run establishes the baseline and leaves these rows empty. Later rows show titles newly detected in the sample; this is not an official exact service-addition timestamp. If a title moves into the sampled popularity window later, it may appear as newly detected.

Trending and Popular use JustWatch's separate sort modes. New Releases uses JustWatch's release-year sort and includes the current and previous calendar year.

This add-on supplies catalogue rows only. It does not supply streams, watch history or recommendations; your existing Nuvio add-ons continue to handle playback and other metadata.

# JustWatch Catalogues for Nuvio

Personal US-region catalogues for Nuvio and Stremio-protocol clients.

## Catalogue rows

General movies and TV: New Releases, Trending, Popular and Recently Added.

Streaming services: Netflix, Prime Video, Disney+, Hulu, Max, Apple TV+, Paramount+ and Peacock, each with Popular and Recently Added rows for movies and TV.

## Hosting

This is a static Stremio add-on. GitHub Actions refreshes the catalogue data daily and publishes protocol JSON files to GitHub Pages. The Nvidia Shield only downloads the manifest and JSON catalogues; it does not run the scraper.

## One-time setup

1. Open this repository's **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. After Pages is enabled, the push-triggered workflow will run automatically. You can also run it from **Actions → Refresh and publish JustWatch catalogues → Run workflow**.
4. Once a workflow succeeds, add this manifest URL in Nuvio:

   `https://rdfornasero.github.io/justwatch-nuvio/manifest.json`

5. On the Shield, open **Nuvio → Settings → Addons → Add Addon**, paste the URL and install.

The workflow refreshes daily at 10:23 UTC.

## Data limitations

The scraper uses the community-maintained `justwatch-api` Node package. It is unofficial, unsupported by JustWatch, may break when JustWatch changes its private endpoints, and is limited by that package's private non-commercial use notice. Please respect rate limits.

Provider filters are selected using JustWatch's US provider directory and the provider's short code. Only titles for which an IMDb ID can be read or resolved are included.

Recently Added is an approximation: the scraper compares each service's sampled JustWatch popularity feed against the previous day's sample. The first run establishes a baseline and leaves these rows empty. Later rows show titles newly detected in that sample; that is not an official release-date or guaranteed platform-addition timestamp. The sample is limited to two pages per feed.

Trending is a leading subset of the popularity results, not a separate official trending metric. New Releases uses the original release year (current year and previous year).

This add-on supplies catalogue rows only. It does not supply streams, watch history or recommendations; your existing Nuvio add-ons continue to handle playback and other metadata.

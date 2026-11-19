# JustWatch Catalogues for Nuvio

Personal US-region catalogues for Nuvio and other Stremio-protocol clients.

## Catalogue rows

**Popular** and **Trending** are general JustWatch US catalogues. Each of the eight subscribed streaming services also has its own **Popular** and **Recently Added** rows for movies and TV shows.

The catalogue intentionally avoids combined New Movies / New TV Shows and daily streaming-chart rows. Those feeds could produce overlapping or inconsistent selections alongside the service-specific catalogues.

## Hosting

This is a static Stremio add-on. GitHub Actions refreshes the catalogue data daily and publishes protocol JSON files to GitHub Pages. The Nvidia Shield only downloads the manifest and JSON catalogues; it does not run the scraper.

## Installation

Add this manifest URL in Nuvio:

`https://rdfornasero.github.io/justwatch-nuvio/manifest.json`

If Nuvio has cached the previous manifest, remove and reinstall the add-on using the same URL.

## Data limitations

The scraper uses `simple-justwatch-js`, an unofficial, community-maintained client for JustWatch's undocumented public GraphQL endpoint. The endpoint or schema may change without notice. Keep request volume reasonable.

Provider identifiers are taken from JustWatch's current US provider directory. HBO is mapped to JustWatch's HBO/Max provider. Titles are included only when JustWatch supplies a valid IMDb ID.

Release years are read from JustWatch's original release date/year. Future placeholder years are omitted from all rows.

Recently Added is an approximation: the scraper compares each provider's sampled catalogue (up to 250 titles) against the previous daily sample. The first run establishes the baseline. Later rows show titles newly detected in the sample; this is not an official exact service-addition timestamp.

This add-on supplies catalogue rows only. It does not supply streams, watch history or recommendations.

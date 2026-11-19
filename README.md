# JustWatch Catalogues for Nuvio

Personal US-region catalogues for Nuvio and other Stremio-protocol clients.

## Catalogue rows

**Today's Streaming Charts** — separate movie and TV show rows using JustWatch's daily popularity chart, restricted to titles available through the subscribed services listed below.

**New Movies** and **New TV Shows** — titles from Netflix, Prime Video, Apple TV+, HBO/Max, Hulu, Disney+, Peacock and Paramount+. Titles are deduplicated across the subscribed services.

The new-release rows use JustWatch's release-year-sorted feed for each subscribed provider and include titles from the current and previous calendar year. Future placeholder years (for example 2032 or 2099) are rejected rather than displayed as release years.

**Popular** and **Trending** remain general JustWatch US catalogues. Each streaming service also has its own Popular and Recently Added rows for movies and TV shows.

## Hosting

This is a static Stremio add-on. GitHub Actions refreshes the catalogue data daily and publishes protocol JSON files to GitHub Pages. The Nvidia Shield only downloads the manifest and JSON catalogues; it does not run the scraper.

## Installation

Add this manifest URL in Nuvio:

`https://rdfornasero.github.io/justwatch-nuvio/manifest.json`

If Nuvio has cached the previous manifest, remove and reinstall the add-on using the same URL.

## Data limitations

The scraper uses `simple-justwatch-js`, an unofficial, community-maintained client for JustWatch's undocumented public GraphQL endpoint. The endpoint or schema may change without notice. Keep request volume reasonable.

Provider identifiers are taken from JustWatch's current US provider directory. HBO is mapped to JustWatch's HBO/Max provider. Titles are included only when JustWatch supplies a valid IMDb ID.

Today's Streaming Charts uses JustWatch's distinct daily chart category (`DAILY_POPULARITY_SAME_CONTENT_TYPE`) rather than its general Trending sort. The chart is filtered to the set of subscribed provider packages, and the results are ordered by JustWatch's daily rank. Titles with future release dates are excluded.

Release years are read from JustWatch's original release date/year. Future placeholder years are omitted from all rows. New Movies and New TV Shows require a valid release year between the previous calendar year and the current year, and must appear in at least one subscribed-service feed.

Recently Added is an approximation: the scraper compares each provider's sampled catalogue (up to 250 titles) against the previous daily sample. The first run establishes the baseline. Later rows show titles newly detected in the sample; this is not an official exact service-addition timestamp.

This add-on supplies catalogue rows only. It does not supply streams, watch history or recommendations.

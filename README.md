# JustWatch Catalogues for Nuvio

A personal, US-region catalogue add-on for Nuvio and other Stremio-protocol clients.

## Catalogues

**General:** New Releases, Trending, Popular and Recently Added — separate rows for movies and TV shows.

**Streaming services:** Netflix, Prime Video, Disney+, Hulu, Max, Apple TV+, Paramount+ and Peacock — Popular and Recently Added rows for movies and TV shows.

## Hosting

This is a **static Stremio add-on**. GitHub Actions collects catalogue data once per day and deploys static protocol files to GitHub Pages. The Nvidia Shield only downloads the manifest and catalogue JSON; it does not run the scraper or need to stay online.

The published site contains `/manifest.json` and `/catalog/{movie|series}/{catalog-id}.json`.

## One-time setup

1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Open **Actions → Refresh and publish JustWatch catalogues** and select **Run workflow**.
4. After the workflow succeeds, use this manifest URL in Nuvio:

   `https://rdfornasero.github.io/justwatch-nuvio/manifest.json`

5. On the Shield, open **Nuvio → Settings → Addons → Add Addon**, paste the URL, and install.

The first run creates the catalogue baseline. The workflow is scheduled daily at 10:23 UTC.

## Accuracy and limitations

This is a personal project using the community-maintained, unofficial `justwatch-api` package. It is not supported by JustWatch and may stop working if JustWatch changes its private endpoints. The package's own notice restricts use to private, non-commercial projects and asks users to avoid excessive API calls.

The public unofficial interface provides a popularity-oriented feed with provider filters; it does not document a guaranteed exact date-added-to-service field. **Recently Added** is therefore derived by comparing a service's sampled feed with the previous daily snapshot. The first run intentionally leaves these rows empty while it records the baseline. Later rows contain titles newly detected in that sampled feed, which is an approximation rather than a verified launch date from the streaming service. The scraper samples the first two pages per feed.

**Trending** is the leading subset of JustWatch's popularity feed, not a separate official streaming-chart metric.

A title is included only if an IMDb ID can be resolved. The add-on provides catalogue rows only — no streams, watch history or recommendations — so your existing Nuvio metadata and streaming add-ons remain responsible for the rest of the experience.

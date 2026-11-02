# Drop-Off Buddy

Find a central public meetup point for a carpool of 2–10 riders, worldwide. No account or API key is required.

## Run locally

```bash
npm install
npm run setup:photon-us
```

The setup downloads the official Photon U.S. index (about 10.5 GB compressed) and Photon server into the ignored `.local-photon/` folder. It is one U.S.-wide, internally consistent OpenStreetMap index instead of a pile of state extracts. Java 21+ and ample free disk space are required; the included setup script can resume the large download.

In one terminal, start the local geocoder:

```bash
npm run photon
```

In another terminal, start the app:

```bash
npm run dev
```

Open `http://localhost:4178`. On localhost, searches use the local U.S. Photon index first and the public global Photon service when local results are missing. Do not open `index.html` directly as a `file://` URL; the app needs to be served over HTTP.

## How it works

1. Global autocomplete searches Photon/OpenStreetMap for numbered addresses, named roads, intersections, schools, and other places. A U.S. Census address-range lookup is an additional fallback for complete U.S. addresses.
2. Selected locations are checked to keep riders within 250 km of one another, then their coordinates are averaged for a center point.
3. Photon/OpenStreetMap is searched for nearby parks, libraries, colleges, universities, and clearly identified high schools. Preschools, kindergartens, elementary, and primary schools are excluded as meetup suggestions.
4. Pick the closest suggestion or switch to a second nearby meetup, then open directions or share the pickup plan.

International address coverage comes from OpenStreetMap-powered Photon. A local U.S. index is used when it has matches, with the public global Photon service used when the local index has none. Coverage varies by country and map contributions; there is no single official census/address dataset for every nation. Census is used only for U.S. address ranges, which can return interpolated road positions and do not confirm a rooftop or that every structure number exists.

If map data contains no suitable nearby public venue, the app shows the true center coordinate and says it could not confirm a public venue. Map data does not prove that a site is open, accessible, or safe at a given time; confirm the location before meeting.

## Privacy and accounts

There is no login system or cloud account in this version. Carpool inputs remain in page memory and are cleared when the page is refreshed or closed; the app does not save them to local storage. Address searches are sent to Photon (local first on localhost, then the public service if needed); complete U.S. addresses can be sent to the Census Geocoder. Current location is requested only after the user taps the location button. Do not enter information you do not want sent to those services. Account-backed saving requires a real authentication/backend setup and is not simulated in the client.

## Services and data sources

- [Photon](https://github.com/komoot/photon) provides address, road, and nearby-place search from OpenStreetMap data.
- [Photon U.S. database downloads](https://download1.graphhopper.com/public/north-america/usa/) provide the prebuilt U.S. index used by the local server.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) provides the map data and tiles.
- [U.S. Census Geocoder](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html) provides a nationwide address-range fallback for complete numbered addresses. Its locations are interpolated along Census address ranges, not guaranteed rooftop locations.
- [Leaflet](https://leafletjs.com/) displays the map.

When the local index is running, address text and selected coordinates are sent to the local Photon service on this computer. If local Photon is unavailable, the app queries the free public Photon service. A complete numbered U.S. address may be sent to the Census Geocoder to resolve an address range. Drop-Off Buddy does not store addresses on its own server.

## Build

```bash
npm run build
```

# Drop-Off Buddy

Find a central public meetup point for a carpool of 2–10 riders. No account or API key required.

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

Open `http://localhost:4178`. On localhost, address and meetup searches prefer the local Photon index and fall back to the public Photon server if it is unavailable. Do not open `index.html` directly as a `file://` URL; the app needs to be served over HTTP.

## How it works

1. U.S.-only autocomplete searches Photon/OpenStreetMap for numbered addresses, named roads, intersections, schools, and other places. When a full numbered address is entered, the U.S. Census Geocoder can add a nationwide address-range match if Photon has no exact numbered result. Current location is accepted only after confirming it is in the U.S.
2. Selected locations are checked to keep riders within 100 km of one another, then their coordinates are averaged for a center point.
3. Photon/OpenStreetMap place data is searched for a nearby public meetup location.
4. The result appears on an interactive map with directions and a shareable pickup message.

Photon results use the U.S. coverage available from OpenStreetMap at its published snapshot date. Search and map tiles use the same OpenStreetMap source, though indexes and live tiles can reflect different update times. No community map guarantees every road or numbered building. The Census fallback searches national address ranges; it can return a standardized, interpolated point along a road and does not confirm a rooftop, current occupancy, or that every structure number exists.

If map data contains no public venue within 10 km, the app shows the true center coordinate and says it could not confirm a public venue. Map data does not prove that a site is open, accessible, or safe at a given time; confirm the location before meeting.

## Services and privacy

- [Photon](https://github.com/komoot/photon) provides local U.S.-only address and road search, plus nearby public-place search.
- [Photon U.S. database downloads](https://download1.graphhopper.com/public/north-america/usa/) provide the prebuilt U.S. index used by the local server.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) provides the map data and tiles.
- [U.S. Census Geocoder](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html) provides a nationwide address-range fallback for complete numbered addresses. Its locations are interpolated along Census address ranges, not guaranteed rooftop locations.
- [Leaflet](https://leafletjs.com/) displays the map.

When the local index is running, address text and selected coordinates are sent to the local Photon service on this computer. If local Photon is unavailable, the app queries the free public Photon service. A complete numbered U.S. address may be sent to the Census Geocoder to resolve an address range. Drop-Off Buddy does not store addresses on its own server.

## Build

```bash
npm run build
```

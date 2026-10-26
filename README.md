# Drop-Off Buddy

Find a central public meetup point for a carpool of 2–5 riders. No account or API key required.

## Run locally

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Open the localhost URL printed by Vite. Do not open `index.html` directly as a `file://` URL; the app needs to be served over HTTP.

## How it works

1. Search each rider’s address and select the matching result.
2. Drop a pin for each selected home and calculate the center of their coordinates.
3. Search OpenStreetMap data through Photon for a nearby library, school, or park.
4. Show the result on the map with directions and a shareable pickup message.

If map data contains no public venue within 10 km, the app shows the true center coordinate and says it could not confirm a public venue. The map data does not prove that a site is open, accessible, or safe at a given time; confirm the location before meeting.

## Services and privacy

- [Photon](https://github.com/komoot/photon) provides address search using OpenStreetMap data.
- [Photon](https://github.com/komoot/photon) searches for nearby public places as well as addresses.
- [Leaflet](https://leafletjs.com/) displays [OpenStreetMap](https://www.openstreetmap.org/copyright) map tiles.

The public Photon service is free to use without an API key, but it has capacity limits and no availability guarantee. Address text is sent to Photon only when a rider searches; selected coordinates are sent to Photon to find nearby public places. Drop-Off Buddy does not save addresses.

## Build

```bash
npm run build
```

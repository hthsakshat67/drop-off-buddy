# Drop-Off Buddy

Drop-Off Buddy finds a fair, public carpool meet-up point for small teams. It uses free OpenStreetMap data and open-source Leaflet maps, with no accounts, paid APIs, or API keys.

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Included

- Responsive setup screen for 2–5 riders
- Free address suggestions via OpenStreetMap Nominatim
- Coordinate centroid calculation and nearby library, school, or park lookup through Overpass
- Interactive OpenStreetMap with rider pins and a highlighted meetup
- Try-the-demo mode with labeled sample addresses in Princeton, New Jersey
- Native sharing and Google Maps directions links
- Smooth reveal and responsive layout
- Native share support with clipboard fallback
- Production build via `npm run build`

## Data and availability

Live lookup uses community-run OpenStreetMap services. They are free, but rate-limited and can be temporarily unavailable. The demo mode works without address lookup and makes no network request for a rider's address. Tiles and Google Fonts load from their public hosts when online. The map uses OpenStreetMap contributors data.

Addresses are only held in page memory. They are sent to Nominatim when a rider chooses an address and to Overpass as coordinates for nearby public-place lookup. They are not stored by this app.

Opening `index.html` directly as a `file://` URL is not supported because Vite serves the JavaScript modules. Start the local server with `npm run dev -- --host 0.0.0.0` and open the localhost URL Vite prints.

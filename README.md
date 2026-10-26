# Drop-Off Buddy

Drop-Off Buddy finds a fair, public carpool meet-up point for small teams. This free prototype uses local UI data and a visual map so it runs without accounts, paid APIs, or API keys.

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Included

- Responsive setup screen for 2–5 riders
- Add/remove riders and address validation guardrails
- Animated map-style visual with home pins and a highlighted meet-up
- Smooth reveal of the recommended “sweet spot”
- Native share support with clipboard fallback
- Production build via `npm run build`

## Next production step

Replace the local demo coordinates with a free-tier geocoder and POI provider (for example, OpenStreetMap Nominatim + Overpass with appropriate rate limiting) before handling real addresses. Keep API calls behind a small serverless proxy so home addresses are not exposed in client-side source.

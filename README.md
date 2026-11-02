# Drop-Off Buddy

Plan a central public meetup for a carpool of 2–10 riders. Search addresses and public places worldwide, compare nearby meetup options, share directions, and optionally save plans to a private account.

## Run locally

Requires Node.js 22.13+ (the backend uses Node's built-in SQLite module).

```bash
npm install
npm run dev
```

Open `http://localhost:4178`. The app and its API run together; account and saved-trip records are stored in `.data/drop-off-buddy.sqlite` (ignored by Git). This SQLite database is free and local to this installation. It starts empty—there are no sample accounts or trips. No account is needed to plan, and nothing is saved unless a signed-in user taps **Save this carpool**. Back up the `.data` folder if you need to preserve local accounts between machine or disk changes.

Optional: download and run the U.S. Photon index for local-first U.S. searches. This requires Java 21+, ample disk space, and a large download.

```bash
npm run setup:photon-us
npm run photon
```

The local index is used first when running; Photon’s public global endpoint is used when local results are missing or unavailable.

## Accounts and privacy

- Passwords are stored as salted scrypt hashes, never plaintext. The app requires 12–128 characters for new passwords.
- Login sessions use random, HTTP-only, SameSite cookies; only token hashes are stored in SQLite. Login/signup requests are rate limited, and write requests reject cross-origin browser origins.
- Saved trips are scoped to the account that created them. Users can reopen or delete their own saved trips. Password recovery/email verification are not configured; the app has no email delivery service.
- This is a self-hosted local backend, not a hosted cloud database. Other people can only use the same account database if you deploy the server and database to a shared, durable host. For an internet-facing deployment, use HTTPS and a persistent, backed-up disk; protect the host and database file. Do not expose port 4179 directly to the internet.
- Address search is provided by Photon/OpenStreetMap (public network service by default); complete U.S. numbered addresses can also be sent to the U.S. Census Geocoder. Current location is requested only after the user opts in. A saved trip contains the addresses/coordinates and meetup details, and is written only after an explicit save action.

## How it works

1. Photon/OpenStreetMap autocomplete finds numbered addresses, named roads, intersections, schools, and other places worldwide. Coverage depends on available OpenStreetMap data; no single official census/address source covers every country. The Census fallback applies only to U.S. addresses and can interpolate a point along a road rather than verify a rooftop.
2. Selected points are checked against the 250 km group limit, then averaged to compute a central point.
3. Photon/OpenStreetMap is queried for public libraries, parks, colleges, universities, and clearly identified high schools. Preschools, kindergartens, elementary and primary schools are excluded as meetup suggestions. Venue data does not prove a location is open, accessible, or safe at a particular time; verify before meeting.
4. Choose a nearby option or a second suggestion, open map directions, share, or explicitly save the plan to your account.

## Build, serve, and test

```bash
npm run build
npm start
```

`npm start` serves the production build and API on port 4179 (or `$PORT`). Run `npm test` for backend tests covering signup, persistent storage, private account ownership, logout, password policy, and cross-origin rejection.

## Data and libraries

- [Photon](https://github.com/komoot/photon) and [OpenStreetMap](https://www.openstreetmap.org/copyright): worldwide address/place search and map tiles.
- [U.S. Census Geocoder](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html): U.S.-only numbered-address fallback.
- [Leaflet](https://leafletjs.com/): interactive map.
- Node.js built-ins (`node:sqlite`, HTTP, crypto): local persistence and account/session backend.
- [Photon U.S. database downloads](https://download1.graphhopper.com/public/north-america/usa/): optional large local U.S. search index.

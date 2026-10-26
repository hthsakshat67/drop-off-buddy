import './styles.css';
import './overrides.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const demoHomes = [
  { address: '12 Willow Lane, Princeton, NJ', coords: [40.3395, -74.6690] },
  { address: '48 Maple Street, Princeton, NJ', coords: [40.3615, -74.6417] },
  { address: '7 Pine Avenue, Princeton, NJ', coords: [40.3368, -74.6472] },
  { address: '19 Birch Road, Princeton, NJ', coords: [40.3541, -74.6261] },
  { address: '82 Cedar Court, Princeton, NJ', coords: [40.3701, -74.6612] },
];

const demoMeetup = { name: 'Princeton Public Library', address: '65 Witherspoon Street', coords: [40.3498, -74.6591], type: 'Library' };
const blankRider = (id) => ({ id, name: `Rider ${id}`, address: '', coords: null, suggestions: [], loading: false });
let riders = [blankRider(1), blankRider(2), blankRider(3)];
let nextRiderId = 4;
let map;
let markers = [];
let activeResult = null;
let mode = 'live';
let toastTimer;

const app = document.querySelector('#app');

function centroid(points) {
  return points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0]);
}

function escapeHTML(value = '') {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function render() {
  app.innerHTML = `
    <div class="app-shell">
      <nav class="topbar"><a class="brand" href="#top"><span class="brand-mark"><i></i><i></i><i></i></span><span>drop-off <b>buddy</b></span></a><div class="topbar-right"><span class="free-badge"><i></i> Free to use</span><a class="nav-link" href="#how-it-works">How it works <span>↗</span></a><button class="help-button" id="privacy-help" aria-label="Privacy information">?</button></div></nav>
      <main id="top">
        <section class="hero"><div class="hero-copy-block"><p class="eyebrow"><span class="eyebrow-star">✳</span> A better way to get there together</p><h1>Meet in the<br><em>middle of it all.</em></h1><p class="hero-sub">One fair, easy-to-reach meetup for the whole crew. Less driving around. More time doing what you came for.</p><div class="hero-meta"><span class="avatar-stack"><i>J</i><i>M</i><i>A</i><i>+</i></span><span>Made for teams, clubs &amp; busy families</span></div></div><div class="hero-stamp"><span class="stamp-star">✳</span><span>SHARE<br>THE RIDE</span></div></section>
        <section class="planner" aria-label="Carpool planner">
          <div class="planner-form"><div class="planner-head"><div><span class="kicker">LET’S PLAN YOUR PICKUP</span><h2>Who’s in the car?</h2></div><span class="rider-count" id="rider-count">${riders.length}<span> / 5</span></span></div>
            <p class="section-copy">Add each rider’s address. We’ll find a central spot that’s easy for everyone.</p>
            <div id="rider-list" class="rider-list">${riders.map(riderRow).join('')}</div>
            <button class="add-rider" id="add-rider" ${riders.length >= 5 ? 'disabled' : ''}><span>＋</span> Add another rider</button>
            <div class="map-mode"><span class="mode-label">LOCATION SOURCE</span><div class="mode-switch"><button class="${mode === 'live' ? 'selected' : ''}" data-mode="live">My addresses</button><button class="${mode === 'demo' ? 'selected' : ''}" data-mode="demo">Try the demo</button></div></div>
            <button class="find-button" id="find-point"><span class="button-icon">⌖</span><span>Find our meetup spot</span><b>→</b></button>
            <div class="privacy-note"><span>♧</span><span>Address text goes to OpenStreetMap only when searched. Drop-Off Buddy never stores it.</span></div>
            <div class="form-error" id="form-error" role="alert"></div>
          </div>
          <div class="map-wrap"><div class="map-header"><div><span class="map-live-dot"></span><span id="map-status">READY WHEN YOU ARE</span></div><span class="map-attribution-label">OPEN MAP</span></div><div id="map" role="application" aria-label="Interactive map showing rider addresses and their suggested meeting point"></div><div class="map-footer"><span class="map-legend"><i class="legend-rider"></i> Rider homes <i class="legend-meet"></i> Meetup</span><button id="reset-map" class="map-reset">Reset view ↗</button></div></div>
        </section>
        <section class="result-section" id="result-section" aria-live="polite"></section>
        <section class="how-it-works" id="how-it-works"><div class="how-heading"><span class="kicker">NO MORE 47-MESSAGE THREADS</span><h2>Three little steps.<br><em>A much easier ride.</em></h2></div><div class="steps"><article><span class="step-number">01 / ADD THE CREW</span><div class="step-art art-one"><span>⌂</span><span>⌂</span><span>⌂</span><i>+</i></div><h3>Drop in the addresses</h3><p>Start with two riders, add up to five. Our address search helps pinpoint the right place.</p></article><article><span class="step-number">02 / FIND THE FAIR SPOT</span><div class="step-art art-two"><i>✳</i><span></span><span></span></div><h3>Meet halfway, simply</h3><p>We average the coordinates, then look for a nearby public place to meet.</p></article><article><span class="step-number">03 / SEND ONE TEXT</span><div class="step-art art-three"><div>Meet you here! <b>↗</b></div><span>▰ ▰ ▰</span></div><h3>Share the plan</h3><p>Send the meeting spot and map link to the group chat. Done, and done.</p></article></div></section>
        <section class="bottom-banner"><span>LESS SOLO DRIVING. MORE TEAM SPIRIT.</span><p>Good things happen when we<br><em>get there together.</em></p><a href="#top">Plan a carpool <b>↑</b></a><span class="banner-flower">✳</span></section>
      </main><footer><a class="brand footer-brand" href="#top"><span class="brand-mark"><i></i><i></i><i></i></span><span>drop-off <b>buddy</b></span></a><span>Less driving, more living.</span><span>Open map data · Privacy-first · Free</span></footer>
    </div>`;
  bindEvents();
  initializeMap();
  if (activeResult) showResult(activeResult, false);
}

function riderRow(rider, index) {
  const suggestionList = rider.suggestions?.length ? `<div class="suggestions" role="listbox">${rider.suggestions.map((item, itemIndex) => `<button class="suggestion" type="button" data-suggest="${rider.id}" data-choice="${itemIndex}"><span class="suggestion-icon">⌖</span><span><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.display)}</small></span></button>`).join('')}</div>` : '';
  return `<div class="rider-row" data-rider="${rider.id}"><span class="rider-index">${String(index + 1).padStart(2, '0')}</span><div class="address-field"><label for="address-${rider.id}">${escapeHTML(rider.name)}</label><div class="input-wrap"><span class="input-pin">⌖</span><input id="address-${rider.id}" value="${escapeHTML(rider.address)}" autocomplete="off" placeholder="Enter an address, then search" aria-label="${escapeHTML(rider.name)} address"/><button class="lookup-address" data-geocode="${rider.id}" aria-label="Search address for ${escapeHTML(rider.name)}" ${rider.loading ? 'disabled' : ''}>${rider.loading ? '…' : rider.coords ? '✓' : '↵'}</button></div>${suggestionList}</div><button class="remove-rider" data-remove="${rider.id}" aria-label="Remove ${escapeHTML(rider.name)}" ${riders.length <= 2 ? 'disabled' : ''}>×</button></div>`;
}

function initializeMap() {
  if (map) { map.remove(); map = null; }
  map = L.map('map', { zoomControl: false, scrollWheelZoom: true, attributionControl: false }).setView([40.35, -74.65], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>').addTo(map);
  markers = [];
  if (activeResult) drawResult(activeResult);
  requestAnimationFrame(() => map.invalidateSize());
}

function markerIcon(kind, number = '') {
  const inner = kind === 'meet' ? '<span>✳</span>' : `<span>${number}</span>`;
  return L.divIcon({ className: `custom-marker marker-${kind}`, html: `<div class="marker-bubble">${inner}</div>`, iconSize: kind === 'meet' ? [46, 54] : [34, 42], iconAnchor: kind === 'meet' ? [23, 50] : [17, 39] });
}

function drawResult(result) {
  if (!map) return;
  markers.forEach((marker) => marker.remove()); markers = [];
  const homePoints = result.homes;
  homePoints.forEach((home, index) => {
    const marker = L.marker(home.coords, { icon: markerIcon('home', index + 1) }).addTo(map).bindTooltip(`<b>Rider ${index + 1}</b><br>${escapeHTML(home.address)}`);
    markers.push(marker);
  });
  const meetup = L.marker(result.spot.coords, { icon: markerIcon('meet') }).addTo(map).bindTooltip(`<b>${escapeHTML(result.spot.name)}</b><br>${escapeHTML(result.spot.address)}`);
  markers.push(meetup);
  const bounds = L.latLngBounds([...homePoints.map((home) => home.coords), result.spot.coords]);
  map.fitBounds(bounds.pad(.32), { animate: true, maxZoom: 14 });
}

function bindEvents() {
  document.querySelector('#add-rider').addEventListener('click', () => {
    if (riders.length >= 5) return;
    riders.push(blankRider(nextRiderId++)); render(); document.querySelector(`#address-${riders.at(-1).id}`)?.focus();
  });
  const riderList = document.querySelector('#rider-list');
  riderList.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove && riders.length > 2) {
      riders = riders.filter((rider) => rider.id !== Number(remove.dataset.remove)); activeResult = null; clearResult(); render(); return;
    }
    const suggestion = event.target.closest('[data-suggest]');
    if (suggestion) chooseSuggestion(Number(suggestion.dataset.suggest), Number(suggestion.dataset.choice));
    const geocode = event.target.closest('[data-geocode]');
    if (geocode) lookupSuggestions(Number(geocode.dataset.geocode));
  });
  riderList.addEventListener('input', (event) => {
    if (event.target.matches('.address-field input')) {
      const rider = riders.find((item) => item.id === Number(event.target.id.replace('address-', '')));
      if (!rider) return;
      rider.address = event.target.value; rider.coords = null; rider.suggestions = [];
      if (activeResult) { activeResult = null; clearResult(); }
      event.target.closest('.address-field').querySelector('.suggestions')?.remove();
      const button = event.target.closest('.input-wrap').querySelector('.lookup-address');
      if (button) { button.textContent = '↵'; button.disabled = false; }
    }
  });
  riderList.addEventListener('keydown', (event) => {
    if (event.target.matches('.address-field input')) {
      if (event.key === 'Enter') { event.preventDefault(); const rider = riders.find((item) => item.id === Number(event.target.id.replace('address-', ''))); if (rider.suggestions.length) chooseSuggestion(rider.id, 0); else lookupSuggestions(rider.id); }
      if (event.key === 'Escape') { const rider = riders.find((item) => item.id === Number(event.target.id.replace('address-', ''))); rider.suggestions = []; renderRidersOnly(); }
    }
  });
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mode; riders = [blankRider(1), blankRider(2), blankRider(3)]; nextRiderId = 4; activeResult = null; clearResult(); render();
    if (mode === 'demo') { riders.forEach((rider, i) => { rider.address = demoHomes[i].address; rider.coords = demoHomes[i].coords; }); render(); }
  }));
  document.querySelector('#find-point').addEventListener('click', findMeetup);
  document.querySelector('#reset-map').addEventListener('click', () => { if (activeResult) drawResult(activeResult); else map.setView([40.35, -74.65], 12); });
  document.querySelector('#privacy-help').addEventListener('click', () => toast('Addresses are looked up only when you search. They are held in memory and disappear when you close this page.'));
}

function renderRidersOnly() {
  const list = document.querySelector('#rider-list');
  if (!list) return;
  list.innerHTML = riders.map(riderRow).join('');
  document.querySelector('#rider-count').innerHTML = `${riders.length}<span> / 5</span>`;
}

async function lookupSuggestions(id) {
  if (mode !== 'live') { toast('Switch to My addresses to search a real location.'); return; }
  const rider = riders.find((item) => item.id === id);
  if (!rider || rider.address.length < 3) return;
  rider.loading = true; renderRidersOnly();
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: rider.address, format: 'jsonv2', addressdetails: '1', limit: '5' });
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Address lookup is temporarily unavailable.');
    const results = await response.json();
    rider.suggestions = results.map((item) => ({ name: item.name || item.display_name.split(',')[0], display: item.display_name, coords: [Number(item.lat), Number(item.lon)] }));
    if (!results.length) rider.suggestions = [];
  } catch {
    rider.suggestions = [];
    toast('Live address search is unavailable right now. Choose “Try the demo” to explore without an account or API key.');
  } finally { rider.loading = false; renderRidersOnly(); }
}

function chooseSuggestion(id, index) {
  const rider = riders.find((item) => item.id === id); const choice = rider?.suggestions[index];
  if (!choice) return;
  rider.address = choice.display; rider.coords = choice.coords; rider.suggestions = [];
  const input = document.querySelector(`#address-${id}`); if (input) input.value = rider.address;
  renderRidersOnly();
}

async function findMeetup() {
  const error = document.querySelector('#form-error'); error.textContent = '';
  const filled = riders.filter((rider) => rider.address.trim());
  if (filled.length < 2) { error.textContent = 'Add at least two rider addresses to find a meetup.'; return; }
  let homes;
  if (mode === 'demo') {
    homes = filled.map((rider) => ({ address: rider.address, coords: rider.coords })).filter((home) => home.coords);
  } else {
    homes = filled.filter((rider) => rider.coords).map((rider) => ({ address: rider.address, coords: rider.coords }));
    if (homes.length !== filled.length) { error.textContent = 'Choose a suggested address for each rider first. This makes sure we can calculate the center accurately.'; return; }
  }
  const button = document.querySelector('#find-point'); button.classList.add('working'); button.querySelector('span:nth-child(2)').textContent = 'Finding a fair meetup…';
  try {
    const center = centroid(homes.map((home) => home.coords));
    const spot = mode === 'demo' ? demoMeetup : await findNearbyPublicPlace(center);
    activeResult = { homes, center, spot, demo: mode === 'demo' };
    showResult(activeResult, true);
  } catch (errorValue) {
    error.textContent = errorValue.message || 'We couldn’t find a nearby public place. Try again in a moment.';
  } finally { button.classList.remove('working'); button.querySelector('span:nth-child(2)').textContent = 'Find our meetup spot'; }
}

async function findNearbyPublicPlace(center) {
  const query = `[out:json][timeout:15];(node(around:3000,${center[0]},${center[1]})["amenity"~"^(library|school)$"];way(around:3000,${center[0]},${center[1]})["amenity"~"^(library|school)$"];node(around:3000,${center[0]},${center[1]})["leisure"="park"];way(around:3000,${center[0]},${center[1]})["leisure"="park"];);out center tags;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: `data=${encodeURIComponent(query)}` });
  if (!response.ok) throw new Error('The free public-place search is busy. Try again in a moment or use the demo.');
  const data = await response.json();
  const places = data.elements.map((item) => {
    const tags = item.tags || {}; const coords = item.lat ? [item.lat, item.lon] : [item.center?.lat, item.center?.lon];
    const name = tags.name || tags['name:en']; if (!name || !coords[0]) return null;
    const type = tags.amenity === 'library' ? 'Library' : tags.amenity === 'school' ? 'School' : 'Public park';
    const distance = distanceKm(center, coords);
    return { name, type, coords, distance, address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || `${distance.toFixed(1)} km from your group’s center` };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
  if (!places.length) throw new Error('No library, school, or park showed up within 3 km. Try a wider area or use the demo.');
  return places[0];
}

function distanceKm(a, b) {
  const rad = Math.PI / 180; const dLat = (b[0] - a[0]) * rad; const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function showResult(result, scroll) {
  const { spot, homes, center, demo } = result;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.address}`)}&query_place_id=`;
  const km = distanceKm(center, spot.coords);
  document.querySelector('#map-status').textContent = demo ? 'DEMO ROUTE · SAMPLE ADDRESSES' : 'YOUR MEETUP IS READY';
  drawResult(result);
  document.querySelector('#result-section').innerHTML = `<div class="result-card"><div class="result-topline"><span>✳&nbsp; YOUR CREW’S SWEET SPOT</span><span>${demo ? 'SAMPLE RESULT' : `${homes.length} RIDERS · ${km.toFixed(1)} KM FROM CENTER`}</span></div><div class="result-body"><div class="result-pin-icon">⌖</div><div class="result-place"><span class="kicker">${escapeHTML(spot.type || 'PUBLIC MEETUP')}</span><h2>${escapeHTML(spot.name)}</h2><p>${escapeHTML(spot.address)}</p></div><div class="fairness"><b>●</b><span>Central<br>for everyone</span></div></div><div class="result-bottom"><span><i>◉</i> A public place near your group’s center</span><div><a class="directions-button" href="${mapsLink}" target="_blank" rel="noreferrer">Open directions <b>↗</b></a><button class="share-button" id="share-button">Share with the crew <b>↑</b></button></div></div></div>`;
  document.querySelector('#share-button').addEventListener('click', () => sharePlan(spot));
  document.querySelector('#result-section').classList.add('visible');
  if (scroll) document.querySelector('#result-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearResult() {
  document.querySelector('#result-section').classList.remove('visible');
  document.querySelector('#result-section').innerHTML = '';
  document.querySelector('#map-status').textContent = mode === 'demo' ? 'DEMO ROUTE · SAMPLE ADDRESSES' : 'READY WHEN YOU ARE';
  markers.forEach((marker) => marker.remove()); markers = [];
}

async function sharePlan(spot) {
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.address}`)}`;
  const text = `Hey team! Our Drop-Off Buddy meetup is ${spot.name}, ${spot.address}. See you there! ${mapLink}`;
  try { if (navigator.share) await navigator.share({ title: 'Our carpool meetup', text, url: mapLink }); else { await navigator.clipboard.writeText(text); toast('Carpool plan copied — paste it into your team chat.'); } }
  catch (error) { if (error.name !== 'AbortError') toast('Could not open sharing right now. You can copy the meetup details from the card.'); }
}

function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) { node = document.createElement('div'); node.className = 'toast'; node.setAttribute('role', 'status'); document.body.append(node); }
  node.textContent = message; node.classList.add('toast-visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('toast-visible'), 4500);
}

render();

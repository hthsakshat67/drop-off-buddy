import './styles.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const app = document.querySelector('#app');
const riders = [];
let nextId = 1;
let map;
let markers = [];
let result = null;

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function addRider(address = '') {
  riders.push({ id: nextId++, address, point: null, matches: [], loading: false });
}
addRider(); addRider();

function render() {
  app.innerHTML = `
    <div class="page">
      <header class="topbar" id="top"><a class="wordmark" href="#top" aria-label="Drop-Off Buddy home"><span>DROP-OFF<br><b>BUDDY</b></span></a><a class="top-cta" href="#planner">PLAN A PICKUP <span>↓</span></a></header>
      <main>
        <section class="hero" data-reveal><div class="hero-copy"><p class="eyebrow"><span></span> CARPOOL PICKUPS, FIGURED OUT</p><h1>Meet in the<br><strong>middle of it all.</strong></h1><p class="hero-text">Add your crew’s addresses. Get the fairest central point and a nearby public place to meet.</p><a class="hero-link" href="#planner">Find your meetup <b>↓</b></a></div><div class="hero-art"><img src="/drop-off-buddy-art.png" alt="Drop-Off Buddy — a carpool crew heading out together"/><span class="art-caption">LESS DRIVING. MORE TEAM TIME.</span></div></section>
        <section class="planner" id="planner" data-reveal><div class="planner-head"><div><p class="eyebrow"><span></span> YOUR CARPOOL</p><h2>Where’s everyone starting?</h2><p class="planner-hint">Search and select each rider’s address. We’ll do the rest.</p></div><div class="rider-count"><b id="rider-count">${riders.length}</b><span> / 5 riders</span></div></div>
          <div class="riders" id="riders">${riders.map(riderMarkup).join('')}</div>
          <div class="form-controls"><button class="add-button" id="add-rider" ${riders.length >= 5 ? 'disabled' : ''}><span>＋</span> Add rider</button><button class="find-button" id="find-meetup" disabled><span>Find meetup</span><b>→</b></button></div>
          <p class="privacy"><span>⌖</span> Address searches go to Photon using OpenStreetMap data. Drop-Off Buddy never saves addresses.</p>
          <p class="error-message" id="error-message" role="alert"></p>
        </section>
        <section class="map-section" data-reveal><div class="map-heading"><div><p class="eyebrow"><span></span> THE MEETUP MAP</p><h2 id="map-title">Your crew, on one map.</h2></div><button id="reset-map" class="reset-map" hidden>RESET VIEW ↗</button></div><div class="map-frame"><div id="map" aria-label="Interactive map of rider locations and the suggested meetup point"></div><div class="map-empty" id="map-empty"><span class="map-empty-mark">⌖</span><p>Pick rider addresses to see them here.</p></div></div><div class="map-legend"><span><i class="home-dot"></i> RIDER HOME</span><span><i class="meet-dot"></i> MEETUP</span><small>© OpenStreetMap contributors</small></div></section>
        <section class="result" id="result" aria-live="polite"></section>
        <section class="how" data-reveal><div class="how-title"><p class="eyebrow"><span></span> QUICK AND FAIR</p><h2>Three steps.<br><strong>One less group chat.</strong></h2></div><div class="how-steps"><article><b>01</b><h3>Add addresses</h3><p>Search a street or place and select the match for each rider.</p></article><article><b>02</b><h3>Find the middle</h3><p>We average everyone’s coordinates and find a nearby library, school, or park.</p></article><article><b>03</b><h3>Share the plan</h3><p>Send the meetup and directions to your team in one tap.</p></article></div></section>
      </main><footer><a class="wordmark footer-mark" href="#top"><span>DROP-OFF <b>BUDDY</b></span></a><span>Made for getting there together.</span><span>FREE · OPEN MAP DATA</span></footer>
    </div>`;
  bindEvents();
  initializeMap();
  observeSections();
  updateFindButton();
  if (result) showResult(result, false);
}

function riderMarkup(rider, index) {
  const choices = rider.matches.length ? `<div class="address-choices">${rider.matches.map((match, i) => `<button class="address-choice" type="button" data-rider-choice="${rider.id}" data-choice="${i}"><span class="choice-pin">⌖</span><span><b>${esc(match.title)}</b><small>${esc(match.detail)}</small></span></button>`).join('')}</div>` : '';
  return `<div class="rider" data-rider-row="${rider.id}"><span class="rider-num">${String(index + 1).padStart(2, '0')}</span><div class="address-entry"><label for="address-${rider.id}">RIDER ${index + 1} ${rider.point ? '<span class="verified">✓ SELECTED</span>' : ''}</label><div class="address-input"><input id="address-${rider.id}" type="search" value="${esc(rider.address)}" placeholder="Street address, city, state or ZIP" autocomplete="off"/><button class="search-address" data-search="${rider.id}" ${rider.loading ? 'disabled' : ''} aria-label="Search this address">${rider.loading ? '…' : 'SEARCH'}</button></div>${choices}</div><button class="remove-rider" data-remove="${rider.id}" aria-label="Remove rider ${index + 1}" ${riders.length <= 2 ? 'disabled' : ''}>×</button></div>`;
}

function bindEvents() {
  document.querySelector('#add-rider').addEventListener('click', () => {
    if (riders.length >= 5) return;
    result = null;
    addRider(); render(); document.querySelector(`#address-${riders.at(-1).id}`)?.focus();
  });
  document.querySelector('#riders').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove && riders.length > 2) { const rider = riders.find((item) => item.id === Number(remove.dataset.remove)); if (rider) { riders.splice(riders.indexOf(rider), 1); result = null; render(); } return; }
    const search = event.target.closest('[data-search]');
    if (search) searchAddress(Number(search.dataset.search));
    const choice = event.target.closest('[data-rider-choice]');
    if (choice) selectAddress(Number(choice.dataset.riderChoice), Number(choice.dataset.choice));
  });
  document.querySelector('#riders').addEventListener('input', (event) => {
    if (!event.target.matches('input')) return;
    const rider = riders.find((item) => item.id === Number(event.target.id.replace('address-', '')));
    if (!rider) return;
    rider.address = event.target.value; rider.point = null; rider.matches = []; result = null;
    clearResultUI();
    event.target.closest('.address-entry').querySelector('.address-choices')?.remove();
    event.target.closest('.rider').querySelector('label').innerHTML = `RIDER ${riders.indexOf(rider) + 1}`;
    updateFindButton(); renderMarkers();
  });
  document.querySelector('#riders').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('input')) { event.preventDefault(); const rider = riders.find((item) => item.id === Number(event.target.id.replace('address-', ''))); if (rider) searchAddress(rider.id); }
  });
  document.querySelector('#find-meetup').addEventListener('click', findMeetup);
  document.querySelector('#reset-map').addEventListener('click', fitMap);
}

async function searchAddress(id) {
  const rider = riders.find((item) => item.id === id);
  if (!rider || rider.address.trim().length < 3) { setError('Enter a full street address, city, and region.'); return; }
  rider.loading = true; setError(''); renderRiders();
  try {
    const url = new URL('https://photon.komoot.io/api/');
    url.search = new URLSearchParams({ q: rider.address, limit: '5', lang: 'en' });
    const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
    if (!response.ok) throw new Error('Address search is busy. Please try again.');
    const data = await response.json();
    rider.matches = (data.features || []).map((feature) => {
      const p = feature.properties || {}; const c = feature.geometry?.coordinates;
      if (!c || c.length < 2) return null;
      const title = [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street].filter(Boolean).join(' · ') || p.street || p.name || 'Address result';
      const detail = [p.city || p.district, p.state, p.country].filter(Boolean).join(', ');
      return { title, detail, full: [title, detail].filter(Boolean).join(', '), coords: [c[1], c[0]], type: p.type };
    }).filter(Boolean);
    if (!rider.matches.length) setError(`No match found for “${rider.address}”. Try adding the city, state, or ZIP code.`);
  } catch (error) {
    setError(error.name === 'TimeoutError' ? 'Address search took too long. Check your connection and try again.' : error.message || 'Could not reach the free address search. Try again in a moment.');
  } finally { rider.loading = false; renderRiders(); }
}

function selectAddress(id, choiceIndex) {
  const rider = riders.find((item) => item.id === id); const choice = rider?.matches[choiceIndex];
  if (!rider || !choice) return;
  rider.point = { address: choice.full, coords: choice.coords }; rider.address = choice.full; rider.matches = [];
  setError(''); renderRiders(); updateFindButton(); renderMarkers();
}

function renderRiders() {
  const container = document.querySelector('#riders'); if (!container) return;
  container.innerHTML = riders.map(riderMarkup).join('');
  document.querySelector('#rider-count').textContent = riders.length;
}

function updateFindButton() {
  const button = document.querySelector('#find-meetup');
  if (!button) return;
  const count = riders.filter((rider) => rider.point).length;
  button.disabled = count < 2;
  button.innerHTML = count < 2 ? `<span>Find meetup</span><b>→</b>` : `<span>Find meetup for ${count} riders</span><b>→</b>`;
}

function setError(message) { const node = document.querySelector('#error-message'); if (node) node.textContent = message; }

function clearResultUI() {
  const node = document.querySelector('#result');
  if (node) { node.innerHTML = ''; node.classList.remove('show'); }
  const heading = document.querySelector('#map-title');
  if (heading) heading.textContent = 'Your crew, on one map.';
}

function initializeMap() {
  if (map) map.remove();
  map = L.map('map', { zoomControl: false, attributionControl: false, scrollWheelZoom: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>').addTo(map);
  requestAnimationFrame(() => map.invalidateSize()); renderMarkers();
}

function icon(type, number = '') {
  const html = type === 'meet' ? '<span>✦</span>' : `<span>${number}</span>`;
  return L.divIcon({ className: `buddy-marker ${type}`, html: `<i>${html}</i>`, iconSize: type === 'meet' ? [44, 52] : [34, 42], iconAnchor: type === 'meet' ? [22, 48] : [17, 39] });
}

function renderMarkers() {
  if (!map) return;
  markers.forEach((marker) => marker.remove()); markers = [];
  riders.forEach((rider, index) => {
    if (!rider.point) return;
    markers.push(L.marker(rider.point.coords, { icon: icon('home', index + 1) }).addTo(map).bindTooltip(`Rider ${index + 1}: ${esc(rider.address)}`));
  });
  if (result?.spot?.coords) markers.push(L.marker(result.spot.coords, { icon: icon('meet') }).addTo(map).bindTooltip(esc(result.spot.name)));
  const reset = document.querySelector('#reset-map');
  if (reset) reset.hidden = markers.length === 0;
  document.querySelector('#map-empty')?.classList.toggle('hidden', riders.some((rider) => rider.point));
  if (markers.length) fitMap();
}

function fitMap() {
  if (!map) return;
  const coords = riders.filter((rider) => rider.point).map((rider) => rider.point.coords);
  if (result?.spot?.coords) coords.push(result.spot.coords);
  if (coords.length > 1) map.fitBounds(L.latLngBounds(coords).pad(.24), { animate: true, maxZoom: 15 });
  else if (coords.length === 1) map.setView(coords[0], 14, { animate: true });
}

function meanCenter(points) {
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

function distanceKm(a, b) {
  const rad = Math.PI / 180; const dLat = (b[0] - a[0]) * rad; const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function findMeetup() {
  const button = document.querySelector('#find-meetup'); const ready = riders.filter((rider) => rider.point);
  if (ready.length < 2) return;
  button.disabled = true; button.innerHTML = '<span>Finding the best meetup…</span><b class="spinner">◌</b>'; setError('');
  const center = meanCenter(ready.map((rider) => rider.point.coords));
  try {
    const spot = await findPublicPlace(center);
    result = { center, spot, riders: ready };
    showResult(result, true); renderMarkers();
  } catch (error) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${center[0]},${center[1]}`;
    result = { center, spot: { name: 'Your group’s central point', address: `${center[0].toFixed(5)}, ${center[1].toFixed(5)}`, coords: center, type: 'CENTROID' }, riders: ready, unavailable: true, message: error.message };
    showResult(result, true, mapUrl); renderMarkers();
  } finally { updateFindButton(); }
}

async function findPublicPlace(center) {
  const url = new URL('https://photon.komoot.io/reverse');
  url.search = new URLSearchParams({ lat: String(center[0]), lon: String(center[1]), radius: '10', limit: '30', lang: 'en' });
  ['amenity:library', 'amenity:school', 'leisure:park'].forEach((tag) => url.searchParams.append('osm_tag', tag));
  const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error('The open map place search is temporarily unavailable. The map shows your exact center point.');
  const data = await response.json();
  const places = (data.features || []).map((feature) => {
    const p = feature.properties || {}; const coords = [feature.geometry?.coordinates?.[1], feature.geometry?.coordinates?.[0]];
    if (!coords[0]) return null;
    const type = p.osm_key === 'amenity' && p.osm_value === 'library' ? 'PUBLIC LIBRARY' : p.osm_key === 'amenity' && p.osm_value === 'school' ? 'SCHOOL' : p.osm_key === 'leisure' && p.osm_value === 'park' ? 'PUBLIC PARK' : null;
    if (!type) return null;
    const title = [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street].filter(Boolean).join(' · ') || type.replace('PUBLIC ', '');
    const address = [p.street, p.city, p.state].filter(Boolean).join(', ') || `${(distanceKm(center, coords) * 1000).toFixed(0)} m from your group’s center`;
    return { name: title, type, address, coords, distance: distanceKm(center, coords) };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
  if (places.length) return places[0];
  throw new Error('No public park, school, or library was listed within 10 km. The map shows your group’s exact center instead.');
}

function showResult(data, scroll, mapUrlOverride) {
  const { spot, riders: group, center, unavailable, message } = data;
  const mapUrl = mapUrlOverride || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.address}`)}`;
  const km = distanceKm(center, spot.coords);
  document.querySelector('#map-title').textContent = unavailable ? 'Your group’s central point.' : 'Your meetup is ready.';
  document.querySelector('#result').innerHTML = `<article class="result-card ${unavailable ? 'result-warning' : ''}"><div class="result-label"><span>${unavailable ? 'CENTROID · CHECK A PUBLIC VENUE' : `MEETUP FOR ${group.length} RIDERS`}</span><span>${unavailable ? 'MAP DATA LIMIT' : `${(km * 1000).toFixed(0)} M FROM CENTER`}</span></div><div class="result-main"><span class="result-icon">${unavailable ? '⌖' : '✦'}</span><div class="result-name"><small>${esc(spot.type)}</small><h2>${esc(spot.name)}</h2><p>${esc(spot.address)}</p></div></div>${unavailable ? `<p class="result-message">${esc(message)}</p>` : ''}<div class="result-footer"><span>STRAIGHT-LINE CENTER · PUBLIC MAP DATA</span><div><a href="${mapUrl}" target="_blank" rel="noreferrer" class="directions">OPEN DIRECTIONS <b>↗</b></a><button class="share" id="share">SHARE PICKUP <b>↑</b></button></div></div></article>`;
  document.querySelector('#share').addEventListener('click', () => share(data));
  document.querySelector('#result').classList.add('show');
  if (scroll) document.querySelector('#result').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function share(data) {
  const { spot } = data; const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.address}`)}`;
  const text = `Carpool meetup: ${spot.name}, ${spot.address}. Directions: ${url}`;
  try { if (navigator.share) await navigator.share({ title: 'Carpool meetup', text, url }); else { await navigator.clipboard.writeText(text); showToast('Pickup details copied. Paste them into your team chat.'); } }
  catch (error) { if (error.name !== 'AbortError') showToast('Sharing was unavailable. Copy the directions link from the meetup card.'); }
}

let toastTimer;
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; toast.setAttribute('role', 'status'); document.body.append(toast); }
  toast.textContent = message; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

function observeSections() {
  const sections = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) { sections.forEach((section) => section.classList.add('revealed')); return; }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); } }), { threshold: .12 });
  sections.forEach((section) => observer.observe(section));
}

render();

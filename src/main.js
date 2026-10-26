import './styles.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const app = document.querySelector('#app');
const riders = [];
let nextId = 1;
let map;
let markers = [];
let result = null;
const MAX_RIDERS = 10;
let censusRequestId = 0;
const PUBLIC_PHOTON = 'https://photon.komoot.io';
const LOCAL_PHOTON = 'http://127.0.0.1:2322';
const US_STATE_NAMES = {
  Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA', Colorado:'CO', Connecticut:'CT', Delaware:'DE', Florida:'FL', Georgia:'GA', Hawaii:'HI', Idaho:'ID', Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS', Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD', Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS', Missouri:'MO', Montana:'MT', Nebraska:'NE', Nevada:'NV', 'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY', 'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK', Oregon:'OR', Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC', 'South Dakota':'SD', Tennessee:'TN', Texas:'TX', Utah:'UT', Vermont:'VT', Virginia:'VA', Washington:'WA', 'West Virginia':'WV', Wisconsin:'WI', Wyoming:'WY', 'District of Columbia':'DC',
};

async function photonRequest(path, params, signal) {
  const configured = import.meta.env.VITE_PHOTON_URL?.replace(/\/$/, '');
  const localPage = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const bases = configured ? [configured, PUBLIC_PHOTON] : localPage ? [LOCAL_PHOTON, PUBLIC_PHOTON] : [PUBLIC_PHOTON];
  let lastError;
  for (const base of [...new Set(bases)]) {
    const url = new URL(path, `${base}/`);
    url.search = params.toString();
    try {
      const local = base === LOCAL_PHOTON || base === configured;
      const timeout = AbortSignal.timeout(local ? 5000 : 18000);
      const response = await fetch(url, { signal: AbortSignal.any([signal, timeout]) });
      if (!response.ok) throw new Error(`Photon returned ${response.status}.`);
      return await response.json();
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Photon address search is unavailable.');
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function addRider(address = '') {
  riders.push({ id: nextId++, address, point: null, matches: [], loading: false, searchTimer: null, searchController: null, searchToken: 0 });
}
addRider(); addRider();

function render() {
  app.innerHTML = `
    <div class="page">
      <header class="topbar" id="top"><a class="wordmark" href="#top" aria-label="Drop-Off Buddy home"><span>DROP-OFF<br><b>BUDDY</b></span></a><a class="top-cta" href="#planner">PLAN A PICKUP <span>↓</span></a></header>
      <main>
        <section class="hero" data-reveal><div class="hero-copy"><p class="eyebrow">CARPOOL PICKUPS, FIGURED OUT</p><h1>Meet in the<br><strong>middle of it all.</strong></h1><p class="hero-text">Add your crew’s addresses. Get the fairest central point and a nearby public place to meet.</p><a class="hero-link" href="#planner">Find your meetup <b>↓</b></a></div><div class="hero-art"><img src="/drop-off-buddy-art.png" alt="Drop-Off Buddy — a carpool crew heading out together"/><span class="art-caption">LESS DRIVING. MORE TEAM TIME.</span></div></section>
        <section class="planner" id="planner" data-reveal><div class="planner-head"><div><p class="eyebrow"><span></span> YOUR CARPOOL</p><h2>Where’s everyone starting?</h2><p class="planner-hint">Search a numbered street address, road, or school anywhere in the U.S. Choose the exact match or use your location.</p></div><div class="rider-count"><b id="rider-count">${riders.length}</b><span> / ${MAX_RIDERS} riders</span></div></div>
          <div class="riders" id="riders">${riders.map(riderMarkup).join('')}</div>
        <div class="form-controls"><div class="rider-actions"><button class="add-button" id="add-rider" ${riders.length >= MAX_RIDERS ? 'disabled' : ''}><span>＋</span> Add rider</button><button class="location-button" id="use-location" ${riders.length >= MAX_RIDERS ? 'disabled' : ''}>⌖ Use my location</button></div><button class="find-button" id="find-meetup" disabled><span>Find meetup</span><b>→</b></button></div>
      <p class="privacy"><span>⌖</span> U.S.-only address search via Photon and Census; GPS is opt-in.</p>
          <p class="error-message" id="error-message" role="alert"></p>
        </section>
        <section class="map-section" data-reveal><div class="map-heading"><div><p class="eyebrow"><span></span> THE MEETUP MAP</p><h2 id="map-title">Your crew, on one map.</h2></div><button id="reset-map" class="reset-map" hidden>RESET VIEW ↗</button></div><div class="map-frame"><div id="map" aria-label="Interactive map of rider locations and the suggested meetup point"></div><div class="map-empty" id="map-empty"><span class="map-empty-mark">⌖</span><p>Pick rider addresses to see them here.</p></div></div><div class="map-legend"><span><i class="home-dot"></i> RIDER HOME</span><span><i class="meet-dot"></i> MEETUP</span><small>© OpenStreetMap contributors</small></div></section>
        <section class="result" id="result" aria-live="polite"></section>
        <section class="how" data-reveal><div class="how-title"><p class="eyebrow">QUICK &amp; EASY</p><h2>Three steps.<br><strong>One less group chat.</strong></h2></div><div class="how-steps"><article><b>01</b><h3>Add addresses</h3><p>Type part of an address or a school and choose a matching suggestion.</p></article><article><b>02</b><h3>Find the middle</h3><p>We average everyone’s coordinates and find a nearby library, school, or park.</p></article><article><b>03</b><h3>Share the plan</h3><p>Send the meetup and directions to your team in one tap.</p></article></div></section>
      </main><footer><a class="wordmark footer-mark" href="#top"><span>DROP-OFF <b>BUDDY</b></span></a><span>Made for getting there together.</span><span>FREE · OPEN MAP DATA</span></footer>
    </div>`;
  bindEvents();
  initializeMap();
  observeSections();
  updateFindButton();
  if (result) showResult(result, false);
}

function riderMarkup(rider, index) {
  const choices = rider.matches.length ? `<div class="address-choices">${rider.matches.map((match, i) => `<button class="address-choice" type="button" data-rider-choice="${rider.id}" data-choice="${i}"><span class="choice-pin">⌖</span><span class="choice-copy"><b>${esc(match.title)}</b><small>${esc(match.detail)}${match.placeType ? ` · ${esc(match.placeType)}` : ''}</small></span></button>`).join('')}</div>` : '';
  return `<div class="rider" data-rider-row="${rider.id}"><span class="rider-num">${String(index + 1).padStart(2, '0')}</span><div class="address-entry"><label for="address-${rider.id}">RIDER ${index + 1} ${rider.point ? '<span class="verified">✓ SELECTED</span>' : ''}</label><div class="address-input"><input id="address-${rider.id}" type="search" value="${esc(rider.address)}" placeholder="House number, street, town, state, ZIP" autocomplete="off"/><button class="search-address" data-search="${rider.id}" ${rider.loading ? 'disabled' : ''} aria-label="Search this address">${rider.loading ? '…' : 'SEARCH'}</button></div><div class="address-suggestions" data-suggestions="${rider.id}">${choices}</div></div><button class="remove-rider" data-remove="${rider.id}" aria-label="Remove rider ${index + 1}" ${riders.length <= 2 ? 'disabled' : ''}>×</button></div>`;
}

function bindEvents() {
  document.querySelector('#add-rider').addEventListener('click', () => {
    if (riders.length >= MAX_RIDERS) return;
    result = null;
    addRider(); render(); document.querySelector(`#address-${riders.at(-1).id}`)?.focus();
  });
  document.querySelector('#use-location').addEventListener('click', useCurrentLocation);
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
    clearTimeout(rider.searchTimer); rider.searchController?.abort(); rider.searchToken++;
    clearResultUI();
    renderSuggestions(rider);
    event.target.closest('.rider').querySelector('label').innerHTML = `RIDER ${riders.indexOf(rider) + 1}`;
    updateFindButton(); renderMarkers();
    if (rider.address.trim().length >= 3) rider.searchTimer = setTimeout(() => searchAddress(rider.id, true), 600);
  });
  document.querySelector('#riders').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('input')) { event.preventDefault(); const rider = riders.find((item) => item.id === Number(event.target.id.replace('address-', ''))); if (rider) searchAddress(rider.id); }
  });
  document.querySelector('#find-meetup').addEventListener('click', findMeetup);
  document.querySelector('#reset-map').addEventListener('click', fitMap);
}

function renderSuggestions(rider) {
  const box = document.querySelector(`[data-suggestions="${rider.id}"]`);
  if (!box) return;
  box.innerHTML = rider.matches.length ? `<div class="suggestion-heading">${rider.matches.length} MATCHES <span>Choose the right address</span></div><div class="address-choices">${rider.matches.map((match, i) => `<button class="address-choice" type="button" data-rider-choice="${rider.id}" data-choice="${i}"><span class="choice-pin">⌖</span><span class="choice-copy"><b>${esc(match.title)}</b><small>${esc(match.detail)}${match.placeType ? ` · ${esc(match.placeType)}` : ''}</small></span></button>`).join('')}</div>` : '';
}

function useCurrentLocation() {
  if (riders.length >= MAX_RIDERS) { setError(`This carpool already has ${MAX_RIDERS} riders.`); return; }
  if (!navigator.geolocation) { setError('This browser can’t provide a current location. Enter an address instead.'); return; }
  const button = document.querySelector('#use-location');
  if (button) { button.disabled = true; button.textContent = 'Getting location…'; }
  setError('');
  navigator.geolocation.getCurrentPosition(async (position) => {
    if (riders.length >= MAX_RIDERS) {
      render();
      setError(`This carpool reached the ${MAX_RIDERS}-rider limit while location was loading.`);
      return;
    }
    const coords = [position.coords.latitude, position.coords.longitude];
    try {
      const params = new URLSearchParams({ lat: String(coords[0]), lon: String(coords[1]), limit: '1' });
      const nearby = await photonRequest('/reverse', params, new AbortController().signal);
      if (!nearby.features?.some((feature) => String(feature.properties?.countrycode || '').toLowerCase() === 'us')) {
        setError('Current location is outside the United States. Choose a U.S. address instead.');
        if (button) { button.disabled = false; button.innerHTML = '⌖ Use my location'; }
        return;
      }
    } catch {
      setError('Could not confirm this location is in the United States. Enter a U.S. address instead.');
      if (button) { button.disabled = false; button.innerHTML = '⌖ Use my location'; }
      return;
    }
    if (riders.filter((rider) => rider.point).some((rider) => distanceKm(rider.point.coords, coords) > MAX_GROUP_DISTANCE_KM)) {
      setError(`Your current location is more than ${MAX_GROUP_DISTANCE_KM} km from another rider. Check the carpool locations.`);
      if (button) { button.disabled = false; button.innerHTML = '⌖ Use my location'; }
      return;
    }
    result = null;
    addRider('Current location');
    const rider = riders.at(-1);
    rider.point = { address: 'Current location', coords };
    render();
    setError('Current location added as a rider.');
  }, (error) => {
    const message = error.code === error.PERMISSION_DENIED ? 'Location permission was denied. Allow location access in your browser, or enter an address.' : error.code === error.TIMEOUT ? 'Couldn’t get your location in time. Try again or enter an address.' : 'Couldn’t determine your location. Check that location services are enabled.';
    setError(message);
    if (button) { button.disabled = false; button.innerHTML = '⌖ Use my location'; }
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

async function searchAddress(id, suggest = false) {
  const rider = riders.find((item) => item.id === id);
  if (!rider || rider.address.trim().length < 3) { if (!suggest) setError('Enter a street name, town, or school name to search.'); return; }
  rider.searchController?.abort();
  const controller = new AbortController(); rider.searchController = controller;
  const token = ++rider.searchToken;
  rider.loading = true; if (!suggest) setError('');
  const searchButton = document.querySelector(`[data-search="${id}"]`);
  if (searchButton) { searchButton.disabled = true; searchButton.textContent = '…'; }
  try {
    const publishMatches = (matches) => {
      if (token !== rider.searchToken || !matches.length) return;
      rider.matches = mergeMatches(matches, rider.matches);
      renderSuggestions(rider);
    };
    const photonPromise = photonSearch(rider.address, controller.signal).then((data) => {
      publishMatches(makeAddressMatches(data.features || [], rider.address));
      return { data };
    }, (error) => ({ error }));
    const photonResult = await photonPromise;
    if (photonResult.error?.name === 'AbortError') throw photonResult.error;
    if (photonResult.error) throw photonResult.error;
    const data = photonResult.data || { features: [] };
    if (token !== rider.searchToken) return;
    let features = data.features || [];
    let matches = makeAddressMatches(features, rider.address);
    // Retry a street/city/state query in structured form when free-text
    // search has no usable matches. House numbers are not required.
    const structured = structuredAddress(rider.address);
    const hasRegion = Boolean(structured?.state || structured?.postcode);
    if (structured && ((hasRegion && Boolean(structured.city)) || (!matches.length && !suggest))) {
      const precise = await photonStructuredSearch(structured, controller.signal);
      if (token !== rider.searchToken) return;
      features = [...features, ...(precise.features || [])];
      matches = makeAddressMatches(features, rider.address);
    }
    const requestedNumber = rider.address.match(/^\s*(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+/)?.[1];
    const exactPhotonAddress = requestedNumber && matches.some((match) => match.houseNumber && sameHouseNumber(match.houseNumber, requestedNumber));
    if (requestedNumber && !exactPhotonAddress && (!suggest || isLikelyUsAddress(rider.address))) {
      if (!suggest) setError('Checking the U.S. Census address ranges…');
      const censusMatch = await censusAddressSearch(rider.address, controller.signal).catch(() => null);
      if (token !== rider.searchToken) return;
      if (censusMatch) matches = [censusMatch, ...matches];
    }
    rider.matches = mergeMatches(matches, rider.matches);
    renderSuggestions(rider);
    if (!suggest) setError('');
    if (!rider.matches.length && !suggest) setError(features.length
      ? `No matching U.S. street or school found for “${rider.address}”. Try adding the town and state.`
      : `No match found for “${rider.address}”. Check the spelling and add the town and region.`);
  } catch (error) {
    if (error.name !== 'AbortError' && token === rider.searchToken && !suggest) {
      const hasHouseNumber = /^\s*\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?\s+/.test(rider.address);
      const censusMatch = hasHouseNumber ? await censusAddressSearch(rider.address, controller.signal).catch(() => null) : null;
      if (token !== rider.searchToken) return;
      if (censusMatch) {
        rider.matches = mergeMatches([censusMatch], rider.matches);
        renderSuggestions(rider);
        setError('');
      } else {
        setError(error.name === 'TimeoutError' ? 'Address search took too long. Check your connection and try again.' : hasHouseNumber ? 'Couldn’t reach address search right now. Check your connection and try again.' : error.message || 'Could not reach the free address search. Try again in a moment.');
      }
    }
  } finally {
    if (token === rider.searchToken) {
      rider.loading = false;
      const button = document.querySelector(`[data-search="${id}"]`);
      if (button) { button.disabled = false; button.textContent = 'SEARCH'; }
    }
  }
}

function mergeMatches(primary, secondary) {
  const seen = new Set();
  return [...primary, ...secondary].filter((match) => {
    const key = `${match.title.toLowerCase()}|${match.detail.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function isLikelyUsAddress(query) {
  const usStateCodes = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
  return /\b\d{5}(?:-\d{4})?\b/.test(query) || new RegExp(`\\b(?:${usStateCodes.join('|')})\\s*$`, 'i').test(query.trim()) || Object.keys(US_STATE_NAMES).some((name) => new RegExp(`\\b${name}\\s*$`, 'i').test(query.trim()));
}

async function censusAddressSearch(query, signal) {
  if (!/^\s*\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?\s+/.test(query)) return null;
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  const callbackName = `__dropOffCensusCallback${++censusRequestId}`;
  url.search = new URLSearchParams({ address: query, benchmark: 'Public_AR_Current', format: 'jsonp', callback: callbackName });
  const data = await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Census address search timed out.')), 12000);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      delete window[callbackName];
      script.remove();
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(new DOMException('Search cancelled.', 'AbortError'));
    window[callbackName] = (result) => finish(null, result);
    script.onerror = () => finish(new Error('Census address search could not be reached.'));
    script.src = url.toString();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else document.head.append(script);
  });
  const requestedNumber = query.match(/^\s*(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+/)?.[1];
  const match = data.result?.addressMatches?.find((item) => {
    const foundNumber = item.matchedAddress?.match(/^\s*(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)/)?.[1] || item.addressComponents?.fromAddress;
    return requestedNumber && foundNumber && sameHouseNumber(foundNumber, requestedNumber);
  });
  if (!match?.coordinates) return null;
  const { addressComponents: a, matchedAddress } = match;
  const expectedZip = query.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5);
  const requestedAbbreviation = query.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i)?.[1]?.toUpperCase();
  const requestedStateName = Object.keys(US_STATE_NAMES).find((name) => new RegExp(`\\b${name}\\b`, 'i').test(query));
  const expectedState = requestedAbbreviation || (requestedStateName && US_STATE_NAMES[requestedStateName]);
  if (expectedZip && a?.zip && a.zip !== expectedZip) return null;
  if (expectedState && a?.state && a.state.toUpperCase() !== expectedState) return null;
  const coords = [match.coordinates.y, match.coordinates.x];
  if (!coords.every(Number.isFinite)) return null;
  const title = matchedAddress || query;
  const detail = [a?.city, a?.state, a?.zip].filter(Boolean).join(', ');
  return { title, detail, full: title, coords, houseNumber: requestedNumber, streetName: a?.streetName || '', type: 'CENSUS ADDRESS', placeType: 'Approximate address-range location' };
}

async function photonSearch(query, signal) {
  // Keep search within the United States at the source. Default Photon layers
  // include homes, streets, towns, and named public places.
  const params = new URLSearchParams({ q: query, limit: '50', lang: 'en', countrycode: 'us' });
  ['house', 'street', 'other'].forEach((layer) => params.append('layer', layer));
  const anchors = riders.filter((rider) => rider.point).map((rider) => rider.point.coords);
  if (anchors.length) {
    const [lat, lon] = meanCenter(anchors);
    params.set('lat', String(lat)); params.set('lon', String(lon));
    params.set('zoom', '5'); params.set('location_bias_scale', '0.2');
  }
  return photonRequest('/api', params, signal);
}

function structuredAddress(query) {
  let text = query.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const postcode = text.match(/\b\d{5}(?:-\d{4})?\s*$/)?.[0]?.trim();
  if (postcode) text = text.slice(0, text.lastIndexOf(postcode)).trim();
  let state = '';
  const stateAbbreviation = text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WV|WI|WY|DC)\s*$/i)?.[1];
  if (stateAbbreviation) {
    state = stateAbbreviation.toUpperCase();
    text = text.slice(0, text.lastIndexOf(stateAbbreviation)).trim();
  } else {
    const stateName = Object.keys(US_STATE_NAMES).sort((a, b) => b.length - a.length).find((name) => new RegExp(`\\b${name}\\s*$`, 'i').test(text));
    if (stateName) {
      state = US_STATE_NAMES[stateName];
      text = text.replace(new RegExp(`\\b${stateName}\\s*$`, 'i'), '').trim();
    }
  }
  const tokens = text.split(/\s+/).filter(Boolean);
  const suffixes = new Set('street st avenue ave road rd drive dr boulevard blvd lane ln court ct circle cir place pl terrace ter parkway pkwy highway hwy trail trl way route rte'.split(' '));
  const suffixIndex = tokens.findIndex((token) => suffixes.has(token.toLowerCase().replace(/\.$/, '')));
  if (suffixIndex < 0) return null;
  const number = tokens[0]?.match(/^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)$/)?.[1] || '';
  const streetStart = number ? 1 : 0;
  let streetEnd = suffixIndex + 1;
  const directions = /^(north|south|east|west|n|s|e|w|ne|nw|se|sw)$/i;
  while (streetEnd < tokens.length && directions.test(tokens[streetEnd]) && streetEnd <= suffixIndex + 2) streetEnd++;
  const street = tokens.slice(streetStart, streetEnd).join(' ');
  const city = tokens.slice(streetEnd).join(' ');
  if (!street || !city) return null;
  return Object.fromEntries(Object.entries({ housenumber: number, street, city, state, postcode, countrycode: 'us' }).filter(([, value]) => value));
}

async function photonStructuredSearch(address, signal) {
  const params = new URLSearchParams({ ...address, limit: '50', lang: 'en', countrycode: 'us' });
  const anchors = riders.filter((rider) => rider.point).map((rider) => rider.point.coords);
  if (anchors.length) {
    const [lat, lon] = meanCenter(anchors);
    params.set('lat', String(lat)); params.set('lon', String(lon));
    params.set('zoom', '5'); params.set('location_bias_scale', '0.2');
  }
  try { return await photonRequest('/structured', params, signal); }
  catch { return { features: [] }; }
}

function makeAddressMatches(features, query) {
  const requestedNumber = query.match(/^\s*(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+/)?.[1];
  const parsed = structuredAddress(query);
  const requestedStreet = parsed?.street?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  const requestedZip = parsed?.postcode;
  const requestedState = parsed?.state;
  return features.map((feature) => {
      const p = feature.properties || {}; const c = feature.geometry?.coordinates;
      if (!c || c.length < 2 || String(p.countrycode || '').toLowerCase() !== 'us') return null;
      const resultState = Object.entries(US_STATE_NAMES).find(([name, code]) => name.toLowerCase() === String(p.state || '').toLowerCase() || code.toLowerCase() === String(p.state || '').toLowerCase())?.[1];
      if (requestedState && resultState && requestedState !== resultState) return null;
      if (requestedZip && p.postcode && requestedZip !== p.postcode) return null;
      const namedInstitution = p.osm_key === 'amenity' && ['school', 'college', 'university'].includes(p.osm_value) && p.name;
      const namedRoad = p.name && (p.osm_key === 'highway' || ['street', 'road'].includes(String(p.type || '').toLowerCase()));
      if (!namedInstitution && !namedRoad && (!p.housenumber || !(p.street || p.name))) return null;
      const title = namedInstitution || namedRoad ? p.name : `${p.housenumber} ${p.street || p.name}`;
      const detail = [p.city || p.district, p.state, p.country].filter(Boolean).join(', ');
      return { title, detail, full: [title, detail].filter(Boolean).join(', '), coords: [c[1], c[0]], houseNumber: p.housenumber || '', streetName: p.street || p.name || '', type: p.type, source: 'photon', placeType: namedInstitution ? (p.osm_value === 'university' ? 'University' : p.osm_value === 'college' ? 'College' : 'School') : namedRoad ? /\s+at\s+/i.test(p.name) ? 'Street intersection' : 'Street' : '' };
    }).filter(Boolean).filter((match, index, list) => list.findIndex((other) => other.title === match.title && other.detail === match.detail && other.coords[0] === match.coords[0] && other.coords[1] === match.coords[1]) === index)
      .sort((a, b) => {
        const exactRoad = Number(Boolean(requestedStreet && b.streetName.toLowerCase().replace(/[^a-z0-9]/g, '') === requestedStreet)) - Number(Boolean(requestedStreet && a.streetName.toLowerCase().replace(/[^a-z0-9]/g, '') === requestedStreet));
        if (exactRoad) return exactRoad;
        return Number(/\s+at\s+/i.test(a.title)) - Number(/\s+at\s+/i.test(b.title));
      });
}

function sameHouseNumber(result, requested) {
  const normalize = (value) => String(value).trim().toLowerCase().replace(/\s+/g, '');
  return normalize(result) === normalize(requested);
}

function selectAddress(id, choiceIndex) {
  const rider = riders.find((item) => item.id === id); const choice = rider?.matches[choiceIndex];
  if (!rider || !choice) return;
  if (!choice.coords) { setError('That result did not include a map location. Choose another suggestion.'); return; }
  const otherPoints = riders.filter((item) => item !== rider && item.point).map((item) => item.point.coords);
  if (otherPoints.some((point) => distanceKm(point, choice.coords) > MAX_GROUP_DISTANCE_KM)) {
    setError(`That result is more than ${MAX_GROUP_DISTANCE_KM} km from another rider. Check the city/region so your carpool stays local.`);
    return;
  }
  clearTimeout(rider.searchTimer); rider.searchController?.abort(); rider.searchToken++;
  rider.point = { address: choice.full, coords: choice.coords }; rider.address = choice.full; rider.matches = [];
  setError(''); renderRiders(); updateFindButton(); renderMarkers();
}

const MAX_GROUP_DISTANCE_KM = 100;

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
  map = L.map('map', { zoomControl: false, attributionControl: false, scrollWheelZoom: true }).setView([39.5, -98.35], 4);
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
    result = { center, spot, riders: ready, unavailable: Boolean(spot.fallback), message: spot.message };
    showResult(result, true); renderMarkers();
  } catch (error) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${center[0]},${center[1]}`;
    result = { center, spot: centerPoint(center, 'Nearby public places could not be loaded right now. Use this map pin as your meetup point.'), riders: ready, unavailable: true, message: error.message || 'Nearby public places could not be loaded right now. Use this map pin as your meetup point.' };
    showResult(result, true, mapUrl); renderMarkers();
  } finally { updateFindButton(); }
}

async function findPublicPlace(center) {
  // Photon /reverse rejects countrycode (that filter is supported on /api).
  // Query within a bounded radius, then enforce U.S. membership on results.
  const params = new URLSearchParams({ lat: String(center[0]), lon: String(center[1]), radius: '10', limit: '30', lang: 'en' });
  ['amenity:library', 'amenity:school', 'leisure:park'].forEach((tag) => params.append('osm_tag', tag));
  // Nearby-place lookup is best-effort. If the provider is offline or lists no
  // venue nearby, still return a usable map pin at the computed group center.
  const data = await photonRequest('/reverse', params, new AbortController().signal).catch(() => null);
  if (!data) return centerPoint(center, 'Nearby public places could not be loaded right now. Use this map pin as your meetup point.');
  const places = (data.features || []).map((feature) => {
    const p = feature.properties || {}; const coords = [feature.geometry?.coordinates?.[1], feature.geometry?.coordinates?.[0]];
    if (!coords[0] || String(p.countrycode || '').toLowerCase() !== 'us') return null;
    const type = p.osm_key === 'amenity' && p.osm_value === 'library' ? 'PUBLIC LIBRARY' : p.osm_key === 'amenity' && p.osm_value === 'school' ? 'SCHOOL' : p.osm_key === 'leisure' && p.osm_value === 'park' ? 'PUBLIC PARK' : null;
    if (!type) return null;
    const title = [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street].filter(Boolean).join(' · ') || type.replace('PUBLIC ', '');
    const address = [p.street, p.city, p.state].filter(Boolean).join(', ') || `${(distanceKm(center, coords) * 1000).toFixed(0)} m from your group’s center`;
    return { name: title, type, address, coords, distance: distanceKm(center, coords) };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
  if (places.length) return places[0];
  return centerPoint(center, 'No nearby public venue was listed. Use this map pin as your meetup point, or open the map to choose a public place nearby.');
}

function centerPoint(center, message) {
  return {
    name: 'Group meetup point',
    address: `${center[0].toFixed(5)}, ${center[1].toFixed(5)}`,
    coords: center,
    type: 'CENTRAL MAP PIN',
    fallback: true,
    message,
  };
}

function showResult(data, scroll, mapUrlOverride) {
  const { spot, riders: group, center, unavailable, message } = data;
  const mapUrl = mapUrlOverride || (unavailable
    ? `https://www.google.com/maps/search/?api=1&query=${center[0]},${center[1]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.address}`)}`);
  const km = distanceKm(center, spot.coords);
  document.querySelector('#map-title').textContent = unavailable ? 'Your central meetup pin is ready.' : 'Your meetup is ready.';
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

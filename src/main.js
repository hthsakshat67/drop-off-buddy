import './styles.css';

const riderSeeds = [
  { name: 'Rider 1', address: '12 Willow Lane', detail: 'Home address' },
  { name: 'Rider 2', address: '48 Maple Street', detail: 'Home address' },
  { name: 'Rider 3', address: '7 Pine Avenue', detail: 'Home address' },
];

const spot = {
  name: 'Oak Hill Public Library',
  address: '450 Broad Street',
  walk: '3 min walk from centroid',
  type: 'Public library',
};

let riders = riderSeeds.map((r, i) => ({ ...r, id: i + 1 }));
let hasResult = false;

// Demo coordinates keep this prototype free and keyless. Swap these for geocoder
// results later; the centroid math stays exactly the same.
const demoCoordinates = [
  [40.281, -74.341], [40.294, -74.318], [40.267, -74.326],
  [40.286, -74.302], [40.306, -74.337],
];

function calculateCentroid(points) {
  return points.reduce((center, [lat, lng]) => [center[0] + lat / points.length, center[1] + lng / points.length], [0, 0]);
}

const app = document.querySelector('#app');

function render() {
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#top" aria-label="Drop-Off Buddy home"><span class="brand-mark"><span></span><span></span><span></span></span><span>drop-off <b>buddy</b></span></a>
        <div class="top-actions"><span class="status-dot"></span><span>Free forever</span><button class="icon-button" aria-label="Help">?</button></div>
      </header>
      <main id="top">
        <section class="hero reveal">
          <div class="eyebrow"><span class="spark">✦</span> The fairest way to share the ride</div>
          <h1>Less driveway time.<br /><em>More team time.</em></h1>
          <p class="hero-copy">Find a safe, central spot for your crew in under 30 seconds. No accounts, no complicated routes, no emissions guilt.</p>
          <div class="hero-proof"><div class="proof-avatars"><span>J</span><span>M</span><span>A</span><span>+</span></div><span>Made for teams of 3–5 riders</span></div>
        </section>

        <section class="workspace reveal delay-1">
          <div class="form-panel card">
            <div class="section-heading"><div><span class="step-label">STEP 01</span><h2>Who’s riding?</h2></div><span class="counter">${riders.length}/5</span></div>
            <p class="muted intro">Drop in each home base. We’ll find the most fair meet-up for everyone.</p>
            <div id="rider-list" class="rider-list">${riders.map((r, i) => riderRow(r, i)).join('')}</div>
            <button id="add-rider" class="add-rider" ${riders.length >= 5 ? 'disabled' : ''}><span>＋</span> Add rider</button>
            <button id="find-point" class="primary-button">Find our drop-off point <span>→</span></button>
            <p class="privacy"><span>◉</span> Addresses stay on this device</p>
          </div>

          <div class="map-panel card ${hasResult ? 'map-ready' : ''}">
            <div class="map-top"><div class="map-title"><span class="live-dot"></span><span>${hasResult ? 'Your meet-up is ready' : 'Your shared map'}</span></div><span class="map-scale">1 mile</span></div>
            <div class="map-canvas" aria-label="Illustrated map showing rider homes and the suggested meet-up point">
              <div class="map-grid"></div><div class="park park-one"><span>Willow<br />Park</span></div><div class="park park-two"></div>
              <div class="road road-a"></div><div class="road road-b"></div><div class="road road-c"></div><div class="road road-d"></div>
              <div class="neighborhood n-one">OAK HILL</div><div class="neighborhood n-two">BROADWAY</div><div class="neighborhood n-three">MAPLEWOOD</div>
              ${riders.map((r, i) => `<div class="map-pin rider-pin pin-${i + 1}" title="${r.name}"><span>${i + 1}</span></div>`).join('')}
              <div class="centroid-line"></div><div class="map-pin meetup-pin"><span>✦</span></div>
              <div class="map-legend"><span><i class="legend-home"></i> Homes</span><span><i class="legend-meet"></i> Meet-up</span></div>
              <div class="map-controls"><button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button></div>
            </div>
            <div class="map-caption"><span class="caption-icon">⌖</span><div><strong>${hasResult ? spot.name : 'Centroid preview'}</strong><small>${hasResult ? spot.address : 'Your result will appear here'}</small></div><span class="arrow">↗</span></div>
          </div>
        </section>

        <section id="result" class="result-section ${hasResult ? 'show' : ''}">
          <div class="result-card card reveal">
            <div class="result-badge">✦ <span>THE SWEET SPOT</span></div>
            <div class="result-content"><div class="result-icon">⌖</div><div><p class="step-label">RECOMMENDED MEET-UP</p><h2>${spot.name}</h2><p class="address">${spot.address} <span>·</span> ${spot.walk}</p></div><div class="match-score"><strong>98%</strong><span>fairness match</span></div></div>
            <div class="result-actions"><button id="share-button" class="primary-button">Share carpool <span>↗</span></button><button id="copy-button" class="secondary-button">Copy location</button></div>
            <div id="share-note" class="share-note" role="status"></div>
          </div>
        </section>

        <section class="how-it-works reveal delay-2"><div class="section-heading centered"><div><span class="step-label">WHY IT WORKS</span><h2>Goodbye, group chat chaos.</h2></div></div><div class="benefits"><div><span>01</span><h3>Average the miles</h3><p>We find the mathematical center of your group, so no one gets stuck with the long drive.</p></div><div><span>02</span><h3>Snap to safety</h3><p>We turn that center point into a real, public place everyone can feel good about.</p></div><div><span>03</span><h3>Share the plan</h3><p>One tap sends the place, address, and a map link to the whole team.</p></div></div></section>
      </main>
      <footer><span>drop-off buddy</span><span>Built for lighter commutes <span class="footer-heart">♥</span></span><span>Privacy first · No account needed</span></footer>
    </div>`;
  bindEvents();
}

function riderRow(r, index) {
  return `<div class="rider-row" data-id="${r.id}"><span class="rider-number">${String(index + 1).padStart(2, '0')}</span><div class="field-wrap"><label for="rider-${r.id}">${r.name}</label><input id="rider-${r.id}" value="${r.address}" autocomplete="off" placeholder="Type a home address..." /><span class="field-check">✓</span></div><button class="remove-rider" aria-label="Remove ${r.name}" data-remove="${r.id}">×</button></div>`;
}

function bindEvents() {
  document.querySelector('#add-rider')?.addEventListener('click', () => {
    const id = riders.length + 1;
    riders.push({ id, name: `Rider ${id}`, address: '', detail: 'Home address' });
    render();
    document.querySelector(`#rider-${id}`)?.focus();
  });
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    if (riders.length <= 2) return;
    riders = riders.filter((r) => r.id !== Number(button.dataset.remove));
    render();
  }));
  document.querySelectorAll('.field-wrap input').forEach((input) => input.addEventListener('input', (event) => {
    const rider = riders.find((r) => r.id === Number(event.target.id.replace('rider-', '')));
    if (rider) rider.address = event.target.value;
  }));
  document.querySelector('#find-point')?.addEventListener('click', () => {
    const filled = riders.filter((r) => r.address.trim());
    if (filled.length < 2) return showToast('Add at least two home addresses to find your sweet spot.');
    const centroid = calculateCentroid(demoCoordinates.slice(0, filled.length));
    document.documentElement.dataset.centroid = `${centroid[0].toFixed(3)},${centroid[1].toFixed(3)}`;
    hasResult = true;
    render();
    setTimeout(() => document.querySelector('#result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  });
  document.querySelector('#share-button')?.addEventListener('click', sharePlan);
  document.querySelector('#copy-button')?.addEventListener('click', async () => {
    const text = `Hey team! Our Drop-Off Buddy meeting point is ${spot.name} (${spot.address}). See you there!`;
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable in preview */ }
    showToast('Carpool plan copied to your clipboard.');
  });
}

async function sharePlan() {
  const text = `Hey team! Our Drop-Off Buddy meeting point is ${spot.name} (${spot.address}). See you there!`;
  if (navigator.share) await navigator.share({ title: 'Drop-Off Buddy plan', text });
  else {
    try { await navigator.clipboard.writeText(text); } catch { /* no-op */ }
    showToast('Your plan is copied — paste it into the team chat.');
  }
}

function showToast(message) {
  const note = document.querySelector('#share-note');
  if (note) { note.textContent = message; note.classList.add('visible'); setTimeout(() => note.classList.remove('visible'), 3200); }
}

render();

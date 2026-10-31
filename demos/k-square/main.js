import { run } from '../noir/common.js';
import { createFx, MODES } from './fx.js';

const square = document.querySelector('[data-square]');
const nav = document.querySelector('[data-fx-switch]');
const fx = createFx(document.querySelector('[data-fx]'));

let mode = new URLSearchParams(location.search).get('fx');
if (!MODES.includes(mode)) mode = MODES[0];

function pick(m) {
  mode = m;
  fx.set({ mode });
  nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  const url = new URL(location.href);
  url.searchParams.set('fx', m);
  history.replaceState(null, '', url);
}

if (fx) {
  square.classList.add('has-fx');
  nav.classList.add('on');
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) pick(b.dataset.mode); });
  pick(mode);
}

let segStart = null;
run({
  tone: (s) => `var(--c-${s === 'unknown' ? 'maybe' : s})`,
  onHero(m, c) {
    const seg = m.current;
    if (!seg) return;
    if (segStart !== seg.start) { square.classList.add('jump'); segStart = seg.start; }
    // Brightness follows the countdown: dims towards an outage, comes back towards power.
    const p = Math.min(1, (m.now + 30000 - seg.start) / (seg.end - seg.start));
    let light = 1;
    if (c.state === 'on' && !c.empty) light = 1 - 0.7 * p;
    if (c.state === 'off') light = c.empty ? 0.15 : 0.15 + 0.85 * p;
    if (c.state === 'maybe') light = 0.6;
    square.style.setProperty('--light', light.toFixed(3));
    fx?.set({ light, state: c.state || 'unknown' });
    if (square.classList.contains('jump')) requestAnimationFrame(() => requestAnimationFrame(() => square.classList.remove('jump')));
  },
});

import { start, describe, countdown, statusNotes, fmtTime, fmtDuration, QUEUE_LABEL } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
$('[data-queue]').textContent = QUEUE_LABEL;

const THICK = { on: 18, maybe: 6, off: 1, unknown: 3 };
const W = 480, H = 44, MID = H / 2, TAPER = 1.6;

function filamentPath(slots) {
  const top = [], bottom = [];
  slots.forEach((s, i) => {
    const half = THICK[s.state] / 2;
    const x0 = i * 10 + (i ? TAPER : 0);
    const x1 = (i + 1) * 10 - (i < slots.length - 1 ? TAPER : 0);
    top.push([x0, MID - half], [x1, MID - half]);
    bottom.push([x0, MID + half], [x1, MID + half]);
  });
  const pts = [...top, ...bottom.reverse()];
  return `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
}

function filament(day, now, id) {
  const frac = Math.min(1, Math.max(0, (now - day.start) / (day.end - day.start)));
  const nowX = frac * W;
  const d = filamentPath(day.slots);
  const inDay = now >= day.start && now < day.end;
  return `<div class="fil">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <clipPath id="past-${id}"><rect x="0" y="0" width="${nowX}" height="${H}"/></clipPath>
      <clipPath id="ahead-${id}"><rect x="${nowX}" y="0" width="${W - nowX}" height="${H}"/></clipPath>
      <path class="spent" d="${d}" clip-path="url(#past-${id})"/>
      <path class="lit" d="${d}" clip-path="url(#ahead-${id})"/>
    </svg>
    ${inDay ? `<div class="now" style="left:${frac * 100}%"><span>${fmtTime(now)}</span></div>` : ''}
  </div>
  <div class="ticks">${[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<span>${String(h).padStart(2, '0')}</span>`).join('')}</div>`;
}

function index(day, now) {
  if (!day.outages.length) return '<ol class="index"><li class="none"><span class="no">—</span><span class="t">Без відключень</span><span></span></li></ol>';
  return `<ol class="index">${day.outages.map((o, i) => {
    const sw = [o.maybeBefore, o.maybeAfter].filter(Boolean).map((s) => `${fmtTime(s.start)}–${fmtTime(s.end, day.end)}`);
    const cont = o.intoNextDay ? ' → завтра' : o.fromPrevDay ? ' з учора' : '';
    return `<li class="${o.end <= now ? 'past' : ''}">
      <span class="no">${String(i + 1).padStart(2, '0')}</span>
      <span class="t">${o.text}${sw.length || cont ? `<small>${cont ? cont.trim() : ''}${cont && sw.length ? ' · ' : ''}${sw.length ? `перемикання ${sw.join(', ')}` : ''}</small>` : ''}</span>
      <span class="d">${fmtDuration(o.end - o.start)}</span>
    </li>`;
  }).join('')}</ol>`;
}

function renderHero(m) {
  const hero = $('[data-hero]');
  const c = countdown(m);
  hero.dataset.state = c.state || 'unknown';
  hero.classList.toggle('empty', !!c.empty);
  $('[data-kicker]').textContent = c.kicker;
  $('[data-at]').textContent = c.empty ? '' : `о ${c.at}`;
  $('[data-h]').textContent = c.h ?? '—';
  $('[data-h]').parentElement.classList.toggle('no-h', c.h === 0);
  $('[data-m]').textContent = c.m == null ? '—' : String(c.m).padStart(2, '0');

  // Aim at the value due by the next render; the 30s CSS transition fills the gap smoothly.
  const seg = m.current;
  const p = seg ? Math.min(1, (m.now + 30000 - seg.start) / (seg.end - seg.start)) : 0;
  let w = 600, wd = 100;
  if (c.state === 'on' && !c.empty) { w = 1000 - 880 * p; wd = 112 - 50 * p; }
  if (c.state === 'off') { w = c.empty ? 120 : 120 + 880 * p; wd = c.empty ? 62 : 62 + 50 * p; }
  hero.style.setProperty('--w', w.toFixed(0));
  hero.style.setProperty('--wd', wd.toFixed(1));
  if (hero.classList.contains('instant')) requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.remove('instant')));
}

start((m, status) => {
  $('[data-notes]').innerHTML = statusNotes(m, status).map((n) => `<li>${n}</li>`).join('');
  if (!m) {
    if (!status.loading) $('[data-kicker]').textContent = 'графік не завантажився';
    return;
  }
  renderHero(m);
  $('[data-line]').textContent = `${describe(m).title}. ${describe(m).line}`;
  $('[data-update]').textContent = m.scheduleUpdate ?? '—';
  $('[data-today]').textContent = m.today ? `${m.today.weekday}, ${m.today.dateLabel}` : '—';

  const blocks = m.days.map((day, i) => `
    <article class="day">
      <div class="day-head"><h2>${day.label}</h2><span>${day.dateLabel}</span></div>
      ${filament(day, m.now, i)}
      ${index(day, m.now)}
    </article>`);
  if (!m.tomorrowPublished) {
    blocks.push(`<article class="day">
      <div class="day-head"><h2>Завтра</h2><span>—</span></div>
      <div class="fil empty"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" y1="${MID}" x2="${W}" y2="${MID}" vector-effect="non-scaling-stroke"/></svg><p>Графік ще не опубліковано.</p></div>
    </article>`);
  }
  $('[data-days]').innerHTML = blocks.join('');
});

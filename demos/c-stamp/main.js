import { start, describe, statusNotes, fmtTime, QUEUE_LABEL } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
const HOUR = 3600 * 1000;
$('[data-queue]').textContent = QUEUE_LABEL;

// ---------- wrapping-paper backdrop ----------

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
(function backdrop() {
  const r = rng(52);
  const lines = Array.from({ length: 9 }, () => {
    const a = r() * Math.PI;
    const cx = r() * 100, cy = r() * 100;
    const dx = Math.cos(a) * 150, dy = Math.sin(a) * 150;
    return `<line x1="${cx - dx}%" y1="${cy - dy}%" x2="${cx + dx}%" y2="${cy + dy}%"/>`;
  }).join('');
  const words = Array.from({ length: 26 }, () => {
    const rot = Math.round(r() * 360);
    const sub = r() > 0.5 ? `<small>черга ${QUEUE_LABEL} · все, що треба, у свій час</small>` : '';
    return `<span class="w" style="left:${(r() * 110 - 5).toFixed(1)}%;top:${(r() * 110 - 5).toFixed(1)}%;transform:rotate(${rot}deg)">С. Вітло${sub}</span>`;
  }).join('');
  $('[data-wrap]').innerHTML = `<svg>${lines}</svg>${words}`;
})();

// ---------- hero ----------

function bigDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return `${m}<small>хв</small>`;
  return `${h}<small>год</small> ${m}<small>хв</small>`;
}

function renderHero(m, d) {
  let kicker = 'Невідомо', big = '—';
  if (d.state === 'on' && !m.nextOff) { kicker = 'Відключень попереду'; big = 'Нема'; }
  else if (d.state === 'on') { kicker = m.next?.state === 'maybe' ? 'До можливого вимкнення' : 'До вимкнення'; big = bigDuration(m.remaining); }
  else if (d.state === 'off') { kicker = m.next ? 'До увімкнення' : 'Світла нема'; big = m.next ? bigDuration(m.remaining) : 'Темно'; }
  else if (d.state === 'maybe') { kicker = 'Перемикання ще'; big = bigDuration(m.remaining); }
  $('[data-kicker]').textContent = kicker;
  $('[data-big]').innerHTML = big;
  $('[data-line]').textContent = `${d.title}. ${d.line}`;
}

// ---------- tape ----------

const track = $('[data-track]');
const MARK_TEXT = { on: 'Увімк', off: 'Вимк', maybe: 'Можливо', unknown: '?' };
let tapeKey = '';
let geo = null;

function buildTape(m, width) {
  const span = width < 600 ? 3 : 5;
  const pxh = width / (2 * span);
  const origin = m.segments[0].start;
  const beyondEnd = m.horizon + 12 * HOUR;
  const x = (t) => ((t - origin) / HOUR) * pxh;
  const html = [];

  m.segments.forEach((s, i) => {
    if (s.state !== 'on') html.push(`<div class="blk ${s.state}" style="left:${x(s.start)}px;width:${x(s.end) - x(s.start)}px"></div>`);
    if (i > 0) {
      const top = i % 2 ? 8 : 44;
      const rot = i % 3 === 0 ? -7 : i % 3 === 1 ? 4 : -2;
      html.push(`<div class="mark stamp" style="left:${x(s.start)}px;top:${top}px;--r:${rot}deg">${MARK_TEXT[s.state]} ${fmtTime(s.start)}</div>`);
    }
  });
  if (!m.tomorrowPublished) {
    html.push(`<div class="blk beyond" style="left:${x(m.horizon)}px;width:${x(beyondEnd) - x(m.horizon)}px"><span>далі графік ще не опубліковано</span></div>`);
  }
  for (let t = origin; t <= beyondEnd; t += HOUR / 2) {
    const hour = (t - origin) % HOUR === 0;
    html.push(`<div class="tk${hour ? ' h' : ''}" style="left:${x(t)}px"></div>`);
    if (hour) html.push(`<div class="tl" style="left:${x(t)}px">${fmtTime(t)}</div>`);
  }
  track.innerHTML = html.join('');
  track.style.width = `${x(beyondEnd)}px`;
  geo = { x, width };
}

function renderTape(m) {
  const width = track.parentElement.clientWidth;
  if (!m.segments.length) { track.innerHTML = ''; return; }
  const key = `${width}|${m.segments.map((s) => s.state + s.start).join()}|${m.tomorrowPublished}`;
  const fresh = key !== tapeKey;
  if (fresh) {
    track.classList.remove('moving');
    buildTape(m, width);
    tapeKey = key;
  }
  // Aim at where "now" will be by the next render so the 30s transition keeps it moving.
  const aim = fresh ? m.now : m.now + 30 * 1000;
  track.style.transform = `translateX(${geo.width / 2 - geo.x(aim)}px)`;
  if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => track.classList.add('moving')));
  $('[data-needle-label]').textContent = `зараз ${fmtTime(m.now)}`;
}

// ---------- tickets ----------

function ticket(day, now) {
  const slots = day.slots.map((s) => `<span class="s ${s.state}${s.end <= now ? ' past' : ''}"></span>`).join('');
  const inDay = now >= day.start && now < day.end;
  const nowmark = inDay ? `<i class="nowmark" style="left:${((now - day.start) / (day.end - day.start)) * 100}%"></i>` : '';
  const hours = Array.from({ length: 24 }, (_, h) => `<span>${h}</span>`).join('');
  const stamps = day.outages.length
    ? day.outages.map((o) => `<span class="stamp">${o.text}${o.intoNextDay ? ' →' : ''}</span>`).join('')
    : '<span class="stamp">Без відключень</span>';
  const sw = day.outages.flatMap((o) => [o.maybeBefore, o.maybeAfter]).filter(Boolean)
    .map((s) => `${fmtTime(s.start)}–${fmtTime(s.end, day.end)}`);
  return `<article class="ticket">
    <header><h2>${day.label}</h2><span class="date">${day.dateLabel}, ${day.weekday}</span></header>
    <div class="ruler">${slots}${nowmark}</div>
    <div class="hours">${hours}</div>
    <div class="periods">${stamps}${sw.length ? `<span class="sw">перемикання: ${sw.join(', ')}</span>` : ''}</div>
  </article>`;
}

let last = null;
start((m, status) => {
  last = m;
  $('[data-notes]').innerHTML = statusNotes(m, status).map((n) => `<li>${n}</li>`).join('');
  if (!m) {
    if (!status.loading) { $('[data-kicker]').textContent = 'Помилка'; $('[data-big]').textContent = 'Нема даних'; }
    return;
  }
  const d = describe(m);
  renderHero(m, d);
  renderTape(m);
  $('[data-update]').textContent = m.scheduleUpdate ?? '—';
  const tickets = m.days.map((day) => ticket(day, m.now));
  if (!m.tomorrowPublished) tickets.push('<article class="ticket empty"><h2 class="stamp">Завтра</h2><p>Графік ще не опубліковано</p></article>');
  $('[data-tickets]').innerHTML = tickets.join('');
});

addEventListener('resize', () => { if (last) renderTape(last); });

import { start, describe, countdown, statusNotes, fmtTime, QUEUE_LABEL } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
$('[data-queue]').textContent = QUEUE_LABEL;

// ---------- plaster ----------

const layers = [...document.querySelectorAll('[data-relief]')];
let front = 0;
let reliefKey = '';

// Folding the noise's alpha (used as height) turns soft lumps into carved ridges.
// Ambient flood keeps grazing light from crushing the wall to black.
function reliefUri({ az, el, color, ambient, k, base }) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1400' height='900'>
<filter id='p' x='0' y='0' width='100%25' height='100%25' color-interpolation-filters='sRGB'>
<feTurbulence type='fractalNoise' baseFrequency='0.0032 0.0048' numOctaves='2' seed='14' result='n'/>
<feComponentTransfer in='n' result='h'><feFuncA type='table' tableValues='0 1 0.15 0.95 0.1'/></feComponentTransfer>
<feGaussianBlur in='h' stdDeviation='10' result='hb'/>
<feDiffuseLighting in='hb' surfaceScale='20' diffuseConstant='${k}' lighting-color='${color}' result='lit'><feDistantLight azimuth='${az}' elevation='${el}'/></feDiffuseLighting>
<feFlood flood-color='${ambient}' result='amb'/>
<feComposite in='lit' in2='amb' operator='arithmetic' k1='0' k2='0.72' k3='0.28' k4='0' result='soft'/>
<feTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='1' seed='3' result='g'/>
<feDiffuseLighting in='g' surfaceScale='0.6' diffuseConstant='1' lighting-color='white' result='fine'><feDistantLight azimuth='${az}' elevation='${Math.max(el, 35)}'/></feDiffuseLighting>
<feBlend in='soft' in2='fine' mode='multiply'/>
</filter>
<rect width='100%25' height='100%25' fill='${base}' filter='url(%23p)'/>
</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/\n/g, '').replace(/#/g, '%23').replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

const dark = () => getComputedStyle(document.documentElement).colorScheme === 'dark';

function lightFor(c, p) {
  const night = dark();
  if (c.state === 'on') {
    // The light sinks as the outage nears, so shadows grow longer.
    const el = c.empty ? 58 : 58 - 30 * p;
    return { az: 215, el, color: night ? '#a88a6c' : '#fff4e6', ambient: night ? '#5a4636' : '#f1e6d6', k: night ? 1 : 1.15, pool: 1 };
  }
  if (c.state === 'off') {
    const el = c.empty ? 80 : 80 - 20 * p;
    return { az: 260, el, color: night ? '#2c2f34' : '#9a9fa5', ambient: night ? '#1d1f22' : '#a7abb0', k: 1, pool: 0 };
  }
  if (c.state === 'maybe') return { az: 235, el: 36, color: night ? '#6c6052' : '#d9cebd', ambient: night ? '#3a342d' : '#d6cdbf', k: 1, pool: 0.5 };
  return { az: 240, el: 60, color: night ? '#3a3a3a' : '#b8b8b8', ambient: night ? '#2a2a2a' : '#bdbdbd', k: 1, pool: 0 };
}

async function setRelief(c, p) {
  const l = lightFor(c, p);
  l.el = Math.round(l.el / 4) * 4;
  document.documentElement.style.setProperty('--pool', l.pool);
  const key = `${l.az}|${l.el}|${l.color}|${l.k}`;
  if (key === reliefKey) return;
  reliefKey = key;
  const uri = reliefUri({ ...l, base: '#ffffff' });
  // Decode off-screen first so the cross-fade never shows a half-drawn wall.
  const img = new Image();
  img.src = uri.slice(5, -2);
  try { await img.decode(); } catch (e) {}
  if (key !== reliefKey) return;
  const back = layers[1 - front];
  back.style.backgroundImage = uri;
  back.classList.add('shown');
  layers[front].classList.remove('shown');
  front = 1 - front;
}

let lastCountdown = null;
document.addEventListener('themechange', () => {
  if (lastCountdown) { reliefKey = ''; setRelief(lastCountdown.c, lastCountdown.p); }
});

// ---------- count ----------

const count = $('[data-count]');
let shown = null;
function setCount(text) {
  if (text === shown) return;
  count.querySelectorAll('span').forEach((old) => {
    old.classList.add('out');
    setTimeout(() => old.remove(), 1000);
  });
  const el = document.createElement('span');
  el.textContent = text;
  if (shown !== null) {
    el.className = 'in';
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('in')));
  }
  count.append(el);
  shown = text;
}

// ---------- tearsheet ----------

function dayBlock(day, now) {
  const cells = day.slots.map((s) => `<i class="${s.state}${s.end <= now ? ' past' : ''}"></i>`).join('');
  const inDay = now >= day.start && now < day.end;
  const marker = inDay ? `<b class="now" style="left:${((now - day.start) / (day.end - day.start)) * 100}%"></b>` : '';
  const off = day.outages.map((o) => o.text + (o.intoNextDay ? ' →' : '') + (o.fromPrevDay ? ' (з учора)' : '')).join(', ');
  const sw = day.outages.flatMap((o) => [o.maybeBefore, o.maybeAfter]).filter(Boolean)
    .map((s) => `${fmtTime(s.start)}–${fmtTime(s.end, day.end)}`);
  return `<article class="day">
    <h2>${day.label}</h2>
    <dl class="meta"><dt>Дата</dt><dd>${day.dateLabel}</dd><dt>День</dt><dd>${day.weekday}</dd><dt>Відключень</dt><dd>${day.outages.length}</dd></dl>
    <div class="body">
      <div class="bar">${cells}${marker}</div>
      <div class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      <p class="text">${off ? `Без світла ${off}.` : 'Відключень немає.'}${sw.length ? ` <small>Перемикання ${sw.join(', ')}.</small>` : ''}</p>
    </div>
  </article>`;
}

start((m, status) => {
  $('[data-notes]').innerHTML = statusNotes(m, status).map((n) => `<li>${n}</li>`).join('');
  if (!m) {
    if (!status.loading) $('[data-kicker]').textContent = 'Графік не завантажився';
    return;
  }
  const c = countdown(m);
  const d = describe(m);
  $('[data-hero]').classList.toggle('empty', !!c.empty);
  const kicker = c.kicker.charAt(0).toUpperCase() + c.kicker.slice(1);
  $('[data-kicker]').textContent = c.empty ? kicker : `${kicker} о ${c.at}`;
  setCount(c.empty ? '' : `${String(c.h).padStart(2, '0')}:${String(c.m).padStart(2, '0')}`);
  $('[data-line]').textContent = `${d.title}. ${d.line}`;
  lastCountdown = { c, p: m.progress };
  setRelief(c, m.progress);

  $('[data-update]').textContent = m.scheduleUpdate ?? '—';
  const blocks = m.days.map((day) => dayBlock(day, m.now));
  if (!m.tomorrowPublished) blocks.push('<article class="day"><h2>Завтра</h2><div class="body"><p class="empty-day">Графік ще не опубліковано.</p></div></article>');
  $('[data-days]').innerHTML = blocks.join('');
});

import { start, describe, countdown, statusNotes, fmtTime, fmtDuration, QUEUE_LABEL } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
$('[data-queue]').textContent = QUEUE_LABEL;

// ---------- light field ----------

const canvas = $('[data-field]');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// [unlit, lit] endpoints per theme; the light level mixes between them.
const PALETTES = {
  light: { wall: ['#cfd0cf', '#e4d8c6'], glow: ['#e2e3e4', '#ffc47e'], shade: ['#a9acb0', '#b39a7e'] },
  dark: { wall: ['#14161a', '#3a1d15'], glow: ['#262b33', '#e9a35e'], shade: ['#08090b', '#170c09'] },
};
let palette = PALETTES.light;
const syncTheme = () => {
  palette = getComputedStyle(document.documentElement).colorScheme === 'dark' ? PALETTES.dark : PALETTES.light;
};
document.addEventListener('themechange', syncTheme);
syncTheme();

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (pair, t) => {
  const a = hex(pair[0]), b = hex(pair[1]);
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
};
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const light = { level: 0.6, target: 0.6, flicker: false };

function draw(ms) {
  const t = still ? 0 : ms / 1000;
  light.level += (light.target - light.level) * 0.015;
  let L = light.level;
  // Switching: an uneven, slow waver rather than a blink.
  if (light.flicker && !still) L *= 0.78 + 0.22 * Math.sin(t * 0.9) * Math.sin(t * 2.3 + 1);
  L = Math.max(0, Math.min(1, L));

  const wall = mix(palette.wall, L), glow = mix(palette.glow, L), shade = mix(palette.shade, L);
  ctx.fillStyle = rgba(wall);
  ctx.fillRect(0, 0, W, H);

  const cx = W * (0.68 + 0.04 * Math.sin((t / 23) * Math.PI * 2));
  const cy = H * (0.34 + 0.035 * Math.sin((t / 37) * Math.PI * 2 + 1));
  const r = W * (0.22 + 0.42 * L) * (1 + 0.07 * Math.sin((t / 11) * Math.PI * 2));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(glow, 0.95));
  g.addColorStop(0.45, rgba(glow, 0.45));
  g.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const s = ctx.createRadialGradient(W * 0.05, H * 1.05, 0, W * 0.05, H * 1.05, W * 0.7);
  s.addColorStop(0, rgba(shade, 0.85));
  s.addColorStop(1, rgba(shade, 0));
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, W, H);
}

let lastFrame = 0;
function loop(ms) {
  // ~20 fps is plenty for something this slow.
  if (ms - lastFrame > 50) { draw(ms); lastFrame = ms; }
  requestAnimationFrame(loop);
}
requestAnimationFrame((ms) => { draw(ms); canvas.classList.add('ready'); requestAnimationFrame(loop); });

function setLight(c, m) {
  light.flicker = c.state === 'maybe';
  if (c.state === 'on') light.target = c.empty ? 1 : 1 - 0.62 * m.progress;
  else if (c.state === 'off') light.target = c.empty ? 0.03 : 0.03 + 0.25 * m.progress;
  else if (c.state === 'maybe') light.target = 0.5;
  else light.target = 0.4;
}

// ---------- count ----------

const count = $('[data-count]');
let shown = null;
function setCount(text) {
  if (text === shown) return;
  count.querySelectorAll('span').forEach((old) => {
    old.classList.add('out');
    setTimeout(() => old.remove(), 1200);
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

// ---------- panel ----------

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function dayBlock(day, now) {
  const cells = day.slots.map((s) => `<i class="${s.state}${s.end <= now ? ' past' : ''}"></i>`).join('');
  const inDay = now >= day.start && now < day.end;
  const marker = inDay ? `<b class="now" style="left:${((now - day.start) / (day.end - day.start)) * 100}%"></b>` : '';
  const rows = day.outages.length
    ? day.outages.map((o, i) => {
        const sw = [o.maybeBefore, o.maybeAfter].filter(Boolean).map((s) => `${fmtTime(s.start)}–${fmtTime(s.end, day.end)}`);
        const cont = o.intoNextDay ? ' → завтра' : o.fromPrevDay ? ' з учора' : '';
        return `<li class="${o.end <= now ? 'past' : ''}"><span class="n">${ROMAN[i] ?? i + 1}.</span><span>${o.text}${cont}${sw.length ? ` <span class="sw">· перемикання ${sw.join(', ')}</span>` : ''}</span><span>${fmtDuration(o.end - o.start)}</span></li>`;
      }).join('')
    : '<li><span class="n">—</span><span>Без відключень</span><span></span></li>';
  return `<section class="day">
    <h2>${day.label}<small>${day.dateLabel}, ${day.weekday}</small></h2>
    <div class="bar">${cells}${marker}</div>
    <div class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    <ul class="list">${rows}</ul>
  </section>`;
}

start((m, status) => {
  $('[data-notes]').innerHTML = statusNotes(m, status).map((n) => `<li>${n}</li>`).join('');
  if (!m) {
    if (!status.loading) $('[data-lede]').textContent = 'Графік не завантажився.';
    return;
  }
  const c = countdown(m);
  const d = describe(m);
  document.body.classList.toggle('empty', !!c.empty);
  const kicker = c.kicker.charAt(0).toUpperCase() + c.kicker.slice(1);
  $('[data-lede]').innerHTML = c.empty
    ? `<em>${d.title}.</em> ${d.line}`
    : `<em>${d.title}.</em> ${kicker} о ${c.at} лишається`;
  setCount(c.empty ? '' : `${String(c.h).padStart(2, '0')}:${String(c.m).padStart(2, '0')}`);
  setLight(c, m);

  $('[data-update]').textContent = m.scheduleUpdate ?? '—';
  $('[data-today]').textContent = m.today ? `${m.today.weekday}, ${m.today.dateLabel}` : '—';
  const blocks = m.days.map((day) => dayBlock(day, m.now));
  if (!m.tomorrowPublished) blocks.push('<section class="day"><h2>Завтра</h2><p class="empty-day">Графік ще не опубліковано.</p></section>');
  $('[data-days]').innerHTML = `<div class="days">${blocks.join('')}</div>`;
});

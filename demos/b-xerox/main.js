import { start, describe, statusNotes, fmtTime, QUEUE_LABEL } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
$('[data-queue]').textContent = QUEUE_LABEL;
$('[data-queue-big]').textContent = QUEUE_LABEL;

// ---------- halftone moon ----------

const canvas = $('[data-moon]');
const ctx = canvas.getContext('2d');
const moon = { lit: 1, waxing: false, shaky: false };

// Fixed dark "maria" patches so the disk reads as a moon, not a ball.
const MARIA = [
  [-0.32, -0.28, 0.32, 0.5], [0.18, -0.35, 0.22, 0.4], [0.3, 0.05, 0.26, 0.45],
  [-0.1, 0.3, 0.3, 0.35], [-0.5, 0.18, 0.16, 0.3], [0.05, -0.05, 0.12, 0.25],
];
function albedo(x, y) {
  let a = 1;
  for (const [mx, my, r, depth] of MARIA) {
    const d2 = ((x - mx) ** 2 + (y - my) ** 2) / (r * r);
    a -= depth * Math.exp(-d2 * 1.6);
  }
  return Math.max(0.35, a);
}

function drawMoon() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth;
  if (!size) return;
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = canvas.height = Math.round(size * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = getComputedStyle(document.body).color;

  // Lit fraction f maps to the phase angle between viewer and sun.
  const phi = Math.acos(2 * moon.lit - 1);
  const lx = Math.sin(phi) * (moon.waxing ? 1 : -1);
  const lz = Math.cos(phi);

  const step = size / 58;
  const R = size / 2 - step;
  const angle = (15 * Math.PI) / 180; // screen angle, like a print halftone
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const jitter = moon.shaky ? step * 0.35 : 0;
  const n = Math.ceil(size / step) + 4;

  ctx.beginPath();
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const gx = i * step, gy = j * step;
      const px = size / 2 + gx * cos - gy * sin + (Math.random() - 0.5) * jitter;
      const py = size / 2 + gx * sin + gy * cos + (Math.random() - 0.5) * jitter;
      const x = (px - size / 2) / R, y = (py - size / 2) / R;
      const r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2);
      const lambert = x * lx + z * lz;
      const lit = Math.min(1, Math.max(0, lambert * 6 + 0.15));
      const limb = 0.75 + 0.25 * z;
      // A faint floor keeps the unlit side visible, like earthshine.
      const b = Math.max(0.012, lit * albedo(x, y) * limb);
      const rad = step * 0.56 * Math.sqrt(b);
      if (rad < 0.25) continue;
      ctx.moveTo(px + rad, py);
      ctx.arc(px, py, rad, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

let shakeTimer = null;
function setMoon(state, m) {
  moon.shaky = state === 'maybe';
  if (state === 'on') { moon.lit = m.next ? 1 - m.progress * 0.97 : 1; moon.waxing = false; }
  else if (state === 'off') { moon.lit = m.next ? 0.03 + m.progress * 0.97 : 0.03; moon.waxing = true; }
  else if (state === 'maybe') { moon.lit = 0.5; moon.waxing = m.next?.state === 'on'; }
  else { moon.lit = 0.5; }
  clearInterval(shakeTimer);
  if (moon.shaky) shakeTimer = setInterval(drawMoon, 420);
  drawMoon();
}

addEventListener('resize', drawMoon);
document.addEventListener('themechange', () => requestAnimationFrame(drawMoon));

// ---------- schedule ----------

function book(day, now) {
  const rows = [];
  for (let h = 0; h < 24; h++) {
    const cells = [day.slots[h * 2], day.slots[h * 2 + 1]].map((s) =>
      `<span class="cell ${s.state}${s.end <= now ? ' past' : ''}"></span>`).join('');
    rows.push(`<div class="row"><i>${String(h).padStart(2, '0')}</i>${cells}</div>`);
  }
  const inDay = now >= day.start && now < day.end;
  const marker = inDay
    ? `<div class="now" style="top:${((now - day.start) / (day.end - day.start)) * 100}%" data-label="${fmtTime(now)}"></div>`
    : '';
  return `<div class="day"><h3><span>${day.label}</span><span>${day.dateLabel}</span></h3><div class="book">${rows.join('')}${marker}</div></div>`;
}

function periodsHtml(m) {
  return m.days.map((day) => {
    const list = day.outages.length
      ? day.outages.map((o) => {
          const sw = [o.maybeBefore, o.maybeAfter].filter(Boolean).map((s) => ` (±${fmtTime(s.start)}–${fmtTime(s.end, day.end)})`).join('');
          return o.text + sw;
        }).join(',<br>')
      : 'немає';
    return `<p class="period-day"><b>${day.label}, ${day.dateLabel}</b>${list}</p>`;
  }).join('');
}

start((m, status) => {
  $('[data-notes]').innerHTML = statusNotes(m, status).map((n) => `<li>${n}</li>`).join('');
  if (!m) {
    if (!status.loading) $('[data-caption]').textContent = 'Графік не завантажився';
    setMoon('unknown', {});
    return;
  }
  const d = describe(m);
  $('[data-caption]').textContent = `${d.title}. ${d.line}`;
  $('[data-line]').textContent = d.line;
  $('[data-update]').textContent = m.scheduleUpdate ?? '—';
  $('[data-periods]').innerHTML = periodsHtml(m);
  const days = m.days.map((day) => book(day, m.now));
  if (!m.tomorrowPublished) {
    days.push('<div class="day"><h3><span>Завтра</span><span>—</span></h3><div class="book empty">Графік ще не опубліковано</div></div>');
  }
  $('[data-days]').innerHTML = days.join('');
  setMoon(d.state, m);
});

import { start, describe, countdown, statusNotes, fmtTime, fmtDuration, QUEUE_LABEL } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
document.querySelectorAll('[data-queue]').forEach((el) => { el.textContent = QUEUE_LABEL; });

const hero = $('[data-hero]');
const tissue = $('[data-tissue]');

// Deckled bottom edge of the tissue, generated once.
(function deckle() {
  const pts = ['0 0', '100% 0'];
  for (let i = 40; i >= 0; i--) {
    const dip = (Math.sin(i * 1.7) * 0.5 + 0.5) * 4 + Math.random() * 5;
    pts.push(`${(i / 40) * 100}% calc(100% - ${dip.toFixed(1)}px)`);
  }
  tissue.style.setProperty('--edge', `polygon(${pts.join(',')})`);
})();

let segStart = null;
function renderTissue(m) {
  const seg = m.current;
  const c = countdown(m);
  if (!seg || c.empty) { tissue.style.setProperty('--p', 0); return; }
  // Aim at the next render's value so the 30s height transition keeps moving.
  const p = Math.min(1, (m.now + 30000 - seg.start) / (seg.end - seg.start));
  if (segStart !== seg.start) {
    tissue.classList.add('reset');
    hero.style.setProperty('--p', m.progress.toFixed(4));
    void tissue.offsetHeight;
    tissue.classList.remove('reset');
    segStart = seg.start;
  }
  hero.style.setProperty('--p', p.toFixed(4));
  $('[data-elapsed]').textContent = `минуло ${fmtDuration(m.now - seg.start)} з ${fmtTime(seg.start)}`;
}

function hours(day, now) {
  const cells = [];
  for (let h = 0; h < 24; h++) {
    const a = day.slots[h * 2], b = day.slots[h * 2 + 1];
    const label = String(h).padStart(2, '0');
    const current = now >= a.start && now < b.end;
    const tick = current ? `<i class="tick" style="left:${((now - a.start) / (b.end - a.start)) * 100}%"></i>` : '';
    cells.push(`<span class="hr${b.end <= now ? ' past' : ''}${current ? ' current' : ''}" title="${label}:00–${label}:30 ${a.state}, ${label}:30 ${b.state}"><b class="${a.state}">${label}</b><b class="${b.state}">${label}</b>${tick}</span>`);
  }
  return `<div class="hours">${cells.join('')}</div>`;
}

function periods(day) {
  const off = day.outages.length
    ? day.outages.map((o) => o.text + (o.intoNextDay ? ' →' : '') + (o.fromPrevDay ? ' (з учора)' : '')).join(', ')
    : 'немає';
  const sw = day.outages.flatMap((o) => [o.maybeBefore, o.maybeAfter]).filter(Boolean)
    .map((s) => `${fmtTime(s.start)}–${fmtTime(s.end, day.end)}`);
  return `<dl class="periods"><dt>Відключення</dt><dd>${off}</dd>${sw.length ? `<dt>Перемикання</dt><dd>${sw.join(', ')}</dd>` : ''}</dl>`;
}

start((m, status) => {
  $('[data-notes]').innerHTML = statusNotes(m, status).map((n) => `<li>${n}</li>`).join('');
  if (!m) {
    if (!status.loading) $('[data-kicker]').textContent = 'графік не завантажився';
    return;
  }
  const c = countdown(m);
  hero.dataset.state = c.state || 'unknown';
  hero.classList.toggle('empty', !!c.empty);
  $('[data-kicker]').textContent = c.empty ? c.kicker : `${c.kicker} о ${c.at}`;
  $('[data-h]').textContent = c.h ?? '—';
  $('[data-h]').parentElement.classList.toggle('no-h', c.h === 0);
  $('[data-m]').textContent = c.m == null ? '—' : String(c.m).padStart(2, '0');
  const d = describe(m);
  $('[data-line]').textContent = `${d.title}. ${d.line}`;
  $('[data-update]').textContent = m.scheduleUpdate ?? '—';
  renderTissue(m);

  const blocks = m.days.map((day) => `
    <article class="day">
      <div class="day-head"><h2>${day.label}</h2><span>${day.dateLabel}, ${day.weekday}</span></div>
      ${hours(day, m.now)}
      ${periods(day)}
    </article>`);
  if (!m.tomorrowPublished) {
    blocks.push('<article class="day empty"><div class="day-head"><h2>Завтра</h2><span>—</span></div><p>Графік ще не опубліковано.</p></article>');
  }
  $('[data-days]').innerHTML = blocks.join('');
});

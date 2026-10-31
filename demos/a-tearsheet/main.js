import { start, describe, statusNotes, fmtTime, QUEUE_LABEL } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
const WORDS = { on: 'СВІТЛО', off: 'ТЕМНО', maybe: 'МОЖЛИВО', unknown: '———' };
const STATE_NAMES = { on: 'Увімкнено', off: 'Вимкнено', maybe: 'Перемикання', unknown: '—' };

$('[data-queue]').textContent = QUEUE_LABEL;

let wordKey = '';
function renderWord(state, progress, hasTarget) {
  const el = $('[data-word]');
  const word = WORDS[state];
  if (wordKey !== word) {
    el.innerHTML = [...word].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');
    wordKey = word;
  }
  el.dataset.state = state;
  const n = word.length;
  [...el.children].forEach((span, i) => {
    let f = 1;
    // Filled letters mean light: they burn out towards an outage and fill back in towards power.
    if (hasTarget && state === 'on') f = Math.min(1, Math.max(0, i + 1 - progress * n));
    if (state === 'off') f = hasTarget ? Math.min(1, Math.max(0, progress * n - i)) : 0;
    if (state === 'maybe') f = 0.45;
    span.style.setProperty('--f', f.toFixed(3));
  });
}

function renderPlate(m, d) {
  const plate = $('[data-plate]');
  let light = 1;
  if (d.state === 'on' && m.next) light = 1 - 0.3 * m.progress;
  if (d.state === 'off') light = 0.04 + (m.next ? 0.22 * m.progress : 0);
  if (d.state === 'maybe') light = 0.5;
  if (d.state === 'unknown') light = 0.6;
  plate.style.setProperty('--light', light.toFixed(3));
  plate.dataset.state = d.state;
  $('[data-plate-caption]').textContent = `Освітленість кімнати о ${fmtTime(m.now)}`;
}

function strip(day, now) {
  const hours = Array.from({ length: 24 }, (_, h) => `<span>${String(h).padStart(2, '0')}</span>`).join('');
  const cells = day.slots.map((s) =>
    `<div class="c ${s.state}${s.end <= now ? ' past' : ''}" title="${fmtTime(s.start)}–${fmtTime(s.end, day.end)}"></div>`).join('');
  const inDay = now >= day.start && now < day.end;
  const marker = inDay
    ? `<div class="now" style="left:${((now - day.start) / (day.end - day.start)) * 100}%" data-label="${fmtTime(now)}"></div>`
    : '';
  return `<div class="strip"><div class="hours">${hours}</div><div class="cells">${cells}</div>${marker}</div>`;
}

function periods(day) {
  if (!day.outages.length) return '<dl class="periods"><dt>Відключення</dt><dd>немає</dd></dl>';
  const off = day.outages.map((o) => o.text + (o.intoNextDay ? ' <small>→ завтра</small>' : '') + (o.fromPrevDay ? ' <small>з учора</small>' : '')).join(', ');
  const maybe = day.outages.flatMap((o) => [o.maybeBefore, o.maybeAfter]).filter(Boolean)
    .map((s) => `${fmtTime(s.start)}–${fmtTime(s.end, day.end)}`);
  return `<dl class="periods">
    <dt>Відключення</dt><dd>${off}</dd>
    ${maybe.length ? `<dt>Перемикання</dt><dd>${maybe.join(', ')}</dd>` : ''}
  </dl>`;
}

function renderSchedule(m) {
  const blocks = m.days.map((day) => `
    <article class="day">
      <div class="day-head"><span class="day-name">${day.label}</span><span class="day-date">${day.dateLabel}, ${day.weekday}</span></div>
      ${strip(day, m.now)}
      ${periods(day)}
    </article>`);
  if (!m.tomorrowPublished) {
    blocks.push(`
    <article class="day">
      <div class="day-head"><span class="day-name">Завтра</span><span class="day-date">очікується</span></div>
      <div class="strip empty"><div class="hours"></div><div class="cells">графік ще не опубліковано</div></div>
    </article>`);
  }
  $('[data-schedule]').innerHTML = blocks.join('');
}

start((m, status) => {
  $('[data-notes]').innerHTML = statusNotes(m, status).map((n) => `<li>${n}</li>`).join('');
  if (!m) {
    if (!status.loading) $('[data-prose]').textContent = 'Графік не завантажився.';
    return;
  }
  const d = describe(m);
  $('[data-prose]').innerHTML = `<em>${d.title}.</em> ${d.line}`;
  $('[data-meta-state]').textContent = STATE_NAMES[d.state];
  $('[data-meta-next]').textContent = d.at ? `${d.at} · ${d.left}` : '—';
  $('[data-meta-update]').textContent = m.scheduleUpdate ?? '—';
  renderWord(d.state, m.progress, !!m.next);
  renderPlate(m, d);
  renderSchedule(m);
});

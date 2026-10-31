import { start, countdown, statusNotes, fmtTime, QUEUE_LABEL } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const pad = (n) => String(n).padStart(2, '0');

export const spread = (text) => text.split(' ').map((w) => `<span>${w}</span>`).join('');

function copy(m, c) {
  if (!m.current) return { head: 'Графіка на сьогодні немає', sub: '' };
  const n = m.next;
  if (c.state === 'on') {
    if (c.empty) return { head: 'Згідно з графіком світло є', sub: 'Відключень попереду немає' };
    return { head: 'Згідно з графіком світло є', sub: n?.state === 'maybe' ? `Можливе відключення<br>о ${c.at}` : `Відключення заплановане<br>о ${c.at}` };
  }
  if (c.state === 'off') {
    if (c.empty) return { head: 'Згідно з графіком світло відсутнє', sub: 'До кінця відомого графіка' };
    if (n?.state === 'maybe' && m.afterNext?.state === 'on') {
      return { head: 'Згідно з графіком світло відсутнє', sub: `Увімкнення можливе о ${c.at}<br>напевно о ${fmtTime(m.afterNext.start)}` };
    }
    return { head: 'Згідно з графіком світло відсутнє', sub: `Увімкнення заплановане<br>о ${c.at}` };
  }
  return { head: 'Згідно з графіком час перемикання', sub: `Світла може не бути<br>до ${fmtTime(m.current.end)}` };
}

function durationCaps(ms) {
  const t = Math.round(ms / 60000), h = Math.floor(t / 60), mi = t % 60;
  return [h && `${h} год`, mi && `${mi} хв`].filter(Boolean).join(' ');
}

function dayBlock(day, now, tone) {
  const dots = [];
  for (let h = 0; h < 24; h++) {
    const a = day.slots[h * 2], b = day.slots[h * 2 + 1];
    const cls = [b.end <= now ? 'past' : '', now >= a.start && now < b.end ? 'now' : ''].join(' ');
    dots.push(`<i class="dot ${cls}" style="--a:${tone(a.state)};--b:${tone(b.state)}" title="${pad(h)}:00"></i>`);
  }
  const items = day.outages.length
    ? day.outages.map((o, i) => {
        const before = o.maybeBefore ? `<span class="sw">(${fmtTime(o.maybeBefore.start)})</span> ` : '';
        const after = o.maybeAfter ? ` <span class="sw">(${fmtTime(o.maybeAfter.end, day.end)})</span>` : '';
        return `<li class="${o.end <= now ? 'past' : ''}"><span class="rn">${ROMAN[i] ?? i + 1}.</span><span>${before}${o.text}${after}</span><span class="d">${durationCaps(o.end - o.start)}</span></li>`;
      }).join('')
    : '<li class="none"><span class="rn">—</span><span>Без відключень</span><span></span></li>';
  const title = day.isToday ? 'Графік відключень на сьогодні' : 'Графік відключень на завтра';
  return `<section class="day">
    <div class="dots">${dots.join('')}</div>
    <p class="spread">${spread(title)}</p>
    <ol class="list">${items}</ol>
  </section>`;
}

// Shared page frame: header, copy, clock digits, day schedules.
// onHero(m, c) draws the demo-specific visual; tone(state) colours the dots.
export function run({ onHero, tone }) {
  document.querySelectorAll('[data-queue]').forEach((el) => { el.textContent = QUEUE_LABEL; });
  start((m, status) => {
    $('[data-notes]').innerHTML = statusNotes(m, status).map((n) => `<li>${n}</li>`).join('');
    if (!m) {
      if (!status.loading) $('[data-sub]').textContent = 'Графік не завантажився';
      return;
    }
    const c = countdown(m);
    document.body.dataset.state = c.state || 'unknown';
    const t = copy(m, c);
    $('[data-head]').innerHTML = spread(t.head);
    $('[data-sub]').innerHTML = t.sub;
    $('[data-clock]').innerHTML = c.empty
      ? '–<span class="colon">:</span>–'
      : `${pad(c.h)}<span class="colon">:</span>${pad(c.m)}`;
    $('[data-update]').textContent = m.scheduleUpdate ?? '—';

    const days = m.days.map((d) => dayBlock(d, m.now, tone));
    if (!m.tomorrowPublished) days.push(`<section class="day"><p class="spread">${spread('Графік на завтра ще не опубліковано')}</p></section>`);
    // Pages with a first-screen slot get today there and the rest below.
    const todaySlot = $('[data-today]');
    if (todaySlot) todaySlot.innerHTML = m.today ? days.shift() : '';
    $('[data-days]').innerHTML = days.join('');
    onHero(m, c);
  });
}

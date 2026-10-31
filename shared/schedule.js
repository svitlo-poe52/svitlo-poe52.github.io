const SOURCE = 'https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Poltavaoblenergo.json';
export const QUEUE = 'GPV5.2';
export const QUEUE_LABEL = QUEUE.replace('GPV', '');

const TZ = 'Europe/Kyiv';
const REFRESH_MS = 3 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const WEEKDAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];

// Each hourly status splits into two half-hour slots.
// mfirst/msecond mark only the yellow "switching" half; the other half continues
// its neighbour (checked against the official chart: "no, msecond" is off until :30).
const HALVES = {
  yes: ['on', 'on'],
  no: ['off', 'off'],
  first: ['off', 'on'],
  second: ['on', 'off'],
  mfirst: ['maybe', 'next'],
  msecond: ['prev', 'maybe'],
};

function resolveNeighbours(slots) {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].state === 'prev') slots[i].state = slots[i - 1]?.state ?? 'on';
  }
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].state === 'next') slots[i].state = slots[i + 1]?.state ?? 'on';
  }
  for (const s of slots) if (s.state === 'prev' || s.state === 'next') s.state = 'on';
}

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
});
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function kyivParts(ms) {
  const o = {};
  for (const p of partsFmt.formatToParts(ms)) {
    if (p.type === 'weekday') o.weekday = WD[p.value];
    else if (p.type !== 'literal') o[p.type] = +p.value;
  }
  return o;
}

// Kyiv wall-clock -> epoch ms. Out-of-range fields (day 32, hour 24) roll over like Date.UTC.
// The second pass settles the offset when the guess lands on the other side of a DST switch.
export function kyivToEpoch(y, mo, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = kyivParts(t);
    t = guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t);
  }
  return t;
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtTime(ms, dayEnd) {
  if (dayEnd && ms === dayEnd) return '24:00';
  const p = kyivParts(ms);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} год ${m} хв`;
  if (h) return `${h} год`;
  if (m) return `${m} хв`;
  return 'менше хвилини';
}

export function fmtDate(p) {
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

function parseNowParam() {
  const v = new URLSearchParams(location.search).get('now');
  const m = v && v.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/);
  if (!m) return null;
  const real = Date.now();
  const fake = kyivToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5]);
  // Fake clock keeps running from the given moment.
  return () => fake + (Date.now() - real);
}
export const now = parseNowParam() || (() => Date.now());

function buildDay(key, statuses, p, todayP) {
  const slots = [];
  for (let i = 0; i < 48; i++) {
    const hour = Math.floor(i / 2);
    const status = statuses?.[String(hour + 1)];
    const state = HALVES[status]?.[i % 2] ?? 'unknown';
    slots.push({ state, start: kyivToEpoch(p.year, p.month, p.day, hour, (i % 2) * 30) });
  }
  const end = kyivToEpoch(p.year, p.month, p.day + 1);
  slots.forEach((s, i) => { s.end = slots[i + 1]?.start ?? end; });
  const isToday = p.year === todayP.year && p.month === todayP.month && p.day === todayP.day;
  return {
    key, date: p, start: slots[0].start, end, slots, isToday,
    label: isToday ? 'Сьогодні' : 'Завтра',
    dateLabel: fmtDate(p),
    weekday: WEEKDAYS[p.weekday],
  };
}

function mergeSegments(slots) {
  const out = [];
  for (const s of slots) {
    const last = out[out.length - 1];
    if (last && last.state === s.state && last.end === s.start) last.end = s.end;
    else out.push({ state: s.state, start: s.start, end: s.end });
  }
  return out;
}

// Outages for one day, clipped to its bounds. Switching halves that touch an
// off period are attached to it rather than listed on their own.
function dayOutages(day, segments) {
  const res = [];
  segments.forEach((seg, i) => {
    if (seg.state !== 'off') return;
    const before = segments[i - 1]?.state === 'maybe' ? segments[i - 1] : null;
    const after = segments[i + 1]?.state === 'maybe' ? segments[i + 1] : null;
    const start = Math.max(seg.start, day.start);
    const end = Math.min(seg.end, day.end);
    if (start >= end) return;
    res.push({
      start, end,
      text: `${fmtTime(start)}–${fmtTime(end, day.end)}`,
      fromPrevDay: seg.start < day.start,
      intoNextDay: seg.end > day.end,
      maybeBefore: before && before.start >= day.start ? before : null,
      maybeAfter: after && after.end <= day.end ? after : null,
    });
  });
  return res;
}

export function buildModel(json, t = now()) {
  const todayP = kyivParts(t);
  const tomorrowP = kyivParts(kyivToEpoch(todayP.year, todayP.month, todayP.day + 1, 12));
  const sameDate = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;

  const days = [];
  for (const key of Object.keys(json?.fact?.data ?? {}).sort((a, b) => a - b)) {
    const p = kyivParts(+key * 1000 + 12 * 3600 * 1000);
    if (sameDate(p, todayP) || sameDate(p, tomorrowP)) {
      days.push(buildDay(+key, json.fact.data[key][QUEUE], p, todayP));
    }
  }
  const today = days.find((d) => d.isToday) ?? null;
  const tomorrow = days.find((d) => !d.isToday) ?? null;

  // Today and tomorrow form one continuous timeline so periods crossing midnight stay whole.
  const allSlots = days.flatMap((d) => d.slots);
  resolveNeighbours(allSlots);
  const segments = mergeSegments(allSlots);
  days.forEach((d) => { d.outages = dayOutages(d, segments); });

  const idx = segments.findIndex((s) => s.start <= t && t < s.end);
  const current = segments[idx] ?? null;
  const next = idx >= 0 ? segments[idx + 1] ?? null : null;
  const afterNext = idx >= 0 ? segments[idx + 2] ?? null : null;
  const nextOff = segments.find((s) => s.state === 'off' && s.end > t) ?? null;

  const lastUpdated = json?.lastUpdated ? Date.parse(json.lastUpdated) : NaN;
  return {
    now: t, days, today, tomorrow, segments, current, next, afterNext, nextOff,
    tomorrowPublished: !!tomorrow,
    horizon: segments.length ? segments[segments.length - 1].end : null,
    progress: current ? (t - current.start) / (current.end - current.start) : 0,
    remaining: current ? current.end - t : 0,
    scheduleUpdate: json?.fact?.update ?? null,
    stale: Number.isFinite(lastUpdated) && t - lastUpdated > STALE_MS,
    lastUpdated,
  };
}

// Plain-language summary of the current moment, shared by all demos.
export function describe(m) {
  const c = m.current;
  if (!c) return { state: 'unknown', title: 'Графіка немає', line: 'На сьогодні графік для черги ще не опубліковано.' };
  const n = m.next;
  const at = n ? fmtTime(n.start) : null;
  const left = fmtDuration(m.remaining);

  if (c.state === 'on') {
    if (!m.nextOff) return { state: 'on', title: 'Світло є', line: `Відключень попереду немає.`, left: null };
    if (n?.state === 'maybe') return { state: 'on', title: 'Світло є', line: `Можливе вимкнення з ${at}, за ${left}.`, at, left };
    if (n?.state === 'off') return { state: 'on', title: 'Світло є', line: `Вимкнуть о ${at}, за ${left}.`, at, left };
    return { state: 'on', title: 'Світло є', line: `До кінця відомого графіка ${left}.`, left };
  }
  if (c.state === 'off') {
    if (n?.state === 'maybe') {
      const sure = m.afterNext?.state === 'on' ? `, напевно — з ${fmtTime(m.afterNext.start)}` : '';
      return { state: 'off', title: 'Світла немає', line: `Можуть увімкнути з ${at}${sure}. Ще ${left}.`, at, left };
    }
    if (n?.state === 'on') return { state: 'off', title: 'Світла немає', line: `Увімкнуть о ${at}, за ${left}.`, at, left };
    return { state: 'off', title: 'Світла немає', line: `Відключення до кінця відомого графіка, ${left}.`, left };
  }
  if (c.state === 'maybe') {
    const what = n?.state === 'off' ? 'далі вимкнення' : n?.state === 'on' ? 'далі світло' : 'далі невідомо';
    return { state: 'maybe', title: 'Перемикання', line: `Світла може не бути до ${fmtTime(c.end)}, ${what}.`, at: fmtTime(c.end), left };
  }
  return { state: 'unknown', title: 'Невідомо', line: 'У графіку незрозумілий статус.', left };
}

// Numbers-first view of the current moment: what we count down to and how long.
export function countdown(m) {
  const c = m.current;
  if (!c) return { kicker: 'графіка немає', empty: true };
  const n = m.next;
  const total = Math.max(0, Math.floor(m.remaining / 60000));
  const base = { h: Math.floor(total / 60), m: total % 60, at: n ? fmtTime(n.start) : fmtTime(c.end), state: c.state };
  if (c.state === 'on') {
    if (!m.nextOff) return { ...base, kicker: 'відключень попереду немає', empty: true };
    return { ...base, kicker: n?.state === 'maybe' ? 'до можливого вимкнення' : 'до вимкнення' };
  }
  if (c.state === 'off') {
    if (!n) return { ...base, kicker: 'світла немає до кінця графіка', empty: true };
    return { ...base, kicker: n.state === 'maybe' ? 'до можливого увімкнення' : 'до увімкнення' };
  }
  if (c.state === 'maybe') return { ...base, kicker: n?.state === 'off' ? 'перемикання, далі вимкнення' : 'перемикання ще' };
  return { ...base, kicker: 'невідомий стан', empty: true };
}

// Warnings worth showing next to the data.
export function statusNotes(m, status) {
  const notes = [];
  if (status.error && !m) notes.push('Не вдалося завантажити графік. Спробую ще раз за кілька хвилин.');
  else if (status.error) notes.push('Не вдалося оновити дані, показую останні завантажені.');
  if (m?.stale) notes.push(`Дані давно не оновлювались (парсер востаннє: ${fmtTime(m.lastUpdated)}, ${fmtDate(kyivParts(m.lastUpdated))}).`);
  if (m && !m.tomorrowPublished) notes.push('Графік на завтра ще не опубліковано.');
  return notes;
}

// ---------- loading ----------

async function fetchJson() {
  const mock = new URLSearchParams(location.search).get('mock');
  if (mock) return mockJson(mock.split(','));
  const res = await fetch(`${SOURCE}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Calls onChange(model, status) after each fetch and once a minute in between.
export function start(onChange) {
  let json = null;
  const status = { loading: true, error: null, fetchedAt: null };
  const render = () => onChange(json ? buildModel(json) : null, status);

  async function load() {
    try {
      json = await fetchJson();
      status.error = null;
      status.fetchedAt = Date.now();
    } catch (e) {
      status.error = e.message || String(e);
    }
    status.loading = false;
    render();
  }

  load();
  setInterval(load, REFRESH_MS);
  setInterval(render, 30 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') load();
  });
}

// ---------- mocks: ?mock=sample|midnight|notomorrow|none|stale|fail (comma-separated) ----------

const PATTERNS = {
  real: 'yes yes yes yes yes yes yes yes yes yes second no msecond yes yes yes second no no mfirst yes yes second no',
  tomorrow: 'no mfirst yes yes yes yes yes first no no mfirst yes yes yes yes second no no msecond yes yes yes yes yes',
  midnightToday: 'yes yes yes yes yes yes yes yes yes no no msecond yes yes yes yes yes yes yes yes yes yes second no',
  midnightTomorrow: 'no no mfirst yes yes yes yes yes yes yes yes yes yes yes yes yes no no msecond yes yes yes yes yes',
  calm: Array(24).fill('yes').join(' '),
};

function toHours(pattern) {
  const o = {};
  pattern.split(' ').forEach((s, i) => { o[String(i + 1)] = s; });
  return o;
}

function mockJson(flags) {
  if (flags.includes('fail')) throw new Error('mock fetch failure');
  const t = now();
  const p = kyivParts(t);
  const todayKey = kyivToEpoch(p.year, p.month, p.day) / 1000;
  const tomorrowKey = kyivToEpoch(p.year, p.month, p.day + 1) / 1000;
  let today = PATTERNS.real;
  let tomorrow = PATTERNS.tomorrow;
  if (flags.includes('midnight')) { today = PATTERNS.midnightToday; tomorrow = PATTERNS.midnightTomorrow; }
  if (flags.includes('none')) { today = PATTERNS.calm; tomorrow = null; }
  if (flags.includes('notomorrow')) tomorrow = null;

  const data = { [todayKey]: { [QUEUE]: toHours(today) } };
  if (tomorrow) data[tomorrowKey] = { [QUEUE]: toHours(tomorrow) };
  const updated = flags.includes('stale') ? t - 7 * 3600 * 1000 : t - 4 * 60 * 1000;
  const up = kyivParts(updated);
  return {
    lastUpdated: new Date(updated).toISOString(),
    fact: { data, today: todayKey, update: `${pad(up.day)}.${pad(up.month)}.${up.year} ${pad(up.hour)}:${pad(up.minute)}` },
  };
}

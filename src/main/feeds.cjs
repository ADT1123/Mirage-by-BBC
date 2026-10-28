// Daily, network-backed content, cached on disk so it still works offline:
//  - quote of the day (ZenQuotes)
//  - Bhagavad Gita verse of the day (vedicscriptures.github.io)
//  - a public-domain devotional painting of the day (Wikimedia Commons)
//  - your approximate city from your IP, when you haven't set one (ipapi.co)

const fs = require('fs');
const path = require('path');
const config = require('../shared/config.cjs');
const brand = require('../shared/brand.cjs');

const CACHE_FILE = path.join(config.DIR, 'cache.json');
const ART_DIR = path.join(config.DIR, 'art');
const UA = `${brand.slug}/1.0 (open-source desktop wallpaper)`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayIndex() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(key, value) {
  const c = readCache();
  c[key] = value;
  fs.mkdirSync(config.DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2));
}

async function fetchJson(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Same-day result from cache, else fetch; on failure fall back to the last good value.
const inflight = {};
function daily(key, loader) {
  const c = readCache()[key];
  if (c && c.day === today()) return Promise.resolve(c.value);
  if (!inflight[key]) {
    inflight[key] = loader()
      .then((value) => {
        if (value) writeCache(key, { day: today(), value });
        return value || c?.value || null;
      })
      .catch(() => c?.value || null)
      .finally(() => delete inflight[key]);
  }
  return inflight[key];
}

// ---------------------------------------------------------------- rotation
// "every" = how often a widget shows something new: day | hour | 30m | 15m | 5m | 1m
const PERIOD = { hour: 3600e3, '30m': 1800e3, '15m': 900e3, '5m': 300e3, '1m': 60e3 };

// which slot we're in right now; the same slot always gives the same pick
function slot(every) {
  return PERIOD[every] ? Math.floor(Date.now() / PERIOD[every]) : dayIndex();
}

// ---------------------------------------------------------------- quote

// a day's pool of ~50 quotes, rotated through by slot
function quotePool() {
  return daily('quotes', async () => {
    const list = await fetchJson('https://zenquotes.io/api/quotes');
    const pool = (Array.isArray(list) ? list : []).filter((q) => q?.q && !/too many requests/i.test(q.q)).map((q) => ({ text: q.q.trim(), author: (q.a || '').trim() }));
    return pool.length ? pool : null;
  });
}

async function quote(every = 'day') {
  const pool = await quotePool();
  if (!pool?.length) return null;
  return { ...pool[slot(every) % pool.length], slot: `${every}:${slot(every)}` };
}

// ---------------------------------------------------------------- gita

const VERSES = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78];

// walks through all 700 verses in order, one per slot; each verse is cached once fetched
const verseCache = new Map();
async function verse(every = 'day') {
  const s = slot(every);
  let n = s % VERSES.reduce((a, b) => a + b, 0);
  let ch = 0;
  while (n >= VERSES[ch]) n -= VERSES[ch++];
  const key = `${ch + 1}.${n + 1}`;
  if (verseCache.has(key)) return verseCache.get(key);
  const stored = readCache()[`verse:${key}`];
  if (stored) return verseCache.set(key, stored).get(key);
  try {
    const d = await fetchJson(`https://vedicscriptures.github.io/slok/${ch + 1}/${n + 1}/`);
    const english = d.siva?.et || d.purohit?.et || d.prabhu?.et || '';
    const v = {
      ref: `${d.chapter}.${d.verse}`,
      sanskrit: String(d.slok || '').replace(/\|\|[^|]*\|\|/g, '॥').replace(/\|/g, '।').trim(),
      english: english.replace(/^\s*\d+\.\d+\s*/, '').trim(),
    };
    writeCache(`verse:${key}`, v);
    writeCache('verse-last', v);
    verseCache.set(key, v);
    return v;
  } catch {
    return readCache()['verse-last'] || null; // offline: keep showing the last one
  }
}

// ---------------------------------------------------------------- art

// Each search must name the deity in the file title; royal portraits that share names are skipped.
const ART_QUERIES = [
  { q: 'Raja Ravi Varma Lakshmi', match: /lakshmi|laxmi/i },
  { q: 'Raja Ravi Varma Saraswati', match: /saraswat|sarasvat/i },
  { q: 'Raja Ravi Varma Krishna', match: /krishna|radha/i },
  { q: 'Raja Ravi Varma Shiva', match: /shiva|siva|shankar|parvati/i },
  { q: 'Raja Ravi Varma Rama', match: /ram|rama(?! varma)|sita/i },
  { q: 'Raja Ravi Varma Ganesha', match: /ganesh|ganapat/i },
  { q: 'Raja Ravi Varma Durga', match: /durga|mahishasura/i },
  { q: 'Raja Ravi Varma Vishnu', match: /vishnu|narayan/i },
  { q: 'Raja Ravi Varma Hanuman', match: /hanuman|maruti/i },
];
const NOT_DEITY = /thirunal|maharaja|maharani|travancore|stamp|rama varma|bayi|cropped|, edit|duplicate/i;

function strip(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function findArt({ q: query, match }) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    `&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(query + ' filetype:bitmap')}` +
    '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1100' +
    '&iiextmetadatafilter=LicenseShortName|Artist|ObjectName';
  const data = await fetchJson(url, 12000);
  const pages = Object.values(data.query?.pages || {});
  return pages
    .map((p) => ({ p, ii: p.imageinfo?.[0] }))
    .filter(({ ii }) => {
      if (!ii?.thumburl) return false;
      const lic = String(ii.extmetadata?.LicenseShortName?.value || '');
      // only public domain, and only portrait-ish paintings that fit an arch frame
      return /public domain|^pd/i.test(lic) && ii.height > ii.width * 1.1;
    })
    .filter(({ p }) => match.test(p.title) && !NOT_DEITY.test(p.title))
    .map(({ p, ii }) => ({
      id: p.pageid,
      title: strip(ii.extmetadata?.ObjectName?.value) || p.title.replace(/^File:|\.[a-z]+$/gi, ''),
      artist: strip(ii.extmetadata?.Artist?.value) || 'Unknown artist',
      license: strip(ii.extmetadata?.LicenseShortName?.value),
      thumb: ii.thumburl,
      page: ii.descriptionurl,
    }));
}

function art() {
  return daily('art', async () => {
    const i = dayIndex();
    // walk the query list from today's slot until one returns something usable
    for (let k = 0; k < ART_QUERIES.length; k++) {
      const found = await findArt(ART_QUERIES[(i + k) % ART_QUERIES.length]).catch(() => []);
      if (!found.length) continue;
      const pick = found[i % found.length];
      fs.mkdirSync(ART_DIR, { recursive: true });
      const file = path.join(ART_DIR, `${pick.id}.jpg`);
      if (!fs.existsSync(file)) {
        const res = await fetch(pick.thumb, { headers: { 'user-agent': UA } });
        if (!res.ok) continue;
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      return { ...pick, file };
    }
    return null;
  });
}

// ---------------------------------------------------------------- location

let located = null;
async function locate() {
  if (located) return located;
  const c = readCache().location;
  if (c && Date.now() - c.at < 6 * 3600 * 1000) return (located = c.value);
  try {
    const d = await fetchJson('https://ipapi.co/json/');
    if (d.latitude == null) throw new Error('no location');
    located = { name: d.city || d.region || 'Here', country: d.country_code || '', lat: d.latitude, lon: d.longitude, auto: true };
    writeCache('location', { at: Date.now(), value: located });
    return located;
  } catch {
    return c?.value || null;
  }
}

module.exports = { quote, verse, art, locate };

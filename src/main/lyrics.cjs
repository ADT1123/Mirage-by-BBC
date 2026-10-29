// Time-synced lyrics from LRCLIB (free, open, no key). Falls back to plain lyrics when a
// song has no timing. Found lyrics are kept on disk, so they still show on networks that
// block the lyrics service (some campus and office Wi-Fi) or with no internet at all.

const fs = require('fs');
const path = require('path');
const config = require('../shared/config.cjs');

const FILE = path.join(config.DIR, 'lyrics.json');
const cache = new Map();
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) cache.set(k, v);
} catch {}
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      while (cache.size > 300) cache.delete(cache.keys().next().value);
      fs.mkdirSync(config.DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(cache)));
    } catch {}
  }, 1000);
}

// why a lookup failed: the network refuses the site (bad certificate, 403) vs no connection
function failure(e) {
  const code = String(e?.cause?.code || e?.code || e?.status || '');
  if (/CERT|SIGNATURE|SELF_SIGNED|UNABLE_TO_VERIFY|^403$/.test(code)) return { none: true, blocked: true };
  return { none: true, offline: true };
}

function parseLrc(lrc) {
  const lines = [];
  for (const raw of String(lrc || '').split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) lines.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mirage wallpaper (https://github.com)' } });
    if (res.status === 403) throw Object.assign(new Error('forbidden'), { status: 403 });
    return res.ok ? await res.json() : null;
  } finally {
    clearTimeout(t);
  }
}

const clean = (s) => String(s || '').replace(/\(.*?\)|\[.*?\]|feat\..*$/gi, '').trim();

// -> { synced: [{ t, text }] } | { plain: 'text' } | { none: true }
async function get({ title, artist, album, duration }) {
  if (!title) return { none: true };
  const key = `${artist}|${title}`.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let result = { none: true };
  try {
    const q = new URLSearchParams({ track_name: clean(title), artist_name: clean(artist) });
    if (album) q.set('album_name', album);
    if (duration > 0) q.set('duration', String(Math.round(duration)));
    let hit = await fetchJson(`https://lrclib.net/api/get?${q}`);
    if (!hit?.syncedLyrics && !hit?.plainLyrics) {
      const list = await fetchJson(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${clean(artist)} ${clean(title)}`.trim() })}`);
      hit = (list || []).find((x) => x.syncedLyrics) || (list || [])[0] || null;
    }
    if (hit?.instrumental) result = { instrumental: true };
    else if (hit?.syncedLyrics) result = { synced: parseLrc(hit.syncedLyrics) };
    else if (hit?.plainLyrics) result = { plain: hit.plainLyrics };
  } catch (e) {
    return failure(e); // not remembered: tried again next time
  }
  cache.set(key, result);
  persist();
  return result;
}

module.exports = { get };

// Time-synced lyrics from LRCLIB (free, open, no key). Falls back to plain lyrics when a
// song has no timing, and remembers results so each song is looked up once.

const cache = new Map();

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
  } catch {
    return { none: true, offline: true }; // don't remember failures: try again later
  }
  cache.set(key, result);
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return result;
}

module.exports = { get };

// Now Playing: whatever Windows says is playing (Spotify, Apple Music, YouTube in a browser…).
// A small long-lived PowerShell helper (media.ps1) streams the session; artwork and exact
// track length come from the iTunes Search API, since browsers often don't report either.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../shared/config.cjs');

const SCRIPT = path.join(__dirname, 'media.ps1');
let child = null;
let state = { active: false, playing: false };
let listeners = [];
let restartTimer = null;
const artCache = new Map();
const thumbs = new Map();
const lastLookup = new Map(); // track key -> when we last asked iTunes

// Recently played (last 10, with small covers) and a play log for Wrapped.
const HISTORY_FILE = path.join(config.DIR, 'history.json');
let history = { recent: [], plays: [] };
let historyListeners = [];
let pendingPlay = null; // { key, since } until a song has played long enough to count
try {
  history = { recent: [], plays: [], ...JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) };
} catch {}

function saveHistory() {
  const cutoff = Date.now() - 35 * 864e5;
  history.plays = history.plays.filter((p) => p.at > cutoff);
  try {
    fs.mkdirSync(config.DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
  } catch {}
  for (const fn of historyListeners) fn(history.recent);
}

// covers are kept small: a 1000px iTunes link becomes 300px, a Windows thumbnail a 200px JPEG
function smallArt(art) {
  if (!art) return null;
  if (art.startsWith('http')) return art.replace(/\d+x\d+bb/, '300x300bb');
  try {
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromDataURL(art);
    if (img.isEmpty()) return null;
    return `data:image/jpeg;base64,${img.resize({ width: 200, quality: 'good' }).toJPEG(82).toString('base64')}`;
  } catch {
    return null;
  }
}

// a song counts once it has played for 20 seconds
function trackPlay() {
  if (!state.active || !state.title) return;
  if (!pendingPlay || pendingPlay.key !== state.key) {
    if (history.recent[0]?.key === state.key) return; // still the same song as last time
    pendingPlay = { key: state.key, since: Date.now() };
  }
  if (!state.playing || Date.now() - pendingPlay.since < 20000) return;
  pendingPlay = null;
  const entry = { key: state.key, title: state.title, artist: state.artist || '', album: state.album || '', app: state.appName || '', art: smallArt(state.art), at: Date.now() };
  history.recent = [entry, ...history.recent.filter((h) => h.key !== state.key)].slice(0, 10);
  history.plays.push({ title: entry.title, artist: entry.artist, at: entry.at });
  saveHistory();
}

// the cover often arrives after the song was logged: fill it in
function updateHistoryArt() {
  const h = history.recent.find((x) => x.key === state.key);
  if (!h || !state.art || (h.art && state.artSource !== 'itunes') || h.artFrom === state.art.slice(0, 64)) return;
  h.artFrom = state.art.slice(0, 64);
  const art = smallArt(state.art);
  if (!art) return;
  h.art = art;
  saveHistory();
}

// Elapsed-time estimate for players that don't report a timeline.
let clock = { key: '', base: 0, since: 0, playing: false };

function prettyApp(id = '') {
  const known = { spotify: 'Spotify', applemusic: 'Apple Music', zune: 'Media Player', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', brave: 'Brave', vlc: 'VLC', comet: 'Comet', opera: 'Opera' };
  const low = id.toLowerCase();
  for (const [k, v] of Object.entries(known)) if (low.includes(k)) return v;
  return id.split('!')[0].split('_')[0].split('.').filter((p) => !/^(exe|app|inc|microsoft|com)$/i.test(p)).pop() || id;
}

// Apple's search is picky about word order and only searches one country's store at a time,
// so try a few phrasings in your own store first, then the US one, and keep the best match.
function stores() {
  let local = '';
  try {
    local = require('electron').app.getLocaleCountryCode?.() || '';
  } catch {}
  if (!local) local = (Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || '').toUpperCase();
  return [...new Set([local, 'US'].filter((c) => /^[A-Z]{2}$/.test(c)))];
}

async function itunes(term, country) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8&country=${country}`, { signal: ctrl.signal });
    return (await res.json()).results || [];
  } finally {
    clearTimeout(t);
  }
}

async function lookupArt(title, artist) {
  const key = `${artist}|${title}`.toLowerCase();
  if (artCache.has(key)) return artCache.get(key);
  const clean = (s) => s.replace(/\(.*?\)|\[.*?\]|feat\..*$/gi, '').trim();
  const norm = (s) => clean(String(s || '')).toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, '');
  // only trust a hit if it's really this song by this artist
  const matches = (r) => {
    const sameTitle = norm(r.trackName).includes(norm(title)) || norm(title).includes(norm(r.trackName));
    const sameArtist = norm(r.artistName).split(' ').some((w) => w.length > 1 && norm(artist).includes(w));
    return sameTitle && sameArtist && r.artworkUrl100;
  };
  const firstArtist = clean(artist).split(/,|&| x | and /i)[0].trim();
  const terms = [...new Set([`${clean(title)} ${firstArtist}`, clean(title)])];
  let found = null;
  let answered = false; // got at least one real result list (an empty one can mean Apple is throttling us)
  try {
    search: for (const country of stores()) {
      for (const term of terms) {
        const list = await itunes(term, country);
        if (list.length) answered = true;
        const r = list.find(matches);
        if (r) {
          found = { art: r.artworkUrl100.replace(/100x100bb/, '1200x1200bb'), duration: r.trackTimeMillis ? r.trackTimeMillis / 1000 : 0, album: r.collectionName || '' };
          break search;
        }
      }
    }
  } catch {}
  // nothing back at all (offline or throttled): undefined means "ask again later", and isn't remembered
  if (!found && !answered) return undefined;
  artCache.set(key, found);
  return found;
}

// the cover's most striking color, tuned to work as an accent (not too dark, not washed out)
const colorCache = new Map();
async function coverColor(art) {
  const key = art.length > 300 ? `${art.slice(0, 120)}|${art.length}` : art;
  if (colorCache.has(key)) return colorCache.get(key);
  let hex = null;
  try {
    const { nativeImage } = require('electron');
    const img = art.startsWith('data:') ? nativeImage.createFromDataURL(art) : nativeImage.createFromBuffer(Buffer.from(await (await fetch(art)).arrayBuffer()));
    const px = img.resize({ width: 32, height: 32 }).toBitmap(); // BGRA
    const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < px.length; i += 4) {
      const b = px[i] / 255;
      const g = px[i + 1] / 255;
      const r = px[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
      if (s < 0.25 || l < 0.15 || l > 0.85) continue; // skip greys, black, white
      const h = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
      const k = buckets[Math.floor(h * 2) % 12];
      k.w += s;
      k.r += r * s;
      k.g += g * s;
      k.b += b * s;
    }
    const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
    if (best.w > 0) {
      let [r, g, b] = [best.r / best.w, best.g / best.w, best.b / best.w];
      // lift dark colors so they read as an accent on dark themes
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 0.45) [r, g, b] = [r, g, b].map((v) => v + (1 - v) * (0.45 - lum));
      hex = `#${[r, g, b].map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0')).join('')}`;
    }
  } catch {}
  colorCache.set(key, hex);
  if (colorCache.size > 40) colorCache.delete(colorCache.keys().next().value);
  return hex;
}

let colorFor = '';
function emit() {
  // work out the cover color once per cover, then tell everyone again
  if (state.art && state.art !== colorFor) {
    colorFor = state.art;
    const art = state.art;
    coverColor(art).then((hex) => {
      if (state.art !== art) return;
      state = { ...state, color: hex };
      for (const fn of listeners) fn(state);
    });
  } else if (state.art === colorFor && !state.color && colorCache.size) {
    const k = colorFor.length > 300 ? `${colorFor.slice(0, 120)}|${colorFor.length}` : colorFor;
    if (colorCache.get(k)) state = { ...state, color: colorCache.get(k) };
  }
  for (const fn of listeners) fn(state);
  trackPlay();
  updateHistoryArt();
}

let lastRaw = null;
async function onLine(line) {
  if (!line.includes('"thumb"')) lastRaw = line;
  let s;
  try {
    s = JSON.parse(line);
  } catch {
    return;
  }
  // a cover from Windows for some track: remember it, and use it if that track is current
  if (s.thumb) {
    thumbs.set(s.key, s.thumb);
    if (thumbs.size > 30) thumbs.delete(thumbs.keys().next().value);
    if (state.key === s.key && state.artSource !== 'itunes') {
      state = { ...state, art: s.thumb, artSource: 'windows' };
      emit();
    }
    return;
  }
  if (!s.active) {
    state = { active: false, playing: false };
    return emit();
  }
  const key = `${s.app}|${s.title}|${s.artist}`;
  const sameTrack = state.key === key;
  // some players send "Artist - Album - Single" as the artist
  let artist = s.artist || '';
  let album = s.album || '';
  if (!album && /\s[-—]\s/.test(artist)) {
    const parts = artist.split(/\s+[-—]\s+/);
    artist = parts[0];
    album = parts.slice(1).join(' - ').replace(/\s*-\s*(Single|EP)$/i, '');
  }
  const next = {
    ...s,
    key,
    artist,
    appName: prettyApp(s.app),
    art: sameTrack ? state.art : thumbs.get(key) || null,
    artSource: sameTrack ? state.artSource : thumbs.has(key) ? 'windows' : null,
    duration: s.duration > 1 ? s.duration : sameTrack ? state.duration : 0,
    album: album || (sameTrack ? state.album : ''),
    reported: s.duration > 1, // true when the player gives us a real timeline
  };

  // keep a local clock for players without a timeline
  if (clock.key !== key) clock = { key, base: 0, since: Date.now(), playing: s.playing };
  else if (clock.playing !== s.playing) {
    if (!s.playing) clock.base += (Date.now() - clock.since) / 1000;
    clock.since = Date.now();
    clock.playing = s.playing;
  }
  next.clock = { base: clock.base, since: clock.since, playing: clock.playing };

  state = next;
  emit();

  // no cover yet, or only the small one from Windows: (re)ask Apple for the full-size one now and then
  const upgrade = !next.art || next.artSource === 'windows';
  const needsArt = upgrade && s.title && artist && !artCache.has(`${artist}|${s.title}`.toLowerCase()) && Date.now() - (lastLookup.get(key) || 0) > (next.art ? 45000 : 20000);
  if ((!sameTrack || needsArt) && s.title && artist) {
    lastLookup.set(key, Date.now());
    // iTunes only when it's an exact match: sharper art and the real track length
    const info = await lookupArt(s.title, artist);
    if (state.key !== key || !info) return; // undefined = Apple didn't answer; asked again shortly
    state = { ...state, art: info.art || state.art, artSource: info.art ? 'itunes' : state.artSource, duration: state.reported ? state.duration : info.duration, album: state.album || info.album };
    emit();
  }
}

// still no cover for the current song (e.g. offline at startup)? ask again now and then
setInterval(() => {
  if (state.active && !state.art && lastRaw) onLine(lastRaw);
}, 30000).unref?.();

// Linux: ask the active MPRIS player once a second and feed the same lines the Windows helper prints
let linuxTimer = null;
function startLinux() {
  const linux = require('./linux.cjs');
  let last = '';
  let lastArt = '';
  let lastSent = 0;
  const poll = async () => {
    let s;
    try {
      s = await linux.mediaState();
    } catch {
      s = { active: false };
    }
    const { artUrl, ...line } = s;
    // like media.ps1: only speak up when something changed (or every few seconds for the position)
    const sig = JSON.stringify({ ...line, position: Math.round((line.position || 0) / 3), updated: 0 });
    if (sig !== last || Date.now() - lastSent > 5000) {
      last = sig;
      lastSent = Date.now();
      onLine(JSON.stringify(line));
    }
    if (s.active && artUrl && artUrl !== lastArt) {
      lastArt = artUrl;
      const thumb = linux.artFor(artUrl);
      if (thumb) onLine(JSON.stringify({ thumb, key: `${s.app}|${s.title}|${s.artist}` }));
    }
  };
  poll();
  linuxTimer = setInterval(poll, 1000);
}

function start() {
  if (process.platform === 'linux' && !linuxTimer) return startLinux();
  if (process.platform !== 'win32' || child) return;
  child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], { windowsHide: true });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  });
  child.on('exit', () => {
    child = null;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(start, 3000); // the helper died (e.g. sleep/resume): bring it back
  });
}

function stop() {
  clearInterval(linuxTimer);
  linuxTimer = null;
  clearTimeout(restartTimer);
  restartTimer = null;
  if (child) {
    child.removeAllListeners('exit');
    child.stdin.end();
    child.kill();
    child = null;
  }
}

function command(cmd, arg) {
  const allowed = ['toggle', 'play', 'pause', 'next', 'prev', 'shuffle', 'repeat', 'seek'];
  if (!allowed.includes(cmd)) return;
  if (linuxTimer) require('./linux.cjs').mediaCommand(cmd, Number(arg) || 0);
  else if (child) child.stdin.write(cmd === 'seek' ? `seek ${Number(arg) || 0}\n` : `${cmd}\n`);
  else return;
  if (cmd === 'seek') {
    clock.base = Number(arg) || 0;
    clock.since = Date.now();
  }
}

module.exports = {
  start,
  stop,
  command,
  get: () => state,
  onChange: (fn) => listeners.push(fn),
  lookupArt, // exposed for tests
  history: () => history.recent,
  plays: () => history.plays,
  onHistory: (fn) => historyListeners.push(fn),
};

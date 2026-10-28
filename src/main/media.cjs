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
const lastLookup = new Map(); // track key -> when we last asked iTunes // track key -> cover straight from Windows (data URL)

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

async function lookupArt(title, artist) {
  const key = `${artist}|${title}`.toLowerCase();
  if (artCache.has(key)) return artCache.get(key);
  let found = null;
  try {
    const clean = (s) => s.replace(/\(.*?\)|\[.*?\]|feat\..*$/gi, '').trim();
    const term = encodeURIComponent(`${clean(artist)} ${clean(title)}`.trim());
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=1`, { signal: ctrl.signal });
    clearTimeout(t);
    const r = (await res.json()).results?.[0];
    // only trust the hit if it's really this song by this artist
    const norm = (s) => clean(String(s || '')).toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, '');
    const sameTitle = r && (norm(r.trackName).includes(norm(title)) || norm(title).includes(norm(r.trackName)));
    const sameArtist = r && norm(r.artistName).split(' ').some((w) => w.length > 1 && norm(artist).includes(w));
    if (r && sameTitle && sameArtist) found = { art: r.artworkUrl100?.replace(/100x100bb/, '1000x1000bb'), duration: r.trackTimeMillis ? r.trackTimeMillis / 1000 : 0, album: r.collectionName || '' };
  } catch {
    return null; // network not ready yet: try again on a later update
  }
  artCache.set(key, found);
  return found;
}

function emit() {
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

  const needsArt = !next.art && s.title && artist && !artCache.has(`${artist}|${s.title}`.toLowerCase()) && Date.now() - (lastLookup.get(key) || 0) > 20000;
  if ((!sameTrack || needsArt) && s.title && artist) {
    lastLookup.set(key, Date.now());
    // iTunes only when it's an exact match: sharper art and the real track length
    const info = await lookupArt(s.title, artist);
    if (state.key !== key || !info) return;
    state = { ...state, art: info.art || state.art, artSource: info.art ? 'itunes' : state.artSource, duration: state.reported ? state.duration : info.duration, album: state.album || info.album };
    emit();
  }
}

// still no cover for the current song (e.g. offline at startup)? ask again now and then
setInterval(() => {
  if (state.active && !state.art && lastRaw) onLine(lastRaw);
}, 30000).unref?.();

function start() {
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
  if (!child) return;
  const allowed = ['toggle', 'play', 'pause', 'next', 'prev', 'shuffle', 'repeat', 'seek'];
  if (!allowed.includes(cmd)) return;
  child.stdin.write(cmd === 'seek' ? `seek ${Number(arg) || 0}\n` : `${cmd}\n`);
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
  history: () => history.recent,
  plays: () => history.plays,
  onHistory: (fn) => historyListeners.push(fn),
};

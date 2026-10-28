// "Wrapped" for the last 7 days: top songs, commits, active time and most-used apps,
// all from data this PC already keeps. Share saves the card as a PNG.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, clipboard, shell } = require('electron');
const config = require('../shared/config.cjs');
const brand = require('../shared/brand.cjs');
const git = require('./git.cjs');
const media = require('./media.cjs');
const activity = require('./activity.cjs');

async function appIcon(name) {
  const exe = activity.exeFor(name);
  if (!exe || !fs.existsSync(exe)) return null;
  try {
    return (await app.getFileIcon(exe, { size: 'normal' })).toDataURL();
  } catch {
    return null;
  }
}

async function data() {
  const cfg = config.load();
  const since = Date.now() - 7 * 864e5;
  const days = activity.lastDays(7);

  // songs: most plays this week, covers from the recent list when we have them
  const counts = new Map();
  for (const p of media.plays().filter((x) => x.at > since)) {
    const k = `${p.title}|${p.artist}`;
    counts.set(k, { title: p.title, artist: p.artist, plays: (counts.get(k)?.plays || 0) + 1 });
  }
  const covers = new Map(media.history().map((h) => [`${h.title}|${h.artist}`, h.art]));
  const songs = [...counts.values()].sort((a, b) => b.plays - a.plays).slice(0, 5).map((s) => ({ ...s, art: covers.get(`${s.title}|${s.artist}`) || null }));
  const totalPlays = [...counts.values()].reduce((n, s) => n + s.plays, 0);

  // commits per day from the same source as the contribution graph
  let g = null;
  try {
    g = await git.get(cfg);
  } catch {}
  const commitDays = days.map((d) => g?.days?.[d.day] || 0);
  const repoCounts = {};
  for (const c of g?.recent || []) if (c.time > since) repoCounts[c.repo] = (repoCounts[c.repo] || 0) + 1;
  const topRepo = Object.entries(repoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // apps: minutes in front across the week
  const appMin = {};
  for (const d of days) for (const [n, m] of Object.entries(d.apps)) appMin[n] = (appMin[n] || 0) + m;
  const apps = await Promise.all(
    Object.entries(appMin)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(async ([name, minutes]) => ({ name, minutes, icon: await appIcon(name) })),
  );
  const longest = days.reduce((best, d) => ((d.longest || 0) > (best.minutes || 0) ? { minutes: d.longest, app: d.longestApp, day: d.day } : best), {});

  return {
    name: cfg.name || os.userInfo().username,
    from: days[0].day,
    to: days[6].day,
    songs,
    totalPlays,
    commits: commitDays.reduce((a, b) => a + b, 0),
    commitDays,
    topRepo,
    activeDays: days.map((d) => d.active),
    activeMinutes: days.reduce((n, d) => n + d.active, 0),
    longest,
    apps,
  };
}

// the card is the popup page itself: capture it and save it where people find it
async function save(win, rect) {
  const r = rect && { x: Math.floor(rect.x), y: Math.floor(rect.y), width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  const img = await win.webContents.capturePage(r || undefined);
  const dir = path.join(app.getPath('pictures'), brand.name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `Wrapped ${activity.dayKey()}.png`);
  fs.writeFileSync(file, img.toPNG());
  clipboard.writeImage(img);
  shell.showItemInFolder(file);
  return file;
}

module.exports = { data, save };

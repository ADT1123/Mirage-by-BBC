// Screen-time diary for Wrapped: once a minute, which app is in front and whether you're
// actually there (keyboard or mouse used in the last two minutes). Stays on this PC.

const fs = require('fs');
const path = require('path');
const config = require('../shared/config.cjs');
const native = require('./native.cjs');

const FILE = path.join(config.DIR, 'activity.json');
const KEEP_DAYS = 35;
const NAMES = {
  code: 'VS Code', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', brave: 'Brave', comet: 'Comet', opera: 'Opera',
  spotify: 'Spotify', explorer: 'File Explorer', windowsterminal: 'Terminal', wt: 'Terminal', powershell: 'PowerShell',
  cmd: 'Command Prompt', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', outlook: 'Outlook', teams: 'Teams',
  'ms-teams': 'Teams', slack: 'Slack', discord: 'Discord', whatsapp: 'WhatsApp', figma: 'Figma', notion: 'Notion',
  obsidian: 'Obsidian', cursor: 'Cursor', idea64: 'IntelliJ IDEA', devenv: 'Visual Studio', photoshop: 'Photoshop', vlc: 'VLC',
};

let data = { days: {}, exes: {} };
let streak = { app: '', minutes: 0 };

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function load() {
  try {
    data = { days: {}, exes: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {}
}

function save() {
  const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 864e5));
  for (const k of Object.keys(data.days)) if (k < cutoff) delete data.days[k];
  try {
    fs.mkdirSync(config.DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch {}
}

function appName(exe) {
  const base = path.basename(exe, path.extname(exe));
  const low = base.toLowerCase();
  return NAMES[low] || base.charAt(0).toUpperCase() + base.slice(1);
}

function sample() {
  let fg;
  try {
    if (native.idleSeconds() > 120) return (streak = { app: '', minutes: 0 });
    fg = native.foregroundApp();
  } catch {
    return;
  }
  if (!fg) return;
  const day = (data.days[dayKey()] ||= { active: 0, apps: {}, longest: 0 });
  day.active += 1;
  // the bare desktop and this app itself don't count as "using an app"
  const self = /electron(\.exe)?$/i.test(fg.exe) || fg.exe === process.execPath;
  if (!['Progman', 'WorkerW'].includes(fg.cls) && !self) {
    const name = appName(fg.exe);
    day.apps[name] = (day.apps[name] || 0) + 1;
    data.exes[name] = fg.exe;
    streak = streak.app === name ? { app: name, minutes: streak.minutes + 1 } : { app: name, minutes: 1 };
    if (streak.minutes > (day.longest || 0)) {
      day.longest = streak.minutes;
      day.longestApp = name;
    }
  }
  save();
}

function start() {
  if (process.platform !== 'win32') return;
  load();
  setInterval(sample, 60 * 1000).unref?.();
}

// the last `n` days, oldest first
function lastDays(n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const k = dayKey(new Date(Date.now() - (n - 1 - i) * 864e5));
    return { day: k, ...(data.days[k] || { active: 0, apps: {}, longest: 0 }) };
  });
}

module.exports = { start, lastDays, exeFor: (name) => data.exes[name], dayKey };

// Reminders the Assistant sets ("remind me to call mom at 7"): saved to disk, shown as a
// system notification when they're due, even after a restart.

const fs = require('fs');
const path = require('path');
const config = require('../shared/config.cjs');

const FILE = path.join(config.DIR, 'reminders.json');
let list = [];
try {
  list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {}

function save() {
  list = list.filter((r) => !r.done || Date.now() - r.at < 864e5).slice(-100); // keep a day of history
  try {
    fs.mkdirSync(config.DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list));
  } catch {}
}

// "2026-10-29 19:00" in local time -> a reminder, or null if the time doesn't make sense
function add(text, when) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/.exec(String(when || ''));
  if (!m || !String(text || '').trim()) return null;
  const at = new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00`).getTime();
  if (!Number.isFinite(at) || at < Date.now() - 60000) return null;
  const r = { id: Math.random().toString(36).slice(2, 8), text: String(text).trim(), at, done: false };
  list.push(r);
  save();
  return r;
}

const upcoming = () => list.filter((r) => !r.done).sort((a, b) => a.at - b.at);

function start(fire) {
  setInterval(() => {
    let changed = false;
    for (const r of list) {
      if (!r.done && r.at <= Date.now()) {
        r.done = true;
        changed = true;
        fire(r);
      }
    }
    if (changed) save();
  }, 15000).unref?.();
}

module.exports = { add, upcoming, start };

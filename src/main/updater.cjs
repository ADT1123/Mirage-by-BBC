// Updates for people who cloned the repo: every few minutes we ask git whether the GitHub
// branch has new commits. If so, the wallpaper shows "Update available"; one click pulls,
// reinstalls dependencies when they changed, and restarts.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EVERY = 5 * 60 * 1000; // a git fetch is tiny; new versions show up within 5 minutes

// What users see comes from release.json (version, title, a few notes), never from commit
// messages. A push that leaves release.json alone shows the generic line below.
const GENERIC = { version: '', title: 'Bug fixes and improvements', notes: [] };

let status = { available: false, behind: 0, release: GENERIC, checked: 0, error: null };
let listeners = [];
let busy = false;

function git(args, timeout = 60000) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, windowsHide: true, timeout }, (err, out, errOut) => resolve({ ok: !err, out: String(out || '').trim(), err: String(errOut || err?.message || '').trim() }));
  });
}

function npmInstall() {
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, windowsHide: true, shell: true, timeout: 10 * 60 * 1000 }, (err) => resolve(!err));
  });
}

const isRepo = () => fs.existsSync(path.join(ROOT, '.git'));

async function releaseAt(ref) {
  const r = await git(['show', `${ref}:release.json`]);
  try {
    return r.ok ? JSON.parse(r.out) : null;
  } catch {
    return null;
  }
}

// the incoming release.json, if the push changed it
async function incoming() {
  const [next, cur] = await Promise.all([releaseAt('@{u}'), releaseAt('HEAD')]);
  if (!next?.title || JSON.stringify(next) === JSON.stringify(cur)) return GENERIC;
  return { version: String(next.version || ''), title: String(next.title), notes: Array.isArray(next.notes) ? next.notes.map(String).slice(0, 6) : [] };
}

async function check() {
  if (!isRepo()) return (status = { ...status, error: 'not-a-clone', checked: Date.now() });
  const fetched = await git(['fetch', '--quiet']);
  if (!fetched.ok) return (status = { ...status, error: 'offline', checked: Date.now() });
  const behind = Number((await git(['rev-list', '--count', 'HEAD..@{u}'])).out) || 0;
  const release = behind ? await incoming() : GENERIC;
  const was = status.behind;
  status = { available: behind > 0, behind, release, checked: Date.now(), error: null };
  if (behind > was) for (const fn of listeners) fn(status); // every new push, not just the first
  return status;
}

// pull, reinstall if package files changed, then the caller restarts the app
async function apply() {
  if (busy) return { ok: false, reason: 'An update is already running' };
  busy = true;
  try {
    if (!isRepo()) return { ok: false, reason: 'This copy was not cloned with git, so it cannot update itself' };
    // npm install often rewrites package-lock.json; that alone shouldn't block an update
    const files = (await git(['diff', '--name-only', 'HEAD'])).out.split('\n').filter(Boolean);
    if (files.includes('package-lock.json')) await git(['checkout', 'HEAD', '--', 'package-lock.json']);
    if (files.some((f) => f !== 'package-lock.json')) return { ok: false, reason: 'You have changed files in this folder. Commit or undo them first, then update' };
    const before = (await git(['rev-parse', 'HEAD'])).out;
    const pulled = await git(['pull', '--ff-only', '--quiet'], 120000);
    if (!pulled.ok) return { ok: false, reason: 'Could not download the update. Check your internet connection' };
    const after = (await git(['rev-parse', 'HEAD'])).out;
    const changed = (await git(['diff', '--name-only', before, after])).out.split('\n');
    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json') && !(await npmInstall())) {
      return { ok: false, reason: 'Downloaded, but installing new parts failed. Run npm install' };
    }
    status = { available: false, behind: 0, release: GENERIC, checked: Date.now(), error: null };
    return { ok: true, from: before.slice(0, 7), to: after.slice(0, 7) };
  } finally {
    busy = false;
  }
}

function start() {
  setTimeout(check, 45 * 1000); // shortly after startup, then every 5 minutes
  setInterval(check, EVERY).unref?.();
  // a laptop that slept through a push hears about it as soon as it wakes
  require('electron').powerMonitor.on('resume', () => setTimeout(check, 15 * 1000));
}

module.exports = { start, check, apply, status: () => status, onAvailable: (fn) => listeners.push(fn) };

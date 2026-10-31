// Updates for people who cloned the repo: every few minutes we ask git whether the GitHub
// branch has new commits. If so, the wallpaper shows "Update available"; one click pulls,
// reinstalls dependencies when they changed, and restarts.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EVERY = 5 * 60 * 1000; // a git fetch is tiny; new versions show up within 5 minutes

// What people see is written for them in release.json, never taken from commit messages.
// If a push forgets to add a release entry, we still show a plain English headline worked
// out from WHICH FILES changed (never their commit text) - see headline() below.
const GENERIC = { version: '', title: 'Bug fixes and improvements', notes: [] };

let status = { available: false, behind: 0, release: GENERIC, changes: [], history: [], checked: 0, error: null };
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

// one release entry, cleaned up: anything the file gets wrong can't break the popup
const entry = (r) =>
  r && typeof r === 'object' && r.title
    ? {
        version: String(r.version || ''),
        date: String(r.date || ''),
        title: String(r.title).slice(0, 90),
        notes: (Array.isArray(r.notes) ? r.notes : []).map((n) => String(n).slice(0, 120)).slice(0, 8),
      }
    : null;

// release.json is a list, newest first. The older one-release shape still works.
async function releasesAt(ref) {
  const r = await git(['show', `${ref}:release.json`]);
  if (!r.ok) return [];
  try {
    const j = JSON.parse(r.out);
    return (Array.isArray(j) ? j : Array.isArray(j.releases) ? j.releases : [j]).map(entry).filter(Boolean);
  } catch {
    return [];
  }
}

// No release entry in the push? Say something true and readable about it, worked out from the
// paths of the changed files. Commit messages are never shown to anyone.
const AREAS = [
  [/^src\/renderer\/js\/gl\//, 'Wallpaper improvements'],
  [/^src\/shared\/packs\.cjs$/, 'New wallpapers'],
  [/^src\/renderer\/js\/(widgets|widgetform|editor)\.js$/, 'Widget improvements'],
  [/^src\/renderer\/styles\//, 'Design touch-ups'],
  [/^(docs|README)/, 'Updated help and setup guides'],
  [/^cli\//, 'Improvements to the bro command'],
];
function headline(files) {
  const hits = AREAS.filter(([re]) => files.some((f) => re.test(f))).map(([, label]) => label);
  if (!hits.length) return GENERIC.title;
  return hits.length === 1 ? hits[0] : `${hits[0]} and more`;
}

// 1.10.0 is newer than 1.9.0, so compare the numbers rather than the text
function newer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// which version this copy is on: its own newest release entry, else its package.json
async function installed(cur) {
  if (cur[0]?.version) return cur[0].version;
  const pkg = await git(['show', 'HEAD:package.json']);
  try {
    return pkg.ok ? JSON.parse(pkg.out).version || '' : '';
  } catch {
    return '';
  }
}

// what this update actually brings: the releases that come after the one you are on
async function incoming() {
  const [next, cur] = await Promise.all([releasesAt('@{u}'), releasesAt('HEAD')]);
  const at = await installed(cur);
  const have = new Set(cur.map((r) => r.version));
  const fresh = next.filter((r) => (at ? newer(r.version, at) : !have.has(r.version)));
  if (fresh.length) return { release: fresh[0], changes: fresh.slice(0, 5), history: next.slice(0, 20) };
  const files = (await git(['diff', '--name-only', 'HEAD..@{u}'])).out.split('\n').filter(Boolean);
  return { release: { ...GENERIC, title: headline(files) }, changes: [], history: next.slice(0, 20) };
}

async function check() {
  if (!isRepo()) return (status = { ...status, error: 'not-a-clone', checked: Date.now() });
  const fetched = await git(['fetch', '--quiet']);
  if (!fetched.ok) return (status = { ...status, error: 'offline', checked: Date.now() });
  const behind = Number((await git(['rev-list', '--count', 'HEAD..@{u}'])).out) || 0;
  const info = behind ? await incoming() : { release: GENERIC, changes: [], history: await releasesAt('HEAD') };
  const was = status.behind;
  status = { available: behind > 0, behind, ...info, checked: Date.now(), error: null };
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
    status = { available: false, behind: 0, release: GENERIC, changes: [], history: await releasesAt('HEAD'), checked: Date.now(), error: null };
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

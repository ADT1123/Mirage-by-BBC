// Builds the contribution calendar. Your public GitHub calendar is the source of truth
// (it matches your profile); local `git log` fills in when offline or without GitHub,
// and always powers the recent-commits feed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const github = require('./github.cjs');

const SKIP = new Set(['node_modules', 'AppData', 'Library', '.cache', 'vendor', 'dist', 'build', 'target', '$Recycle.Bin']);
const TTL = 10 * 60 * 1000;
const MAX_REPOS = 80;

let cache = null;
let pending = null;
let lastRepos = [];

function run(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, out) => resolve(err ? '' : out));
  });
}

function defaultRoots() {
  const h = os.homedir();
  return [
    'Desktop', 'Documents', 'OneDrive/Desktop', 'OneDrive/Documents', 'code', 'Code', 'projects',
    'Projects', 'dev', 'src', 'repos', 'source/repos', 'GitHub', 'Documents/GitHub', 'workspace',
  ].map((p) => path.join(h, p));
}

function findRepos(root, depth, out) {
  if (out.length >= MAX_REPOS || depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.some((e) => e.name === '.git')) {
    out.push(root);
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
    findRepos(path.join(root, e.name), depth - 1, out);
    if (out.length >= MAX_REPOS) return;
  }
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function collect(cfg) {
  const roots = cfg.repos?.roots?.length ? cfg.repos.roots : defaultRoots();
  const repos = [];
  for (const r of [...(cfg.repos?.extra || [])]) if (fs.existsSync(path.join(r, '.git'))) repos.push(r);
  for (const r of roots) findRepos(r, 3, repos);
  const unique = [...new Set(repos.map((r) => path.resolve(r)))];
  lastRepos = unique;

  const email = (await run(['config', '--global', 'user.email'])).trim();
  const authorArgs = email ? [`--author=${email}`] : [];

  const days = {};
  const recent = [];
  const seen = new Set();

  const queue = [...unique];
  async function worker() {
    while (queue.length) {
      const repo = queue.shift();
      const out = await run(['log', '--all', '--since=1.year', '--no-merges', ...authorArgs, '--format=%h%x1f%ct%x1f%s'], repo);
      const name = path.basename(repo);
      for (const line of out.split('\n')) {
        const [hash, ts, subject] = line.split('\x1f');
        if (!hash || seen.has(hash)) continue;
        seen.add(hash);
        const t = Number(ts) * 1000;
        const k = dayKey(new Date(t));
        days[k] = (days[k] || 0) + 1;
        recent.push({ repo: name, path: repo, hash, time: t, message: subject || '' });
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  recent.sort((a, b) => b.time - a.time);
  const base = {
    ok: true,
    email,
    repoCount: unique.length,
    recent: recent.slice(0, 12),
    updated: Date.now(),
  };
  const gh = await github.contributions(cfg, unique);
  if (gh) return { ...base, source: 'github', user: gh.user, total: gh.total, days: gh.days, levels: gh.levels };
  return { ...base, source: 'local', total: seen.size, days };
}

async function get(cfg, force = false) {
  if (!force && cache && Date.now() - cache.updated < TTL) return cache;
  if (!pending) {
    pending = collect(cfg)
      .then((r) => (cache = r))
      .catch((e) => ({ ok: false, error: String(e), days: {}, recent: [], total: 0, repoCount: 0 }))
      .finally(() => (pending = null));
  }
  return pending;
}

module.exports = { get, dayKey, repoPaths: () => lastRepos };

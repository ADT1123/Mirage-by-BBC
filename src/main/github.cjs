// Your real GitHub contribution calendar: the same public data your profile page shows
// (https://github.com/users/<name>/contributions), so no token is needed. Private
// contributions are included if you've enabled "Private contributions" on your profile.

const { execFile } = require('child_process');

const TTL = 30 * 60 * 1000;
let cache = null;
let detected = undefined;

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, windowsHide: true, timeout: 8000 }, (err, out) => resolve(err ? '' : String(out).trim()));
  });
}

// Username: config first, then the GitHub CLI if you're logged in, then the most common
// owner among your local repos' GitHub remotes.
async function username(cfg, repos = []) {
  if (cfg.github === false || cfg.github === 'off') return null;
  if (typeof cfg.github === 'string' && cfg.github) return cfg.github;
  if (detected !== undefined) return detected;
  const fromGh = await run('gh', ['api', 'user', '--jq', '.login']);
  if (/^[\w-]+$/.test(fromGh)) return (detected = fromGh);
  const owners = {};
  for (const repo of repos.slice(0, 40)) {
    const url = await run('git', ['remote', 'get-url', 'origin'], repo);
    const m = /github\.com[:/]([\w-]+)\//i.exec(url);
    if (m) owners[m[1]] = (owners[m[1]] || 0) + 1;
  }
  const best = Object.entries(owners).sort((a, b) => b[1] - a[1])[0];
  return (detected = best ? best[0] : null);
}

function parse(html) {
  const counts = {};
  for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = /^(\d[\d,]*) contribution/.exec(m[2].trim());
    counts[m[1]] = n ? Number(n[1].replace(/,/g, '')) : 0;
  }
  const days = {};
  const levels = {};
  for (const m of html.matchAll(/<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g)) {
    const tag = m[0];
    const id = /id="([^"]+)"/.exec(tag)?.[1];
    const level = Number(/data-level="(\d)"/.exec(tag)?.[1] || 0);
    days[m[1]] = counts[id] ?? (level ? 1 : 0);
    levels[m[1]] = level;
  }
  const headline = /([\d,]+)\s+contributions?\s+in the last year/.exec(html);
  const total = headline ? Number(headline[1].replace(/,/g, '')) : Object.values(days).reduce((a, b) => a + b, 0);
  return { days, levels, total };
}

async function contributions(cfg, repos) {
  const user = await username(cfg, repos);
  if (!user) return null;
  if (cache && cache.user === user && Date.now() - cache.at < TTL) return cache.data;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`https://github.com/users/${encodeURIComponent(user)}/contributions`, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (desktop wallpaper)' },
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = { user, ...parse(await res.text()) };
    if (!Object.keys(data.days).length) throw new Error('empty calendar');
    cache = { user, at: Date.now(), data };
    return data;
  } catch {
    return cache?.user === user ? cache.data : null;
  }
}

module.exports = { contributions, username };

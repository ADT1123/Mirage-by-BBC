// Sample git/system data for `?demo` previews (screenshots on a machine with no repos).
// Weather, quotes, verses and art stay live even in demo mode.

import { dayKey } from './widgets.js';

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function demoStore() {
  const r = seeded(42);
  const days = {};
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const busy = Math.sin(i / 23) * 0.5 + 0.5;
    if (i < 12 || r() < (weekend ? 0.3 : 0.72) * (0.5 + busy * 0.6)) days[dayKey(d)] = 1 + Math.floor(r() * (weekend ? 4 : 11) * busy + r() * 3);
  }
  const msgs = [
    ['my-app', 'feat: glass widgets with live blur'],
    ['my-app', 'fix: clock drifting after sleep'],
    ['reel-kit', 'chore: export 9:16 at 60fps'],
    ['dotfiles', 'tweak: terminal font ligatures'],
    ['my-app', 'feat: weather sky follows the sun'],
  ];
  const now = Date.now();
  return {
    git: {
      ok: true,
      repoCount: 14,
      days,
      recent: msgs.map(([repo, message], i) => ({ repo, message, hash: Math.floor(r() * 0xfffffff).toString(16).padStart(7, '0'), time: now - (i * 3 + 1) * 3600 * 1000 * (1 + i) })),
      updated: now,
    },
    system: { cpu: 0.34, mem: 0.58 },
    battery: { level: 0.82, charging: false },
  };
}

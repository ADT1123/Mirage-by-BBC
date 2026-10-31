// Forgiving lookups: "koi pond", "Koi-Pond" and "koipond" all find the same wallpaper,
// and a typo gets a "did you mean" instead of a dead end.

// lowercase, no accents ("Rosé" → "rose"), no spaces or punctuation
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, '');

// edit distance, small strings only
export function distance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const near = (q, k) => distance(q, k) <= Math.max(1, Math.floor(Math.max(q.length, k.length) / 4));

// entries: [{ item, keys: [...names it answers to] }]
// → { hit } one clear match · { many } several equally good · { near } nothing, but close ones
export function lookup(query, entries) {
  const q = norm(query);
  if (!q) return { near: [] };
  const withKeys = entries.map((e) => ({ ...e, n: e.keys.map(norm).filter(Boolean) }));
  const tiers = [(k) => k === q, (k) => k.startsWith(q), (k) => q.length >= 3 && k.includes(q)];
  for (const test of tiers) {
    const found = withKeys.filter((e) => e.n.some(test)).map((e) => e.item);
    if (found.length === 1) return { hit: found[0] };
    if (found.length > 1) return { many: found };
  }
  const scored = withKeys
    .map((e) => ({ item: e.item, d: Math.min(...e.n.map((k) => distance(q, k))), close: e.n.some((k) => near(q, k)) }))
    .filter((s) => s.close)
    .sort((a, b) => a.d - b.d);
  return { near: scored.slice(0, 3).map((s) => s.item) };
}

// the closest few strings to a typo (for unknown commands)
export function closest(query, words, max = 3) {
  const q = norm(query);
  return words
    .map((w) => ({ w, d: norm(w).startsWith(q) && q.length > 1 ? 0 : distance(q, norm(w)) }))
    .filter((s) => s.d <= Math.max(2, Math.floor(q.length / 3)))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((s) => s.w);
}

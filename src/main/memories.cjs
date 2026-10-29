// "On This Day": photos from today's date in past years, found in your own Pictures folders.
// Dates come from the camera's EXIF "taken" time, then names like IMG_20231029_…, then the
// file's own date. Everything stays on this computer; the index is rebuilt once a day.

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const ROOTS = ['Pictures', 'OneDrive/Pictures', 'OneDrive/Photos', 'Photos', 'Desktop', 'Downloads', 'DCIM'].map((d) => path.join(HOME, d));
const IMAGE = /\.(jpe?g|png|heic|webp)$/i;
const SKIP = new Set(['node_modules', '.git', 'AppData', 'Screenshots', '.thumbnails', 'Thumbs']);
const MAX = 40000;

let index = null; // { day: 'YYYY-MM-DD', byMonthDay: Map('MM-DD' -> [{ file, year }]) }

// EXIF DateTimeOriginal (or DateTime) from the first 128 KB of a JPEG, no library needed
function exifDate(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(131072);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, n).toString('latin1');
    const m = /(\d{4}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}/.exec(text);
    if (m && Number(m[1]) > 1990) return { y: Number(m[1]), md: `${m[2]}-${m[3]}` };
  } catch {
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return null;
}

function nameDate(name) {
  const m = /(?:^|[^\d])(20\d{2}|19\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[^\d]|$)/.exec(name);
  return m ? { y: Number(m[1]), md: `${m[2]}-${m[3]}` } : null;
}

function dateOf(file, stat) {
  const d = (/\.jpe?g$/i.test(file) && exifDate(file)) || nameDate(path.basename(file));
  if (d) return d;
  const t = new Date(Math.min(stat.mtimeMs, stat.birthtimeMs || stat.mtimeMs));
  return { y: t.getFullYear(), md: `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` };
}

async function walk(dir, depth, out) {
  if (depth < 0 || out.length >= MAX) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX) return;
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, depth - 1, out);
    else if (IMAGE.test(e.name)) out.push(p);
  }
}

const today = () => {
  const d = new Date();
  return { day: d.toDateString(), y: d.getFullYear(), md: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
};

let building = null;
async function build() {
  const files = [];
  for (const r of [...new Set(ROOTS)]) if (fs.existsSync(r)) await walk(r, 6, files);
  const byMonthDay = new Map();
  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (stat.size < 30 * 1024) continue; // icons and tiny images aren't memories
    const d = dateOf(file, stat);
    if (!byMonthDay.has(d.md)) byMonthDay.set(d.md, []);
    byMonthDay.get(d.md).push({ file, year: d.y });
    if (byMonthDay.size % 50 === 0) await new Promise((r) => setImmediate(r)); // stay responsive
  }
  index = { day: today().day, byMonthDay };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const yearsAgo = (n) => (n === 1 ? '1 year ago' : `${n} years ago`);

// -> { kind: 'day' | 'week' | 'library' | 'none', photos: [{ file, label }] }
// Today in past years first; else this week in past years; else older photos from your library.
async function get() {
  const t = today();
  if (!index || index.day !== t.day) {
    building ||= build().finally(() => (building = null));
    await building;
  }
  const past = (md) => (index.byMonthDay.get(md) || []).filter((p) => p.year < t.y);
  let photos = past(t.md).map((p) => ({ file: p.file, year: p.year, label: `On this day · ${yearsAgo(t.y - p.year)}` }));
  let kind = 'day';
  if (!photos.length) {
    kind = 'week';
    const now = new Date();
    for (let d = -3; d <= 3; d++) {
      if (!d) continue;
      const x = new Date(now.getTime() + d * 864e5);
      const md = `${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      photos.push(...past(md).map((p) => ({ file: p.file, year: p.year, label: `This week · ${yearsAgo(t.y - p.year)}` })));
    }
  }
  if (!photos.length) {
    kind = 'library';
    const older = [];
    for (const [md, list] of index.byMonthDay) for (const p of list) if (p.year < t.y || md < t.md) older.push({ file: p.file, year: p.year, label: `${MONTHS[Number(md.slice(0, 2)) - 1]} ${p.year}` });
    // a stable daily shuffle, so the same few photos rotate through the day
    let seed = [...t.day].reduce((a, c) => a + c.charCodeAt(0), 0);
    photos = older.sort(() => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5).slice(0, 30);
  }
  if (!photos.length) kind = 'none';
  // the same picture often sits in several folders: show it once
  const seen = new Set();
  photos = photos.filter((p) => {
    const k = `${path.basename(p.file).toLowerCase()}|${p.year}`;
    return !seen.has(k) && seen.add(k);
  });
  return { kind, photos: photos.sort((a, b) => b.year - a.year).slice(0, 60) };
}

module.exports = { get };

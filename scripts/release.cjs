// Writes the next release entry, so every update people get has a title you wrote:
//   npm run release -- "New Liquid wallpapers and a calmer desktop" "Koi Pond" "Wallpaper blur"
// The first argument is the headline shown in the update pill and notification; the rest are
// the bullet points. It bumps the version in package.json to match and prepends the entry to
// release.json. Commit and push both files and that is what everyone sees.
//
// Keep it on one line. To split it over several, the line-continuation character is a backtick
// in PowerShell and a backslash in bash - using the wrong one writes it into your notes.
//
//   --patch / --minor / --major   which number to bump (default: minor)
//   --version 1.4.0               set the version yourself
//   --list                        show the releases so far and stop

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RELEASES = path.join(ROOT, 'release.json');
const PKG = path.join(ROOT, 'package.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const valueOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const words = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--version');

const read = () => {
  const j = JSON.parse(fs.readFileSync(RELEASES, 'utf8'));
  return Array.isArray(j) ? j : j.releases || [j];
};

const releases = fs.existsSync(RELEASES) ? read() : [];

if (flag('list')) {
  for (const r of releases) console.log(`${(r.version || '?').padEnd(8)} ${r.date || ''}  ${r.title}`);
  process.exit(0);
}

const [title, ...rest] = words;
// a stray \ or ` is a line-continuation the shell didn't eat, not something to publish
const junk = rest.filter((n) => /^[\\`]*$/.test(n.trim()));
const notes = rest.filter((n) => !junk.includes(n));
if (junk.length) {
  console.log(`Ignored ${junk.length} empty note${junk.length === 1 ? '' : 's'}: your shell passed a line-continuation character through.`);
  console.log('Keep the command on one line, or continue lines with ` in PowerShell and \\ in bash.\n');
}
if (!title) {
  console.log('Usage: npm run release -- "Headline people will read" "note" "note" ...');
  console.log('       npm run release -- --list');
  process.exit(1);
}
if (title.length > 70) {
  console.log(`The headline is ${title.length} characters. Keep it under 70 so it fits the update notice.`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const current = releases[0]?.version || pkg.version || '0.0.0';
const [maj, min, pat] = current.split('.').map((n) => Number(n) || 0);
const next =
  valueOf('version') || (flag('major') ? `${maj + 1}.0.0` : flag('patch') ? `${maj}.${min}.${pat + 1}` : `${maj}.${min + 1}.0`);

if (releases.some((r) => r.version === next)) {
  console.log(`Version ${next} is already in release.json. Pass --version to pick another one.`);
  process.exit(1);
}

const added = { version: next, date: new Date().toISOString().slice(0, 10), title, notes };
fs.writeFileSync(RELEASES, JSON.stringify({ releases: [added, ...releases] }, null, 2) + '\n');
pkg.version = next;
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');

console.log(`${pkg.name} ${next}  ${title}`);
for (const n of notes) console.log(`  - ${n}`);
console.log('\nWritten to release.json and package.json. Commit and push them with your changes.');

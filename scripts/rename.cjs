// Renames the whole project in one go:
//   npm run rename -- "Nova Wall" nova
// Updates brand.json (display name, CLI command, folder slug) and package.json (name + bin),
// and carries your existing settings over to the new settings folder.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const [name, commandArg] = process.argv.slice(2);
if (!name) {
  console.log('Usage: npm run rename -- "New Name" [command]');
  process.exit(1);
}

const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wallpaper';
const command = (commandArg || slug.split('-')[0]).toLowerCase().replace(/[^a-z0-9-]/g, '');

const brandFile = path.join(ROOT, 'brand.json');
const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
const oldSlug = brand.slug;
const oldCommand = brand.command;
Object.assign(brand, { name, command, slug });
fs.writeFileSync(brandFile, JSON.stringify(brand, null, 2) + '\n');

const pkgFile = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.name = slug;
pkg.bin = { [command]: 'cli/main.mjs' };
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

// keep your themes, notes and layout
const from = path.join(os.homedir(), `.${oldSlug}`);
const to = path.join(os.homedir(), `.${slug}`);
if (oldSlug !== slug && fs.existsSync(from) && !fs.existsSync(to)) fs.cpSync(from, to, { recursive: true });

console.log(`Renamed to "${name}"`);
console.log(`  command   ${command}   (run \`npm link\` again so your terminal knows it)`);
console.log(`  settings  ${to}`);
if (oldCommand && oldCommand !== command) console.log(`  tip       \`npm unlink -g ${pkg.name === slug ? oldSlug : pkg.name}\` removes the old \`${oldCommand}\` command`);

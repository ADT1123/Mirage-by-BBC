// A plain Electron install calls itself "Electron" everywhere the system names a running
// program. This gives it Mirage's name instead, and the CLI launches what it returns.
//
//   Windows: Task Manager, the volume mixer and "Startup apps" read the icon and description
//     stored inside the .exe, so we copy electron.exe to Mirage.exe (same runtime, same folder)
//     and write Mirage's logo and name into the copy's resources. Rebuilt only when Electron or
//     the logo changes.
//   Linux: the name comes from the file that was run, so a hard link called Mirage is enough.
//
// Anything that fails falls back to Electron's own binary, which always works.

const fs = require('fs');
const path = require('path');
const brand = require('../shared/brand.cjs');

const ROOT = path.join(__dirname, '..', '..');
const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const RT_VERSION = 16;

// ---------------------------------------------------------------- reading the resource table

// { type: [{ name (number|string), lang, rva, size }] } from the exe's .rsrc section
function resources(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const read = (pos, len) => {
      const b = Buffer.alloc(len);
      fs.readSync(fd, b, 0, len, pos);
      return b;
    };
    const head = read(0, 4096);
    const pe = head.readUInt32LE(0x3c);
    if (head.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('not a PE file');
    const sections = head.readUInt16LE(pe + 6);
    const optSize = head.readUInt16LE(pe + 20);
    const opt = pe + 24;
    const dirs = opt + (head.readUInt16LE(opt) === 0x20b ? 112 : 96);
    const rsrcRva = head.readUInt32LE(dirs + 2 * 8);
    let base = -1;
    let rsrcSize = 0;
    for (let i = 0; i < sections; i++) {
      const s = opt + optSize + i * 40;
      const va = head.readUInt32LE(s + 12);
      const raw = head.readUInt32LE(s + 20);
      const len = head.readUInt32LE(s + 16);
      if (rsrcRva >= va && rsrcRva < va + len) {
        base = raw + (rsrcRva - va);
        rsrcSize = len - (rsrcRva - va);
      }
    }
    if (base < 0) throw new Error('no resources');
    const r = read(base, rsrcSize);
    const entries = (off) => {
      const n = r.readUInt16LE(off + 12) + r.readUInt16LE(off + 14);
      return Array.from({ length: n }, (_, i) => {
        const name = r.readUInt32LE(off + 16 + i * 8);
        const data = r.readUInt32LE(off + 20 + i * 8);
        const id = name & 0x80000000 ? r.toString('utf16le', (name & 0x7fffffff) + 2, (name & 0x7fffffff) + 2 + r.readUInt16LE(name & 0x7fffffff) * 2) : name;
        return { id, sub: data & 0x80000000 ? data & 0x7fffffff : null, leaf: data & 0x80000000 ? null : data };
      });
    };
    const out = {};
    for (const t of entries(0)) {
      out[t.id] = [];
      for (const n of entries(t.sub)) {
        for (const l of entries(n.sub)) {
          const rva = r.readUInt32LE(l.leaf);
          const size = r.readUInt32LE(l.leaf + 4);
          out[t.id].push({ name: n.id, lang: l.id, size, data: () => r.subarray(rva - rsrcRva, rva - rsrcRva + size) });
        }
      }
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------- building new resources

// one VS_VERSIONINFO-style block: header, key, value, then children, each 32-bit aligned
function block(key, value, text, children = []) {
  const align = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
  const val = value == null ? Buffer.alloc(0) : text ? Buffer.from(value + '\0', 'utf16le') : value;
  const head = align(Buffer.concat([Buffer.alloc(6), Buffer.from(key + '\0', 'utf16le')]));
  const body = Buffer.concat([head, align(val), ...children.map(align)]);
  body.writeUInt16LE(body.length, 0);
  body.writeUInt16LE(value == null ? 0 : text ? value.length + 1 : val.length, 2);
  body.writeUInt16LE(text ? 1 : 0, 4);
  return body;
}

function versionInfo(old, lang) {
  // keep Electron's version numbers (VS_FIXEDFILEINFO), replace the names
  let fixed = old?.subarray(40, 92);
  if (!fixed || fixed.readUInt32LE(0) !== 0xfeef04bd) {
    fixed = Buffer.alloc(52);
    fixed.writeUInt32LE(0xfeef04bd, 0);
    fixed.writeUInt32LE(0x10000, 4);
    fixed.writeUInt32LE(0x3f, 36);
    fixed.writeUInt32LE(0x40004, 40);
    fixed.writeUInt32LE(1, 44);
  }
  const version = require(path.join(ROOT, 'package.json')).version;
  const strings = {
    CompanyName: brand.name,
    FileDescription: brand.name,
    FileVersion: version,
    InternalName: brand.name,
    OriginalFilename: `${brand.name}.exe`,
    ProductName: brand.name,
    ProductVersion: version,
  };
  const table = lang.toString(16).padStart(4, '0') + '04b0';
  const translation = Buffer.alloc(4);
  translation.writeUInt16LE(lang, 0);
  translation.writeUInt16LE(1200, 2);
  return block('VS_VERSION_INFO', fixed, false, [
    block('StringFileInfo', null, true, [block(table, null, true, Object.entries(strings).map(([k, v]) => block(k, v, true)))]),
    block('VarFileInfo', null, true, [block('Translation', translation, false)]),
  ]);
}

// the frames of assets/icon.ico, ready for RT_ICON, and their RT_GROUP_ICON directory
function iconFrames(ids) {
  const ico = fs.readFileSync(path.join(ROOT, 'assets', 'icon.ico'));
  const count = ico.readUInt16LE(4);
  const group = Buffer.alloc(6 + 14 * count);
  group.writeUInt16LE(1, 2);
  group.writeUInt16LE(count, 4);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + 16 * i;
    const size = ico.readUInt32LE(e + 8);
    frames.push(ico.subarray(ico.readUInt32LE(e + 12), ico.readUInt32LE(e + 12) + size));
    ico.copy(group, 6 + 14 * i, e, e + 8); // width, height, colors, reserved, planes, bit count
    group.writeUInt32LE(size, 6 + 14 * i + 8);
    group.writeUInt16LE(ids[i], 6 + 14 * i + 12);
  }
  return { frames, group };
}

// ---------------------------------------------------------------- writing them

function patch(file, src) {
  const koffi = require('koffi');
  const k32 = koffi.load('kernel32.dll');
  const begin = k32.func('void * __stdcall BeginUpdateResourceW(str16 file, bool deleteAll)');
  const byId = k32.func('bool __stdcall UpdateResourceW(void *h, uintptr_t type, uintptr_t name, uint16 lang, void *data, uint32 size)');
  const byName = k32.func('UpdateResourceW', 'bool', ['void *', 'uintptr_t', 'str16', 'uint16', 'void *', 'uint32']);
  const end = k32.func('bool __stdcall EndUpdateResourceW(void *h, bool discard)');

  const res = resources(src);
  const groups = res[RT_GROUP_ICON] || [];
  // Windows shows the first icon group: named ones sort before numbered ones
  const main = [...groups].sort((a, b) => (typeof a.name === typeof b.name ? (a.name < b.name ? -1 : 1) : typeof a.name === 'string' ? -1 : 1))[0];
  const iconLang = main?.lang ?? 1033;
  const used = new Set((res[RT_ICON] || []).map((r) => r.name));
  const ids = [];
  for (let id = 1; ids.length < 16; id++) if (!used.has(id)) ids.push(id);
  const { frames, group } = iconFrames(ids);
  const ver = (res[RT_VERSION] || [])[0];

  const h = begin(file, false);
  if (!h) throw new Error('BeginUpdateResource failed');
  let ok = true;
  frames.forEach((f, i) => (ok = ok && byId(h, RT_ICON, ids[i], iconLang, f, f.length)));
  const name = main?.name ?? 1;
  ok = ok && (typeof name === 'string' ? byName(h, RT_GROUP_ICON, name, iconLang, group, group.length) : byId(h, RT_GROUP_ICON, name, iconLang, group, group.length));
  const lang = ver?.lang ?? 1033;
  const info = versionInfo(ver?.data(), lang);
  ok = ok && byId(h, RT_VERSION, ver?.name ?? 1, lang, info, info.length);
  if (!end(h, !ok) || !ok) throw new Error('UpdateResource failed');
}

// Linux has no resource table to patch, but the kernel names a process after the file that was
// run, so a second name for the same file is enough: System Monitor, `ps` and the dock all say
// Mirage. A hard link costs no disk and keeps Electron's own files next to it, which is how it
// finds them. If the filesystem refuses one, Electron's own binary still works.
function linkedBinary(electronBin) {
  try {
    const target = path.join(path.dirname(electronBin), brand.name);
    const real = fs.statSync(electronBin);
    const have = fs.statSync(target, { throwIfNoEntry: false });
    if (have && have.ino === real.ino && have.dev === real.dev) return target;
    if (have) fs.rmSync(target, { force: true });
    fs.linkSync(electronBin, target);
    return target;
  } catch {
    return electronBin;
  }
}

// path to launch: a binary that carries Mirage's name (and, on Windows, its icon)
function brandedExe(electronExe) {
  if (process.platform === 'linux') return linkedBinary(electronExe);
  if (process.platform !== 'win32') return electronExe;
  try {
    const target = path.join(path.dirname(electronExe), `${brand.name}.exe`);
    const src = fs.statSync(electronExe);
    const icon = fs.statSync(path.join(ROOT, 'assets', 'icon.ico'));
    const stamp = `${src.size}|${src.mtimeMs}|${icon.size}|${icon.mtimeMs}|${brand.name}|v2`;
    const stampFile = `${target}.stamp`;
    let built = '';
    try {
      built = fs.readFileSync(stampFile, 'utf8');
    } catch {}
    if (built === stamp && fs.existsSync(target)) return target;
    const tmp = `${target}.tmp`;
    fs.copyFileSync(electronExe, tmp);
    try {
      patch(tmp, electronExe);
      fs.renameSync(tmp, target);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
    fs.writeFileSync(stampFile, stamp);
    return target;
  } catch {
    return electronExe; // in use, read-only, or anything unexpected: Electron's own exe still works
  }
}

module.exports = { brandedExe, resources };

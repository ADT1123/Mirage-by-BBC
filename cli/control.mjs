// Talks to the running wallpaper (tiny localhost server) and starts/stops it.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import config from '../src/shared/config.cjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `http://127.0.0.1:${config.PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function call(route, timeout = 1200) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + route, { headers: { 'x-wall': '1' }, signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const status = () => call('/status');
export const openEditor = () => call('/edit');
export const reload = () => call('/reload');

// Electron no longer fetches its own binary during `npm install`: the first thing that asks for
// it downloads ~100 MB instead. Worth saying out loud, or the first start looks frozen.
function electronMissing() {
  try {
    const dist = path.join(ROOT, 'node_modules', 'electron');
    const exe = fs.readFileSync(path.join(dist, 'path.txt'), 'utf8').trim();
    return !fs.existsSync(path.join(dist, 'dist', exe));
  } catch {
    return true;
  }
}

// the end of the log, so a failure can explain itself instead of pointing at a file
function logTail(file, lines = 12) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .slice(-lines);
  } catch {
    return [];
  }
}

export async function start() {
  const s = await status();
  if (s) return { already: true, status: s };

  const file = path.join(config.DIR, 'app.log');
  if (electronMissing()) process.stdout.write('\n  First run: downloading Electron (about 100 MB). This happens once.\n');

  let electron;
  try {
    // Windows: Mirage.exe, Linux: a hard link named Mirage, so the system says Mirage not Electron
    electron = require('../src/main/exe-brand.cjs').brandedExe(require('electron'));
  } catch (e) {
    return { failed: true, log: file, reason: String(e?.message || e).split('\n')[0] };
  }
  fs.mkdirSync(config.DIR, { recursive: true });
  const log = fs.openSync(file, 'a');
  const env = { ...process.env };
  // VS Code's terminal sets this, which would make Electron behave like plain Node.
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [ROOT], { detached: true, stdio: ['ignore', log, log], env, windowsHide: true });
  child.unref();

  // a slow laptop, a cold page cache or a first GPU shader build can take a while
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    const st = await status();
    if (st) return { started: true, status: st };
    if (child.exitCode != null && i > 8) break; // it died; no point waiting out the clock
  }
  return { failed: true, log: file, tail: logTail(file) };
}

export async function stop() {
  const s = await status();
  if (!s) return { notRunning: true };
  await call('/quit');
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    if (!(await status())) return { stopped: true };
  }
  return { stopped: false };
}

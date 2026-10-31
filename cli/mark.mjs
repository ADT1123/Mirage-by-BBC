// Draws the Mirage mark (logo.mjs, a pixel grid) in the terminal with half blocks: one
// printed line covers two grid rows, the top pixel as the text color and the bottom one
// as the background. Shared by the one-shot commands (ANSI) and the interactive shell (Ink).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MARK } from './logo.mjs';
import brand from '../src/shared/brand.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// dark reads on light terminals; on dark ones the light sun still carries the shape
export const MARK_COLORS = { d: '#1c1c1e', l: '#f5f5f7' };

// Colors only on a real terminal, and never when the user asked for none (no-color.org).
export function canColor(stream = process.stdout) {
  if ('NO_COLOR' in process.env && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return !!stream.isTTY && process.env.TERM !== 'dumb';
}

// Each line is a list of cells: { ch, fg, bg } (colors are hex, or null for "leave it").
export function markCells(grid = MARK) {
  const color = (px) => MARK_COLORS[px] || null;
  const lines = [];
  for (let r = 0; r < grid.length; r += 2) {
    const top = grid[r];
    const bottom = grid[r + 1] || '.'.repeat(top.length);
    lines.push(
      [...top].map((t, c) => {
        const up = color(t);
        const down = color(bottom[c]);
        if (!up && !down) return { ch: ' ', fg: null, bg: null };
        if (!up) return { ch: '▄', fg: down, bg: null }; // only the bottom half is filled
        if (!down || up === down) return { ch: down ? '█' : '▀', fg: up, bg: null };
        return { ch: '▀', fg: up, bg: down };
      }),
    );
  }
  return lines;
}

// neighbouring cells with the same colors print as one run
export const runs = (cells) =>
  cells.reduce((out, c) => {
    const last = out[out.length - 1];
    if (last && last.fg === c.fg && last.bg === c.bg) last.ch += c.ch;
    else out.push({ ...c });
    return out;
  }, []);

// 24-bit color where the terminal says so (and on Windows 10+, whose console has it);
// otherwise the nearest of the 256 xterm colors, which every modern terminal has.
const truecolor = () => /truecolor|24bit/i.test(process.env.COLORTERM || '') || !!process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode' || process.platform === 'win32';
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function sgr(hex, layer) {
  const [r, g, b] = rgb(hex);
  if (truecolor()) return `${layer};2;${r};${g};${b}`;
  const gray = Math.round(((r + g + b) / 3 - 8) / 10);
  return `${layer};5;${Math.max(232, Math.min(255, 232 + gray))}`; // the mark is all grays
}

// The mark as ANSI strings, one per printed line.
export function markAnsi() {
  return markCells().map((cells) =>
    runs(cells)
      .map(({ ch, fg, bg }) => {
        const codes = [fg && sgr(fg, 38), bg && sgr(bg, 48)].filter(Boolean);
        return codes.length ? `\x1b[${codes.join(';')}m${ch}\x1b[0m` : ch;
      })
      .join(''),
  );
}

// "1.1.0", from release.json (what the updater shows) or package.json
export function version() {
  for (const file of ['release.json', 'package.json']) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')).version;
      if (v) return String(v);
    } catch {}
  }
  return '';
}

// The words that sit beside the mark: name, tagline, then a quiet third line.
export function bannerText(extra = '') {
  const v = version();
  return {
    name: brand.name.toUpperCase().split('').join(' '),
    tagline: brand.tagline || '',
    extra: extra || `${brand.command}${v ? ` · v${v}` : ''}`,
  };
}

// The full banner for plain output: the mark with the name beside it, or just the
// name when the terminal can't show colors.
export function banner({ extra = '', color = canColor() } = {}) {
  const t = bannerText(extra);
  if (!color) return [`${brand.name}${t.tagline ? ` · ${t.tagline}` : ''}`];
  const art = markAnsi();
  const mid = Math.floor(art.length / 2) - 1;
  const side = { [mid]: `\x1b[1m${t.name}\x1b[0m`, [mid + 1]: t.tagline, [mid + 2]: `\x1b[2m${t.extra}\x1b[0m` };
  return art.map((line, i) => `  ${line}${side[i] ? `   ${side[i]}` : ''}`);
}

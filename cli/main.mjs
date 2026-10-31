#!/usr/bin/env node
// CLI entry: no arguments opens the interactive shell; `<command> [args]` runs one command.

import { COMMANDS, brand, executeWords, find } from './commands.mjs';
import { banner, canColor } from './mark.mjs';

const cli = brand.command;
const color = canColor();
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const dim = (s) => paint('2', s);
const bold = (s) => paint('1', s);

// Results speak the interactive shell's language ("/start"); here you type "bro start".
const NAMES = COMMANDS.flatMap((c) => [c.name, ...(c.aliases || []).filter((a) => /^\w+$/.test(a))]);
const SLASH = new RegExp(`(^|[\\s(“"'])/(${NAMES.join('|')})(?=$|[\\s,.:)”"'])`, 'g');
const speak = (s) => String(s ?? '').replace(SLASH, `$1${cli} $2`);

// Grouped lists: every cell but the last is padded into a column, the last one is dimmed.
function printSections(sections) {
  for (const sec of sections) {
    console.log(`\n  ${bold(speak(sec.title))}${sec.note ? `  ${dim(speak(sec.note))}` : ''}`);
    const widths = [];
    for (const row of sec.rows) row.slice(0, -1).forEach((cell, i) => (widths[i] = Math.max(widths[i] || 0, [...cell].length)));
    for (const row of sec.rows) {
      const cells = row.slice(0, -1).map((cell, i) => cell + ' '.repeat(widths[i] - [...cell].length));
      console.log(`    ${cells.join('  ')}  ${dim(speak(row[row.length - 1]))}`.trimEnd());
    }
    if (sec.foot) console.log(`    ${dim(speak(sec.foot))}`);
  }
  console.log('');
}

function print(res) {
  if (!res) return;
  console.log(`${res.ok ? green('⏺') : red('⏺')} ${bold(speak(res.title))}`);
  (res.lines || []).forEach((l, i) => console.log(dim(`${i === 0 ? '  ⎿  ' : '     '}${speak(l)}`)));
  if (res.sections) printSections(res.sections);
  if (res.hint) console.log(dim(`${res.lines?.length && !res.sections ? '     ' : '  ⎿  '}${speak(res.hint)}`));
}

const showBanner = () => console.log(`\n${banner().join('\n')}\n`);

function help() {
  showBanner();
  console.log(`  ${bold(cli.padEnd(24))}${dim('open the interactive shell (type / for commands)')}`);
  console.log(`  ${bold(`${cli} <command> [args]`.padEnd(24))}${dim(`run one command, e.g. ${cli} wall koi pond`)}`);
  return executeWords(['help']).then(print);
}

const args = process.argv.slice(2);

if (['--help', '-h', 'help', '?'].includes(args[0]) && args.length === 1) {
  await help();
  process.exit(0);
}

if (args.length) {
  if (find(args[0])?.name === 'start') showBanner();
  const res = await executeWords(args);
  if (res?.ui === 'theme-picker') print(await executeWords(['themes']));
  else if (res?.ui === 'widget-picker') print(await executeWords(['widgets', 'list']));
  else if (res?.ui === 'wall-picker') print(await executeWords(['walls']));
  else if (res?.ui === 'exit') print({ ok: true, title: `Nothing to leave: ${cli} ${args[0]} is for the interactive shell`, lines: [`${brand.name} keeps running. To take it off your desktop, run /stop`] });
  else print(res);
  process.exit(res && !res.ok ? 1 : 0);
} else if (!process.stdin.isTTY || !process.stdout.isTTY) {
  showBanner();
  console.log(`${cli} needs an interactive terminal for its shell. Run one command instead, e.g. \`${cli} status\`, or see \`${cli} help\`.`);
} else {
  const { startUI } = await import('./ui.mjs');
  startUI();
}

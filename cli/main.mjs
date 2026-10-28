#!/usr/bin/env node
// CLI entry: no arguments opens the interactive shell; `<command> [args]` runs one command.

import { COMMANDS, THEMES, WIDGETS, brand, config, executeWords } from './commands.mjs';

const cli = brand.command;
const tty = process.stdout.isTTY;
const paint = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const dim = (s) => paint('2', s);
const bold = (s) => paint('1', s);

function print(res) {
  if (!res) return;
  console.log(`${res.ok ? green('⏺') : red('⏺')} ${bold(res.title)}`);
  (res.lines || []).forEach((l, i) => console.log(dim(`${i === 0 ? '  ⎿  ' : '     '}${l}`)));
  if (res.hint) console.log(dim(`${res.lines?.length ? '     ' : '  ⎿  '}${res.hint}`));
}

const args = process.argv.slice(2);

if (args[0] === '--help' || args[0] === '-h') {
  console.log(`${bold(cli)} ${dim(`· ${brand.name}${brand.tagline ? `, ${brand.tagline}` : ''}`)}\n`);
  console.log(`  ${bold(cli.padEnd(20))} open the interactive shell`);
  console.log(`  ${bold(`${cli} <command>`.padEnd(20))} run one command, e.g. ${dim(`${cli} theme synthwave`)}\n`);
  for (const c of COMMANDS) {
    const left = `${c.name} ${c.args || ''}`;
    if (left.length > 26) console.log(`  ${left}\n  ${''.padEnd(28)}${dim(c.desc)}`);
    else console.log(`  ${left.padEnd(28)}${dim(c.desc)}`);
  }
  process.exit(0);
}

if (args.length) {
  const res = await executeWords(args);
  if (res?.ui === 'theme-picker') {
    const cur = config.load().theme;
    print({ ok: true, title: `${THEMES.length} themes`, lines: THEMES.map((t) => `${t.id === cur ? '●' : '○'} ${t.id.padEnd(10)} ${t.tagline}`), hint: `${cli} theme <name>` });
  } else if (res?.ui === 'widget-picker') {
    const on = new Set(config.load().widgets.map((w) => w.type));
    print({ ok: true, title: 'Widgets', lines: WIDGETS.map((w) => `${on.has(w.type) ? '◉' : '○'} ${w.type.padEnd(10)} ${w.desc}`), hint: `${cli} add <widget> · ${cli} remove <widget>` });
  } else if (res?.ui !== 'exit') {
    print(res);
  }
  process.exit(res && !res.ok ? 1 : 0);
} else if (!process.stdin.isTTY) {
  console.log(`${cli} needs an interactive terminal. Try \`${cli} --help\`.`);
} else {
  const { startUI } = await import('./ui.mjs');
  startUI();
}

// Small, safe edits to notes, to-dos and countdowns, shared by Spotlight quick-add and the
// AI assistant. Each takes a config object, changes it in place and returns a summary line.

const { make, NOTE_COLORS } = require('./widgets.cjs');
const { byId } = require('./themes.cjs');

// a free-ish spot for a new widget so it doesn't land on top of another
function spot(cfg) {
  const taken = cfg.widgets.filter((w) => w.type !== 'menubar');
  for (const y of [0.3, 0.45, 0.6, 0.15, 0.75]) {
    for (const x of [0.5, 0.71, 0.3, 0.085]) {
      if (!taken.some((w) => Math.abs(w.x - x) < 0.15 && Math.abs(w.y - y) < 0.12)) return [x, y];
    }
  }
  return [0.45, 0.4];
}

// fills an empty note first, else pins a new one; returns its id
function addNote(cfg, text, color) {
  const empty = cfg.widgets.find((w) => w.type === 'note' && !w.text);
  if (empty) {
    empty.text = text;
    if (NOTE_COLORS.includes(color)) empty.color = color;
    return empty.id;
  }
  const n = cfg.widgets.filter((w) => w.type === 'note').length;
  const [x, y] = spot(cfg);
  const w = make('note', x, y, { text, color: NOTE_COLORS.includes(color) ? color : NOTE_COLORS[n % NOTE_COLORS.length] });
  cfg.widgets.push(w);
  return w.id;
}

function todoList(cfg) {
  let w = cfg.widgets.find((x) => x.type === 'todo');
  if (!w) {
    const [x, y] = spot(cfg);
    w = make('todo', x, y);
    cfg.widgets.push(w);
  }
  w.items ||= [];
  return w;
}

function addTodo(cfg, text) {
  const list = todoList(cfg);
  if (list.items.some((i) => i.text.toLowerCase() === text.toLowerCase())) return `Already on your list: ${text}`;
  list.items.push({ text, done: false });
  return `Added to-do: ${text}`;
}

// AI actions -> config changes. Anything malformed is skipped, never guessed at.
function apply(cfg, actions = []) {
  const done = [];
  for (const a of actions) {
    const text = String(a.text || '').trim();
    switch (a.type) {
      case 'add_todo':
        if (text) done.push(addTodo(cfg, text));
        break;
      case 'complete_todo': {
        const it = todoList(cfg).items[a.index];
        if (it) {
          it.done = true;
          done.push(`Ticked off: ${it.text}`);
        }
        break;
      }
      case 'remove_todo': {
        const list = todoList(cfg);
        const [it] = list.items[a.index] ? list.items.splice(a.index, 1) : [];
        if (it) done.push(`Removed: ${it.text}`);
        break;
      }
      case 'set_todos': {
        // models sometimes copy list markers: strip numbers, checkboxes and "(done)"
        const clean = (t) => String(t).replace(/^\s*(\d+[.:)]\s*)?(\[[ xX]?\]\s*)?/, '').replace(/\s*\(done\)\s*$/i, '').trim();
        const items = [...new Map((a.items || []).map(clean).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()];
        if (!items.length) break;
        const list = todoList(cfg);
        const wasDone = new Set(list.items.filter((i) => i.done).map((i) => i.text.toLowerCase()));
        list.items = items.map((t) => ({ text: t, done: wasDone.has(t.toLowerCase()) }));
        done.push(`Reorganized your to-dos (${items.length})`);
        break;
      }
      case 'add_note':
        if (text) {
          addNote(cfg, text, a.color);
          done.push(`Pinned a note: ${text}`);
        }
        break;
      case 'set_countdown': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '') || !text) break;
        let w = cfg.widgets.find((x) => x.type === 'countdown');
        if (!w) {
          const [x, y] = spot(cfg);
          w = make('countdown', x, y);
          cfg.widgets.push(w);
        }
        w.title = text;
        w.date = a.date;
        done.push(`Countdown: ${text} on ${a.date}`);
        break;
      }
      case 'set_theme':
        if (byId(text)) {
          cfg.theme = text;
          done.push(`Theme: ${byId(text).name}`);
        }
        break;
      default:
        break;
    }
  }
  return done;
}

module.exports = { spot, addNote, addTodo, apply };

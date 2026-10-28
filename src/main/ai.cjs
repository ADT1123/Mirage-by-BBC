// "Ask AI" from Spotlight: a local Llama model (through Ollama) that answers questions and
// can organize your desktop (to-dos, notes, countdowns, theme). Nothing leaves this PC.
// The model replies with a short answer plus structured actions, which we validate and apply.

const { spawn } = require('child_process');
const config = require('../shared/config.cjs');
const brand = require('../shared/brand.cjs');
const { THEMES } = require('../shared/themes.cjs');
const organize = require('../shared/organize.cjs');

const HOST = process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.1:8b';

const SYSTEM = `You are the assistant built into ${brand.name}, a desktop wallpaper app with sticky notes, a to-do list, countdowns and themes.
You can answer any general question. "reply" is always a natural sentence to the user (never an action name), in plain text, no markdown, short and direct (a few sentences at most unless the user asks for more). When you change things, say briefly what you did.
When asked to sort or prioritize, decide the order yourself from deadlines and wording (e.g. "due tomorrow" is urgent) instead of asking.
When the user asks you to add, plan, sort, prioritize, clean up or otherwise organize things, do it through actions:
- add_todo: text = the task
- complete_todo / remove_todo: index = the task's number in the current list (0-based)
- set_todos: items = the whole to-do list in its new order, most urgent or important first (to prioritize, group, dedupe or split tasks). Include every task plus any new ones asked for in the same request, using only the task text (no numbers or "(done)"). Keep each task's wording unless asked to change it.
- add_note: text = the note; color = yellow, pink, blue, green or purple ("" for the default)
- set_countdown: text = title, date = YYYY-MM-DD
- set_theme: text = a theme id from the list
Fill unused fields with "" (strings), -1 (index) or [] (items). For plain questions, actions must be [].
Never invent tasks the user didn't mention. If something is ambiguous, ask in the reply instead of acting.`;

const SCHEMA = {
  type: 'object',
  required: ['reply', 'actions'],
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['add_todo', 'complete_todo', 'remove_todo', 'set_todos', 'add_note', 'set_countdown', 'set_theme'] },
          text: { type: 'string' },
          index: { type: 'integer' },
          date: { type: 'string' },
          color: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

// what the model can see: today's date and the things it may organize
function context(cfg, extra) {
  const todos = cfg.widgets.find((w) => w.type === 'todo')?.items || [];
  const notes = cfg.widgets.filter((w) => w.type === 'note' && w.text).map((w) => w.text);
  const countdowns = cfg.widgets.filter((w) => w.type === 'countdown').map((w) => `${w.title} on ${w.date}`);
  const now = new Date();
  return [
    `Now: ${now.toDateString()}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    `To-do list (number: task):\n${todos.length ? todos.map((t, i) => `${i}: ${t.text}${t.done ? '  (done)' : ''}`).join('\n') : '(empty)'}`,
    `Sticky notes:\n${notes.length ? notes.map((n) => `- ${n}`).join('\n') : '(none)'}`,
    `Countdowns: ${countdowns.join('; ') || '(none)'}`,
    `Current theme: ${cfg.theme}. Themes: ${THEMES.map((t) => t.id).join(', ')}`,
    extra?.song ? `Now playing: ${extra.song}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function call(pathname, body, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${HOST}${pathname}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  } finally {
    clearTimeout(t);
  }
}

// Ollama installed but not running? start it quietly and wait for it to answer
let starting = null;
async function ensureServer() {
  try {
    return await call('/api/version', null, 1500);
  } catch {}
  starting ||= (async () => {
    try {
      spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
    } catch {
      return null;
    }
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await call('/api/version', null, 1000);
      } catch {}
    }
    return null;
  })().finally(() => (starting = null));
  return starting;
}

async function models() {
  if (!(await ensureServer())) return null;
  try {
    return (await call('/api/tags', null, 4000)).models?.map((m) => m.name) || [];
  } catch {
    return [];
  }
}

// -> { ok, reply, done: [summary lines], model }
async function ask(question, extra = {}, history = []) {
  const cfg = config.load();
  const model = cfg.ai?.model || DEFAULT_MODEL;
  if (!(await ensureServer())) return { ok: false, reply: 'The local AI needs Ollama. Install it from ollama.com, then run: ollama pull llama3.1:8b' };
  const messages = [
    { role: 'system', content: SYSTEM },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.role === 'assistant' ? JSON.stringify({ reply: m.text, actions: [] }) : m.text })),
    { role: 'user', content: `${context(cfg, extra)}\n\n<request>\n${question}\n</request>` },
  ];
  const chat = async () => {
    const res = await call('/api/chat', { model, stream: false, format: SCHEMA, keep_alive: '15m', options: { temperature: 0.3 }, messages }, 120000);
    return JSON.parse(res.message?.content || '');
  };
  let out;
  try {
    out = await chat();
    // small models sometimes say "I added it" without sending the action: ask once more
    if (!out.actions?.length && /\b(added|pinned|noted|sorted|reorganized|removed|ticked|marked|set|changed|switched)\b/i.test(out.reply || '')) {
      messages.push({ role: 'assistant', content: JSON.stringify(out) }, { role: 'user', content: 'Your reply says you made a change, but "actions" is empty. Send the same reply with the actions filled in.' });
      out = await chat();
    }
  } catch (e) {
    if (e.status === 404) return { ok: false, reply: `The model "${model}" isn't downloaded yet. Run: ollama pull ${model}` };
    if (e.name === 'AbortError') return { ok: false, reply: 'The model took too long. Try a smaller one: brow ai model llama3.2:1b' };
    if (e instanceof SyntaxError) return { ok: false, reply: 'The model sent back something unreadable. Try again.' };
    return { ok: false, reply: `The local model failed: ${e.message}` };
  }
  let done = [];
  if (Array.isArray(out.actions) && out.actions.length) config.update((c) => ((done = organize.apply(c, out.actions)), c));
  return { ok: true, reply: String(out.reply || '').trim() || (done.length ? 'Done.' : ''), done, model };
}

// load the model ahead of time (e.g. when Spotlight opens) so the first answer is quick
async function warm() {
  const model = config.load().ai?.model || DEFAULT_MODEL;
  if (await ensureServer()) call('/api/generate', { model, keep_alive: '15m' }, 60000).catch(() => {});
}

module.exports = { ask, warm, models, DEFAULT_MODEL };

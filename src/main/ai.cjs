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
You can see the user's real desktop right now (time, weather, music, stocks, commits, battery, reminders, notes, to-dos). Use it: answer from it directly, connect the dots (e.g. "rain at 5, so leave early"), and suggest the obvious next step.
Take actions when the user asks for something you can do. Never claim you did something without the matching action.
Available actions:
- add_todo: text = the task
- complete_todo / remove_todo: index = the task's number in the current list (0-based)
- set_todos: items = the whole to-do list in its new order, most urgent or important first (to prioritize, group, dedupe or split tasks). Include every task plus any new ones asked for in the same request, using only the task text (no numbers or "(done)"). Keep each task's wording unless asked to change it.
- add_note: text = the note; color = yellow, pink, blue, green or purple ("" for the default)
- set_countdown: text = title, date = YYYY-MM-DD
- set_theme: text = a theme id from the list
- set_appearance: text = auto, light, dark or sun
- set_accent: text = blue, indigo, purple, pink, orange, green, teal, a #hex color, song (follow the album art) or theme
- add_widget: text = one of: clock, weather, calendar, todo, note, countdown, quote, stocks, music, photo, sticker, memories, assistant, year, system
- remind: text = what to remind, date = "YYYY-MM-DD HH:MM" (24-hour, local time; work it out from "in 20 minutes", "at 7", "tomorrow morning" = 09:00)
- music: text = play, pause, toggle, next or previous
- set_volume: index = 0 to 100
- open_app: text = the app's name (e.g. "Spotify", "VS Code")
- open_url: text = a full https URL, or words to search the web for
Fill unused fields with "" (strings), -1 (index) or [] (items). For plain questions, actions must be [].
Only state facts that are in the snapshot or that you know for sure; if the snapshot doesn't say (for example no rain data), say so instead of guessing.
Examples (when it is 2026-10-29 17:00):
- "remind me to stretch in 30 minutes" -> reply "I'll remind you to stretch at 17:30.", actions [{"type":"remind","text":"Stretch","date":"2026-10-29 17:30"}]
- "remind me to call mom tomorrow at 7pm" -> [{"type":"remind","text":"Call mom","date":"2026-10-30 19:00"}]
- "next song" or "skip this" -> [{"type":"music","text":"next"}]; "pause the music" -> [{"type":"music","text":"pause"}]
- "open spotify" -> [{"type":"open_app","text":"Spotify"}]
- "volume to 20" -> [{"type":"set_volume","index":20}]
- "search flights to goa" -> [{"type":"open_url","text":"flights to goa"}]
- "add buy milk to my list" -> [{"type":"add_todo","text":"Buy milk"}]
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
          type: { type: 'string', enum: ['add_todo', 'complete_todo', 'remove_todo', 'set_todos', 'add_note', 'set_countdown', 'set_theme', 'set_appearance', 'set_accent', 'add_widget', 'remind', 'music', 'set_volume', 'open_app', 'open_url'] },
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
    `Now: ${now.toLocaleDateString('en-US', { weekday: 'long' })} ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} (24-hour, local time)`,
    `To-do list (number: task):\n${todos.length ? todos.map((t, i) => `${i}: ${t.text}${t.done ? '  (done)' : ''}`).join('\n') : '(empty)'}`,
    `Sticky notes:\n${notes.length ? notes.map((n) => `- ${n}`).join('\n') : '(none)'}`,
    `Countdowns: ${countdowns.join('; ') || '(none)'}`,
    `Current theme: ${cfg.theme}. Themes: ${THEMES.map((t) => t.id).join(', ')}`,
    extra?.song ? `Now playing: ${extra.song}` : 'Music: nothing playing',
    extra?.weather ? `Weather: ${extra.weather}` : '',
    extra?.stocks ? `Stocks: ${extra.stocks}` : '',
    extra?.commits ? `Code: ${extra.commits}` : '',
    extra?.battery ? `Battery: ${extra.battery}` : '',
    extra?.reminders ? `Upcoming reminders: ${extra.reminders}` : '',
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
// Everyday commands don't need a model: matched exactly, answered instantly, work offline too.
const FAST = [
  [/^(skip|next)\b(?:\s+(?:this\s+)?(?:song|track))?[.!]*$/i, () => ({ type: 'music', text: 'next' }), 'Skipped to the next song.'],
  [/^(?:previous|prev|go back|last)\s*(?:song|track)?[.!]*$/i, () => ({ type: 'music', text: 'previous' }), 'Back to the previous song.'],
  [/^(?:pause|stop)(?:\s+(?:the\s+)?(?:music|song))?[.!]*$/i, () => ({ type: 'music', text: 'pause' }), 'Paused.'],
  [/^(?:play|resume)(?:\s+(?:the\s+)?(?:music|song))?[.!]*$/i, () => ({ type: 'music', text: 'play' }), 'Playing.'],
  [/^(?:set\s+)?(?:the\s+)?volume\s+(?:to\s+)?(\d{1,3})\s*%?[.!]*$/i, (m) => ({ type: 'set_volume', index: Number(m[1]) }), 'Done.'],
  [/^(?:mute|unmute)[.!]*$/i, (m) => ({ type: 'set_volume', index: /^un/i.test(m[0]) ? 50 : 0 }), 'Done.'],
  [/^open\s+(?!https?:)(.{2,40})$/i, (m) => ({ type: 'open_app', text: m[1].trim() }), null],
];
async function fastPath(question, hooks) {
  const q = question.trim();
  for (const [re, make, reply] of FAST) {
    const m = re.exec(q);
    if (!m || !hooks[make(m).type]) continue;
    const line = await hooks[make(m).type](make(m));
    if (!line) return null; // e.g. nothing is playing: let the model explain
    return { ok: true, reply: reply || `${line}.`, done: [line], model: 'instant' };
  }
  return null;
}

// hooks: things only the running app can do (music, apps, links, reminders, volume)
async function ask(question, extra = {}, history = [], hooks = {}) {
  const quick = await fastPath(String(question || ''), hooks);
  if (quick) return quick;
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
    if (!out.actions?.length && /\b(added|pinned|noted|sorted|reorganized|removed|ticked|marked|set|changed|switched|paused|skipped|played|playing|opened|opening|searched|searching|remind|reminder|turned|volume)\b/i.test(out.reply || '')) {
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
  const actions = Array.isArray(out.actions) ? out.actions : [];
  if (actions.length) config.update((c) => ((done = organize.apply(c, actions)), c));
  for (const a of actions) {
    const fn = hooks[a.type];
    if (!fn) continue;
    try {
      const line = await fn(a);
      if (line) done.push(line);
    } catch {}
  }
  return { ok: true, reply: String(out.reply || '').trim() || (done.length ? 'Done.' : ''), done, model };
}

// load the model ahead of time (e.g. when Spotlight opens) so the first answer is quick
async function warm() {
  const model = config.load().ai?.model || DEFAULT_MODEL;
  if (await ensureServer()) call('/api/generate', { model, keep_alive: '15m' }, 60000).catch(() => {});
}

module.exports = { ask, warm, models, DEFAULT_MODEL };

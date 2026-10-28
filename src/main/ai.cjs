// "Ask Claude" from Spotlight: a quick assistant that can answer and also organize your
// desktop (to-dos, notes, countdowns, theme). Claude replies with a short answer plus a
// list of structured actions, which we validate and apply ourselves.

const fs = require('fs');
const path = require('path');
const sdk = require('@anthropic-ai/sdk');
const config = require('../shared/config.cjs');
const brand = require('../shared/brand.cjs');
const { THEMES } = require('../shared/themes.cjs');
const organize = require('../shared/organize.cjs');

const Anthropic = sdk.default || sdk;
const SECRETS = path.join(config.DIR, 'secrets.json');
const DEFAULT_MODEL = 'claude-opus-5-5';
// models that accept server-side refusal fallbacks
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

// the key lives apart from config.json, which is shared with every wallpaper page
function secrets() {
  try {
    return JSON.parse(fs.readFileSync(SECRETS, 'utf8'));
  } catch {
    return {};
  }
}

function setSecret(key, value) {
  const s = secrets();
  if (value) s[key] = value;
  else delete s[key];
  fs.mkdirSync(config.DIR, { recursive: true });
  fs.writeFileSync(SECRETS, JSON.stringify(s, null, 2), { mode: 0o600 });
}

const SYSTEM = `You are the assistant built into ${brand.name}, a desktop wallpaper app with sticky notes, a to-do list, countdowns and themes.
Answer in plain text, at most three short sentences, no markdown. Be warm and direct.
When the user asks you to add, plan, sort, prioritize, clean up or otherwise organize things, do it through actions:
- add_todo: text = the task
- complete_todo / remove_todo: index = the task's number in the current list (0-based)
- set_todos: items = the whole to-do list in its new order (to prioritize, group, dedupe or split tasks). Keep each task's wording unless asked to change it.
- add_note: text = the note; color = yellow, pink, blue, green or purple (empty for the default)
- set_countdown: text = title, date = YYYY-MM-DD
- set_theme: text = a theme id from the list
Fill unused fields with "" (strings), -1 (index) or [] (items). For plain questions, return no actions.
Never invent tasks the user didn't mention. If something is ambiguous, ask in the reply instead of acting.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'actions'],
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'text', 'index', 'date', 'color', 'items'],
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

// what Claude can see: today's date and the things it may organize
function context(cfg, extra) {
  const todos = cfg.widgets.find((w) => w.type === 'todo')?.items || [];
  const notes = cfg.widgets.filter((w) => w.type === 'note' && w.text).map((w) => w.text);
  const countdowns = cfg.widgets.filter((w) => w.type === 'countdown').map((w) => `${w.title} on ${w.date}`);
  const now = new Date();
  return [
    `Now: ${now.toDateString()}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    `To-do list:\n${todos.length ? todos.map((t, i) => `${i}. [${t.done ? 'x' : ' '}] ${t.text}`).join('\n') : '(empty)'}`,
    `Sticky notes:\n${notes.length ? notes.map((n) => `- ${n}`).join('\n') : '(none)'}`,
    `Countdowns: ${countdowns.join('; ') || '(none)'}`,
    `Current theme: ${cfg.theme}. Themes: ${THEMES.map((t) => t.id).join(', ')}`,
    extra?.song ? `Now playing: ${extra.song}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function client() {
  const key = secrets().anthropicKey;
  return new Anthropic(key ? { apiKey: key } : {});
}

function failure(e) {
  if (e instanceof Anthropic.AuthenticationError) return `That API key didn't work. Set a new one with: ${brand.command} ai key <your key>`;
  if (e instanceof Anthropic.RateLimitError) return 'Claude is busy right now. Try again in a moment.';
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status ?? 'unknown'}).`;
  if (/api.?key|credential|auth/i.test(String(e?.message))) return `Add your Claude API key first: ${brand.command} ai key <your key>`;
  return 'Something went wrong asking Claude.';
}

// -> { ok, reply, done: [summary lines], model }
async function ask(question, extra = {}) {
  const cfg = config.load();
  const model = cfg.ai?.model || DEFAULT_MODEL;
  const request = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${context(cfg, extra)}\n\n<request>\n${question}\n</request>` }],
    // low effort keeps it quick; the schema makes the reply machine-readable
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
  };
  let res;
  try {
    const c = client();
    res = FALLBACK_MODELS.includes(model)
      ? await c.beta.messages.create({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await c.messages.create(request);
  } catch (e) {
    return { ok: false, reply: failure(e) };
  }
  if (res.stop_reason === 'refusal') return { ok: false, reply: "Claude can't help with that one." };
  const text = res.content.find((b) => b.type === 'text')?.text || '';
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    return { ok: false, reply: res.stop_reason === 'max_tokens' ? 'That answer ran too long. Try a shorter question.' : 'Claude sent back something unreadable. Try again.' };
  }
  let done = [];
  if (Array.isArray(out.actions) && out.actions.length) config.update((c) => ((done = organize.apply(c, out.actions)), c));
  return { ok: true, reply: String(out.reply || ''), done, model: res.model };
}

module.exports = { ask, setSecret, hasKey: () => !!(secrets().anthropicKey || process.env.ANTHROPIC_API_KEY), DEFAULT_MODEL };

// Widget catalog and the preset layouts that make each theme a "pack".
// Positions are fractions of the screen (top-left corner of the widget).

const WIDGETS = [
  { type: 'clock', name: 'Clock', desc: 'Big time, date and a greeting' },
  { type: 'commits', name: 'Commit Graph', desc: 'GitHub-style grid from your local repos' },
  { type: 'feed', name: 'Commit Feed', desc: 'Latest commits across your projects' },
  { type: 'note', name: 'Sticky Note', desc: 'A note you can type on', multi: true },
  { type: 'todo', name: 'To-do', desc: 'A short checklist for today' },
  { type: 'weather', name: 'Weather', desc: 'Live temperature and sky for your city' },
  { type: 'year', name: 'Year Progress', desc: 'How much of the year is gone' },
  { type: 'system', name: 'System', desc: 'CPU, memory and battery rings' },
  { type: 'calendar', name: 'Calendar', desc: 'This month at a glance' },
  { type: 'countdown', name: 'Countdown', desc: 'Days left until something big' },
  { type: 'quote', name: 'Quote', desc: 'A line to keep you going' },
  { type: 'menubar', name: 'Menu Bar', desc: 'Top bar: Control Center, calendar, Spotlight' },
  { type: 'dock', name: 'Dock', desc: 'Your apps, one click away' },
  { type: 'stack', name: 'Smart Stack', desc: 'Several widgets in one card that takes turns' },
  { type: 'music', name: 'Now Playing', desc: 'What’s playing, with controls and a full-screen player' },
  { type: 'art', name: 'Darshan', desc: 'A public-domain devotional painting, new each day' },
  { type: 'verse', name: 'Gita Verse', desc: 'A Bhagavad Gita shloka with meaning, daily' },
];

const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'];

const byType = (type) => WIDGETS.find((w) => w.type === String(type || '').toLowerCase());

function newId(type) {
  return `${type}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultsFor(type) {
  switch (type) {
    case 'note':
      return { text: '', color: 'yellow' };
    case 'todo':
      return { title: 'Today', items: [] };
    case 'countdown': {
      const y = new Date().getFullYear() + 1;
      return { title: 'New Year', date: `${y}-01-01` };
    }
    case 'quote':
      return { text: '', author: '' };
    case 'stack':
      return { items: [{ type: 'weather' }, { type: 'calendar' }, { type: 'music' }], interval: 12 };
    default:
      return {};
  }
}

function make(type, x, y, extra = {}) {
  const single = type === 'clock' || type === 'menubar' || type === 'dock';
  return { id: single ? type : newId(type), type, x, y, scale: 1, ...defaultsFor(type), ...extra };
}

// Four arrangements; each theme picks the one that suits its mood.
// Tuned on a 16:10 grid (108 x 67.5 rem): a 43.4rem column splits into two 20.9rem cards.
const ARRANGEMENTS = {
  studio: () => [
    make('menubar', 0, 0),
    make('clock', 0.085, 0.17),
    make('music', 0.085, 0.5),
    make('quote', 0.085, 0.79),
    make('commits', 0.5, 0.14),
    make('todo', 0.5, 0.36),
    make('weather', 0.708, 0.36),
    make('year', 0.5, 0.56),
    make('note', 0.708, 0.56, { width: 20.9 }),
    make('dock', 0.5, 0.86, { align: 'center' }),
  ],
  dev: () => [
    make('clock', 0.085, 0.12),
    make('commits', 0.085, 0.43),
    make('note', 0.085, 0.69, { color: 'green', width: 26 }),
    make('feed', 0.56, 0.12, { width: 30 }),
    make('system', 0.56, 0.43, { width: 30 }),
    make('todo', 0.56, 0.6, { width: 30 }),
  ],
  playful: () => [
    make('clock', 0.085, 0.12),
    make('note', 0.56, 0.1, { color: 'yellow' }),
    make('note', 0.775, 0.14, { color: 'pink' }),
    make('todo', 0.56, 0.47),
    make('weather', 0.77, 0.47),
    make('countdown', 0.085, 0.74),
    make('year', 0.295, 0.74),
    make('dock', 0.66, 0.86, { align: 'center' }),
  ],
  divine: () => [
    make('clock', 0.085, 0.19),
    make('verse', 0.085, 0.53, { width: 32 }),
    make('art', 0.63, 0.1),
  ],
  astro: () => [
    make('clock', 0.5, 0.07, { align: 'center' }),
    make('weather', 0.085, 0.36),
    make('music', 0.71, 0.36),
  ],
  calm: () => [
    make('clock', 0.5, 0.2, { align: 'center' }),
    make('quote', 0.5, 0.63, { align: 'center' }),
    make('weather', 0.085, 0.757),
    make('calendar', 0.722, 0.695),
  ],
};

const THEME_ARRANGEMENT = {
  aurora: 'studio',
  midnight: 'studio',
  weather: 'studio',
  synthwave: 'studio',
  terminal: 'dev',
  retro: 'dev',
  cartoon: 'playful',
  blast: 'playful',
  paper: 'calm',
  zen: 'calm',
  bhakti: 'divine',
  pastel: 'studio',
  ocean: 'studio',
  orbit: 'studio',
  sakura: 'calm',
  forest: 'calm',
  astro: 'astro',
};

function presetLayout(themeId) {
  const key = THEME_ARRANGEMENT[themeId] || 'studio';
  return ARRANGEMENTS[key]();
}

module.exports = { WIDGETS, NOTE_COLORS, byType, make, newId, defaultsFor, presetLayout };

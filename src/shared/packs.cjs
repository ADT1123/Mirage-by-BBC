// Wallpaper packs, like the collections in the iPhone wallpaper gallery. A wallpaper is what
// fills the screen; its `skin` is the widget style (a theme from themes.cjs) it pairs with.
// kinds: shader (live 3D, src/renderer/js/gl), scene (the classic CSS themes), color, emoji, astro.

const PACKS = [
  { id: 'glass', name: 'Glass & Chrome', desc: 'Liquid glass and molten metal, lit like a studio' },
  { id: 'silk', name: 'Silk', desc: 'Satin folds that slowly breathe' },
  { id: 'land', name: 'Landscapes', desc: 'Dunes, northern lights and a live sky' },
  { id: 'astro', name: 'Astronomy', desc: 'Earth over your city, tonight’s Moon, and Mars' },
  { id: 'clay', name: 'Clay', desc: 'Soft matte 3D shapes in pastel light' },
  { id: 'neon', name: 'Neon & Tech', desc: 'Dot matrix waves and an endless synthwave drive' },
  { id: 'color', name: 'Color', desc: 'Gradients in any colors you pick' },
  { id: 'emoji', name: 'Emoji', desc: 'Your favourite emoji, arranged in patterns' },
  { id: 'classic', name: 'Classics', desc: 'The original Mirage themes' },
];

const shader = (pack, id, name, sh, A, B, C, extra = {}) => ({ id, pack, name, kind: 'shader', shader: sh, skin: 'midnight', A, B, C, ...extra });

const WALLS = [
  shader('glass', 'glass-prism', 'Prism Glass', 'glass', [1, 0.35, 0.15], [0.2, 0.45, 1], [0.9, 0.3, 1]),
  shader('glass', 'glass-ice', 'Ice Glass', 'glass', [0.45, 0.65, 1], [0.8, 0.9, 1], [0.25, 0.4, 0.95]),
  shader('glass', 'glass-rose', 'Rose Glass', 'glass', [1, 0.35, 0.55], [1, 0.65, 0.45], [0.75, 0.45, 1]),
  shader('glass', 'glass-emerald', 'Emerald Glass', 'glass', [0.1, 0.9, 0.55], [0.05, 0.55, 0.65], [0.7, 1, 0.3]),
  shader('glass', 'glass-amber', 'Amber Glass', 'glass', [1, 0.6, 0.1], [1, 0.25, 0.15], [1, 0.85, 0.4]),
  shader('glass', 'glass-ocean', 'Ocean Glass', 'glass', [0.1, 0.8, 1], [0.1, 0.3, 1], [0.4, 1, 0.85]),
  shader('glass', 'glass-mono', 'Mono Glass', 'glass', [0.85, 0.85, 0.9], [0.55, 0.55, 0.6], [1, 1, 1]),
  shader('glass', 'chrome-liquid', 'Liquid Chrome', 'chrome', [1, 0.25, 0.65], [0.2, 0.8, 1], [0.85, 0.85, 0.85]),
  shader('glass', 'chrome-gold', 'Gold Chrome', 'chrome', [1, 0.65, 0.2], [1, 0.35, 0.1], [1, 0.82, 0.5]),
  shader('glass', 'chrome-ice', 'Ice Chrome', 'chrome', [0.4, 0.7, 1], [0.8, 0.95, 1], [0.85, 0.9, 1]),

  shader('silk', 'silk-dusk', 'Dusk', 'silk', [0.1, 0.04, 0.32], [0.55, 0.12, 0.45], [1, 0.45, 0.3]),
  shader('silk', 'silk-abyss', 'Abyss', 'silk', [0.01, 0.03, 0.1], [0.03, 0.22, 0.36], [0.5, 0.82, 0.95]),
  shader('silk', 'silk-rose', 'Rosé', 'silk', [0.25, 0.03, 0.1], [0.75, 0.2, 0.35], [1, 0.7, 0.65]),
  shader('silk', 'silk-forest', 'Forest', 'silk', [0.01, 0.08, 0.05], [0.06, 0.32, 0.2], [0.7, 0.9, 0.55]),
  shader('silk', 'silk-champagne', 'Champagne', 'silk', [0.2, 0.12, 0.06], [0.62, 0.45, 0.25], [1, 0.88, 0.65]),
  shader('silk', 'silk-graphite', 'Graphite', 'silk', [0.02, 0.02, 0.025], [0.14, 0.14, 0.16], [0.75, 0.76, 0.8]),
  shader('silk', 'silk-lavender', 'Lavender', 'silk', [0.12, 0.08, 0.3], [0.45, 0.38, 0.8], [0.88, 0.8, 1]),
  shader('silk', 'silk-ember', 'Ember', 'silk', [0.15, 0.01, 0.01], [0.7, 0.12, 0.04], [1, 0.62, 0.18]),
  shader('silk', 'silk-ocean', 'Lagoon', 'silk', [0, 0.05, 0.12], [0, 0.35, 0.55], [0.35, 0.95, 0.9]),
  shader('silk', 'silk-pearl', 'Pearl', 'silk', [0.45, 0.42, 0.48], [0.78, 0.74, 0.8], [1, 0.97, 0.95]),

  shader('land', 'dunes-golden', 'Golden Dunes', 'dunes', [0.8, 0.5, 0.3], [0.22, 0.3, 0.55], [1, 0.55, 0.25], { skin: 'midnight' }),
  shader('land', 'dunes-rose', 'Rose Dunes', 'dunes', [0.85, 0.52, 0.5], [0.3, 0.25, 0.5], [1, 0.5, 0.45]),
  shader('land', 'dunes-ash', 'Ash Dunes', 'dunes', [0.55, 0.55, 0.58], [0.25, 0.32, 0.45], [0.95, 0.85, 0.75]),
  shader('land', 'aurora-arctic', 'Arctic Aurora', 'aurora', [0.15, 1, 0.55], [0.55, 0.25, 1], [0, 0, 0]),
  shader('land', 'aurora-violet', 'Violet Aurora', 'aurora', [0.65, 0.3, 1], [1, 0.3, 0.65], [0, 0, 0]),
  shader('land', 'aurora-crimson', 'Crimson Aurora', 'aurora', [1, 0.3, 0.35], [0.6, 0.2, 1], [0, 0, 0]),
  { id: 'live-sky', pack: 'land', name: 'Live Sky', kind: 'scene', scene: 'weather', skin: 'weather' },

  { id: 'astro-earth', pack: 'astro', name: 'Earth', kind: 'astro', body: 'earth', skin: 'astro' },
  { id: 'astro-city', pack: 'astro', name: 'Your City', kind: 'astro', body: 'city', skin: 'astro' },
  { id: 'astro-moon', pack: 'astro', name: 'Moon', kind: 'astro', body: 'moon', skin: 'astro' },
  { id: 'astro-mars', pack: 'astro', name: 'Mars', kind: 'astro', body: 'mars', skin: 'astro' },

  shader('clay', 'clay-peach', 'Peach', 'clay', [0.95, 0.86, 0.8], [0.96, 0.45, 0.38], [0.55, 0.5, 0.95]),
  shader('clay', 'clay-mint', 'Mint', 'clay', [0.84, 0.92, 0.88], [0.25, 0.65, 0.55], [0.98, 0.78, 0.35]),
  shader('clay', 'clay-lilac', 'Lilac', 'clay', [0.9, 0.87, 0.96], [0.62, 0.48, 0.95], [0.98, 0.62, 0.75]),
  shader('clay', 'clay-sunny', 'Sunny', 'clay', [0.99, 0.93, 0.78], [1, 0.7, 0.2], [0.3, 0.62, 0.95]),
  shader('clay', 'clay-cherry', 'Cherry', 'clay', [0.98, 0.86, 0.86], [0.86, 0.2, 0.28], [0.98, 0.88, 0.8]),
  shader('clay', 'clay-ocean', 'Ocean', 'clay', [0.82, 0.9, 0.96], [0.15, 0.45, 0.85], [0.4, 0.85, 0.9]),
  shader('clay', 'clay-sand', 'Sand', 'clay', [0.92, 0.88, 0.8], [0.78, 0.6, 0.42], [0.4, 0.48, 0.4]),
  shader('clay', 'clay-graphite', 'Graphite', 'clay', [0.2, 0.2, 0.22], [0.92, 0.92, 0.9], [0.95, 0.35, 0.25]),

  shader('neon', 'dots-mono', 'Dot Field', 'dots', [0.95, 0.95, 0.95], [1, 0.1, 0.08], [0, 0, 0], { skin: 'midnight' }),
  shader('neon', 'dots-amber', 'Amber Dots', 'dots', [1, 0.72, 0.3], [1, 0.25, 0.1], [0, 0, 0]),
  shader('neon', 'dots-ice', 'Ice Dots', 'dots', [0.65, 0.85, 1], [0.3, 1, 0.85], [0, 0, 0]),
  shader('neon', 'neon-synth', 'Neon Horizon', 'neon', [0.1, 0.9, 1], [1, 0.2, 0.75], [1, 0.25, 0.55]),
  shader('neon', 'neon-cyan', 'Cyan Drive', 'neon', [0.2, 1, 0.8], [0.2, 0.5, 1], [0.2, 0.6, 1]),
  shader('neon', 'neon-gold', 'Gold Drive', 'neon', [1, 0.8, 0.2], [1, 0.35, 0.2], [1, 0.55, 0.2]),

  { id: 'color-sunset', pack: 'color', name: 'Sunset', kind: 'color', skin: 'midnight', A: [1, 0.45, 0.35], B: [0.95, 0.25, 0.55], C: [0.35, 0.15, 0.55], style: 'mesh' },
  { id: 'color-ocean', pack: 'color', name: 'Ocean', kind: 'color', skin: 'midnight', A: [0.1, 0.55, 0.85], B: [0.05, 0.2, 0.5], C: [0.4, 0.9, 0.85], style: 'mesh' },
  { id: 'color-berry', pack: 'color', name: 'Berry', kind: 'color', skin: 'midnight', A: [0.55, 0.1, 0.45], B: [0.95, 0.3, 0.5], C: [0.25, 0.05, 0.35], style: 'mesh' },
  { id: 'color-mint', pack: 'color', name: 'Mint', kind: 'color', skin: 'midnight', A: [0.6, 0.95, 0.8], B: [0.2, 0.7, 0.65], C: [0.9, 1, 0.85], style: 'linear' },
  { id: 'color-peach', pack: 'color', name: 'Peach', kind: 'color', skin: 'midnight', A: [1, 0.8, 0.65], B: [1, 0.6, 0.55], C: [1, 0.92, 0.8], style: 'radial' },
  { id: 'color-citrus', pack: 'color', name: 'Citrus', kind: 'color', skin: 'midnight', A: [1, 0.85, 0.2], B: [1, 0.5, 0.15], C: [0.6, 0.9, 0.3], style: 'mesh' },
  { id: 'color-mono', pack: 'color', name: 'Mono', kind: 'color', skin: 'midnight', A: [0.12, 0.12, 0.14], B: [0.35, 0.35, 0.4], C: [0.75, 0.75, 0.8], style: 'linear' },
  { id: 'color-custom', pack: 'color', name: 'Your Colors', kind: 'color', skin: 'midnight', custom: true },

  { id: 'emoji-blossom', pack: 'emoji', name: 'Blossom', kind: 'emoji', skin: 'midnight', text: '🌸🌷🌼', layout: 'grid', bg: '#f6d6dc' },
  { id: 'emoji-space', pack: 'emoji', name: 'Space', kind: 'emoji', skin: 'midnight', text: '🚀🪐✨', layout: 'spiral', bg: '#141a3a' },
  { id: 'emoji-pets', pack: 'emoji', name: 'Pets', kind: 'emoji', skin: 'midnight', text: '🐶🐱🐰', layout: 'grid', bg: '#ffe7b8' },
  { id: 'emoji-snacks', pack: 'emoji', name: 'Snacks', kind: 'emoji', skin: 'midnight', text: '🍕🍩🍟', layout: 'rings', bg: '#ff8f6b' },
  { id: 'emoji-code', pack: 'emoji', name: 'Code', kind: 'emoji', skin: 'midnight', text: '💻⚡☕', layout: 'grid', bg: '#1d2430' },
  { id: 'emoji-games', pack: 'emoji', name: 'Games', kind: 'emoji', skin: 'midnight', text: '🎮👾🕹️', layout: 'spiral', bg: '#5b3df5' },
  { id: 'emoji-music', pack: 'emoji', name: 'Music', kind: 'emoji', skin: 'midnight', text: '🎧🎸🎹', layout: 'rings', bg: '#0f766e' },
  { id: 'emoji-custom', pack: 'emoji', name: 'Your Emoji', kind: 'emoji', skin: 'midnight', custom: true },

  { id: 'classic-midnight', pack: 'classic', name: 'Midnight', kind: 'scene', scene: 'midnight', skin: 'midnight' },
  { id: 'classic-cartoon', pack: 'classic', name: 'Cartoon', kind: 'scene', scene: 'cartoon', skin: 'cartoon' },
  { id: 'classic-blast', pack: 'classic', name: 'Blast', kind: 'scene', scene: 'blast', skin: 'blast' },
  { id: 'classic-paper', pack: 'classic', name: 'Paper', kind: 'scene', scene: 'paper', skin: 'paper' },
  { id: 'classic-zen', pack: 'classic', name: 'Zen', kind: 'scene', scene: 'zen', skin: 'zen' },
  { id: 'classic-sakura', pack: 'classic', name: 'Sakura', kind: 'scene', scene: 'sakura', skin: 'sakura' },
  { id: 'classic-retro', pack: 'classic', name: 'Retro', kind: 'scene', scene: 'retro', skin: 'retro' },
];

// what a custom Color / Emoji wallpaper starts as
const CUSTOM = {
  color: { A: [0.36, 0.42, 1], B: [0.95, 0.4, 0.75], C: [1, 0.78, 0.45], style: 'mesh' },
  emoji: { text: '😎🔥✨', layout: 'grid', bg: '#2b2f6b' },
};

const wallById = (id) => WALLS.find((w) => w.id === String(id || '').toLowerCase());
const packById = (id) => PACKS.find((p) => p.id === String(id || '').toLowerCase());
const wallsIn = (pack) => WALLS.filter((w) => w.pack === pack);

// configs from before packs existed keep the look they had
function wallForTheme(theme, planet) {
  if (theme === 'astro') return planet === 'mars' ? 'astro-mars' : planet === 'earth' ? 'astro-earth' : 'astro-moon';
  if (theme === 'weather') return 'live-sky';
  return wallById(`classic-${theme}`) ? `classic-${theme}` : 'silk-dusk';
}

module.exports = { PACKS, WALLS, CUSTOM, wallById, packById, wallsIn, wallForTheme };

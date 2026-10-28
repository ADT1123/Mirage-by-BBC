// The theme packs. Visual styling lives in src/renderer/styles/themes.css;
// this file is the catalog shared by the wallpaper, the editor and the CLI.

const THEMES = [
  {
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Soft northern lights behind frosted glass',
    swatch: ['#0b1026', '#7c5cff', '#2ee6c5'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tagline: 'Pure black, hairline type, one warm accent',
    swatch: ['#000000', '#1c1c1e', '#ff8a3d'],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'Phosphor green CRT for people who live in the CLI',
    swatch: ['#050a06', '#0f1f13', '#39ff88'],
  },
  {
    id: 'cartoon',
    name: 'Cartoon',
    tagline: 'Puffy clouds, rolling hills, chunky outlines',
    swatch: ['#7cc8ff', '#ffffff', '#ffcf3f'],
  },
  {
    id: 'blast',
    name: 'Blast',
    tagline: 'Pop-art comic panels and halftone explosions',
    swatch: ['#ffe14d', '#ff3b3b', '#111111'],
  },
  {
    id: 'weather',
    name: 'Weather',
    tagline: 'A live sky that follows your real weather and sun',
    swatch: ['#2b6cb0', '#f6ad55', '#e2e8f0'],
  },
  {
    id: 'paper',
    name: 'Paper',
    tagline: 'Warm editorial paper with serif headlines',
    swatch: ['#f3efe6', '#1d1b17', '#c2410c'],
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    tagline: 'Neon grid racing into an 80s sunset',
    swatch: ['#1a0533', '#ff2fb9', '#2de2ff'],
  },
  {
    id: 'zen',
    name: 'Zen',
    tagline: 'Sand, sage and a slowly breathing ensō',
    swatch: ['#ece6da', '#9aab8f', '#2b2a27'],
  },
  {
    id: 'retro',
    name: 'Retro',
    tagline: 'Chunky 90s desktop windows in pixel type',
    swatch: ['#008080', '#c0c0c0', '#000080'],
  },
  {
    id: 'bhakti',
    name: 'Bhakti',
    tagline: 'Diyas, marigolds and a daily public-domain darshan',
    swatch: ['#1c0806', '#e8a23a', '#f4e3c3'],
  },
  {
    id: 'pastel',
    name: 'Pastel',
    tagline: 'Soft lavender, peach and mint blooms',
    swatch: ['#f6f1fb', '#c9b8f5', '#ffc9b5'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    tagline: 'Rolling waves, a quiet moon and rising bubbles',
    swatch: ['#071a2b', '#1f6f99', '#5cf2c4'],
  },
  {
    id: 'sakura',
    name: 'Sakura',
    tagline: 'Cherry blossoms, falling petals and a red sun',
    swatch: ['#fbeff1', '#f2a7bb', '#c8364f'],
  },
  {
    id: 'orbit',
    name: 'Orbit',
    tagline: 'A tiny solar system turning on thin rings',
    swatch: ['#0a0c18', '#ffcc66', '#7aa2ff'],
  },
  {
    id: 'forest',
    name: 'Forest',
    tagline: 'Pine ridges, drifting mist and fireflies',
    swatch: ['#142026', '#3f6b4f', '#f2c94c'],
  },
  {
    id: 'astro',
    name: 'Astronomy',
    tagline: 'A slowly turning Moon, Mars or Earth, like the iPhone lock screen',
    swatch: ['#000000', '#a8a6a0', '#c4623a'],
  },
];

const byId = (id) => THEMES.find((t) => t.id === String(id || '').toLowerCase());

module.exports = { THEMES, byId };

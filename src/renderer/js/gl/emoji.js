// Emoji wallpapers, like the iPhone's: up to six emoji in a grid, rings or a spiral over a
// background color that deepens at night.

const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

export function splitEmoji(text) {
  const parts = seg ? [...seg.segment(String(text || ''))].map((s) => s.segment) : Array.from(String(text || ''));
  return parts.filter((s) => s.trim()).slice(0, 6);
}

const hexRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  const n = m ? parseInt(m[1], 16) : 0x2b2f6b;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const shade = (rgb, k) => `rgb(${rgb.map((v) => Math.round(v * k)).join(',')})`;

export function drawEmoji(canvas, opts, night = 0) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const list = splitEmoji(opts.text);
  const rgb = hexRgb(opts.bg);
  const k = 1 - night * 0.55;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, shade(rgb, k * 1.06));
  grad.addColorStop(1, shade(rgb, k * 0.82));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  if (!list.length) return;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.globalAlpha = 1 - night * 0.18;
  const font = (px) => `${Math.round(px)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  const put = (e, x, y, size, angle = 0) => {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.font = font(size);
    g.fillText(e, 0, size * 0.04);
    g.restore();
  };
  const u = H / 100;
  if (opts.layout === 'rings') {
    const cx = W / 2;
    const cy = H * 0.62;
    put(list[0], cx, cy, u * 16);
    let n = 0;
    for (let ring = 1; ring < 9; ring++) {
      const r = ring * u * 13;
      const count = Math.round((2 * Math.PI * r) / (u * 11));
      const size = u * (8 - ring * 0.35);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ring * 0.4;
        put(list[n++ % list.length], cx + Math.cos(a) * r, cy + Math.sin(a) * r, size, a + Math.PI / 2);
      }
    }
  } else if (opts.layout === 'spiral') {
    const cx = W / 2;
    const cy = H * 0.6;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 1; i < 260; i++) {
      const r = Math.sqrt(i) * u * 6.2;
      const a = i * golden;
      put(list[i % list.length], cx + Math.cos(a) * r, cy + Math.sin(a) * r, u * (2.4 + Math.sqrt(i) * 0.55), a);
    }
  } else {
    const step = u * 12;
    let row = 0;
    for (let y = -step * 0.2; y < H + step; y += step * 0.86, row++) {
      for (let x = (row % 2) * step * 0.5 - step * 0.3, i = 0; x < W + step; x += step, i++) {
        put(list[(row * 2 + i) % list.length], x, y, u * 7.4);
      }
    }
  }
  g.globalAlpha = 1;
}

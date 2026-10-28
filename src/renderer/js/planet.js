// Procedural planet surfaces for the Astronomy theme (Moon, Mars, Earth). Each texture is a
// seamless horizontal tile, so sliding it inside a sphere mask looks like slow rotation.

const W = 1400;
const H = 700;

function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

// fractal noise that wraps around horizontally (x is an angle)
function makeNoise(seed) {
  const r = rng(seed);
  const waves = Array.from({ length: 28 }, (_, i) => {
    const oct = 1 + Math.floor(i / 4);
    return { fx: oct * (1 + Math.floor(r() * 3)), fy: oct * (0.6 + r() * 2.4), px: r() * 6.28, py: r() * 6.28, a: 1 / oct };
  });
  const total = waves.reduce((s, w) => s + w.a, 0);
  return (x, y) => {
    let v = 0;
    for (const w of waves) v += Math.sin(x * w.fx + w.px + Math.sin(y * w.fy * 3 + w.py) * 0.9) * Math.cos(y * w.fy * 3.1 + w.py) * w.a;
    return 0.5 + (v / total) * 1.6;
  };
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));

// Drawing a surface takes a moment, so each planet is drawn once and kept.
export function planetTexture(kind) {
  const key = `wall-planet-v1-${kind}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) return hit;
  } catch {}
  const url = drawPlanet(kind);
  try {
    localStorage.setItem(key, url);
  } catch {}
  return url;
}

function drawPlanet(kind) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const n1 = makeNoise(kind === 'mars' ? 7 : kind === 'earth' ? 11 : 3);
  const n2 = makeNoise(kind === 'mars' ? 19 : kind === 'earth' ? 23 : 31);
  const r = rng(kind.length * 97);
  const craters = kind === 'earth' ? [] : Array.from({ length: kind === 'moon' ? 420 : 150 }, () => ({ x: r() * W, y: H * 0.08 + r() * H * 0.84, s: 2 + Math.pow(r(), 4) * 30 }));

  for (let y = 0; y < H; y++) {
    const ly = y / H;
    for (let x = 0; x < W; x++) {
      const ax = (x / W) * Math.PI * 2;
      const big = n1(ax, ly);
      const fine = n2(ax * 3, ly * 3);
      let col;
      if (kind === 'moon') {
        const maria = big < 0.42 ? 1 : big < 0.5 ? (0.5 - big) / 0.08 : 0;
        col = mix([168, 166, 160], [92, 92, 96], maria * 0.85);
        const grain = n2(ax * 9, ly * 9);
        col = col.map((v) => v * (0.84 + fine * 0.22 + grain * 0.1));
      } else if (kind === 'mars') {
        col = mix([196, 98, 54], [110, 44, 24], Math.pow(1 - big, 1.4));
        col = mix(col, [226, 156, 104], Math.max(0, fine - 0.62) * 2);
        const pole = Math.max(0, 0.11 - ly) / 0.11 + Math.max(0, ly - 0.93) / 0.07;
        col = mix(col, [240, 236, 232], pole * (0.6 + fine * 0.5));
      } else {
        const land = big > 0.56;
        col = land ? mix([66, 104, 52], [150, 130, 86], fine) : mix([16, 52, 112], [30, 90, 150], fine * 0.7);
        if (land && (ly < 0.12 || ly > 0.9)) col = [236, 240, 244];
        const cloud = Math.max(0, n2(ax * 2 + 1.3, ly * 2.2) - 0.55) * 2.6;
        col = mix(col, [245, 248, 252], Math.min(0.9, cloud));
      }
      const i = (y * W + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // craters: a dark bowl with a lit rim, wrapped at the seam
  for (const cr of craters) {
    for (const dx of [0, -W, W]) {
      const x = cr.x + dx;
      if (x < -cr.s || x > W + cr.s) continue;
      const bowl = g.createRadialGradient(x, cr.y, cr.s * 0.2, x, cr.y, cr.s);
      bowl.addColorStop(0, 'rgba(0,0,0,0.16)');
      bowl.addColorStop(0.7, 'rgba(0,0,0,0.07)');
      bowl.addColorStop(0.9, 'rgba(255,255,255,0.08)');
      bowl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = bowl;
      g.beginPath();
      g.ellipse(x, cr.y, cr.s, cr.s * 0.85, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c.toDataURL('image/jpeg', 0.9);
}

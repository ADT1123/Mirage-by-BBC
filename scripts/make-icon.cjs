// Builds every logo file from assets/logo-source.png (the black-on-white brand artwork):
//   npm run icon
// icon.png / icon.ico / tray.png: the rounded-square mark alone, on a transparent background.
// logo.png / logo-dark.png: mark plus the MIRAGE wordmark for the README (dark text / white text).
// cli/logo.mjs: the mark redrawn as terminal art for the bro CLI.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const ASSETS = path.join(__dirname, '..', 'assets');

// runs inside the page: cuts the artwork out of its white background
const PAGE = async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.width, H = img.height;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722) / 255;

  // the mark is the big dark blob; the wordmark sits under it
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H * 0.7; y++) for (let x = 0; x < W; x++) if (lum[y * W + x] < 0.3) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let t0 = H, t1 = 0, tx0 = W, tx1 = 0;
  for (let y = y1 + 20; y < H; y++) for (let x = 0; x < W; x++) if (lum[y * W + x] < 0.5) { t0 = Math.min(t0, y); t1 = Math.max(t1, y); tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); }

  // outside = light pixels reachable from the image border (the white page, not the sun)
  const out = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop();
    if (out[i] || lum[i] < 0.35) continue;
    out[i] = 1;
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < W * (H - 1)) stack.push(i + W);
  }
  // grow the outside by a pixel so the anti-aliased rim fades instead of keeping a grey halo
  const rim = out.slice();
  for (let i = W; i < W * (H - 1); i++) if (!out[i] && (out[i - 1] || out[i + 1] || out[i - W] || out[i + W])) rim[i] = 1;

  // the page becomes transparent: page pixels turn into ink (black, or `text` for the wordmark)
  // with alpha from how dark they were, so anti-aliased edges stay smooth
  const cut = (x, y, w, h, text = 0) => {
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const cg = c.getContext('2d');
    const d = cg.createImageData(w, h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const sx = x + xx, sy = y + yy, o = (yy * w + xx) * 4;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const i = sy * W + sx;
      const word = sy > y1 + 20;
      if (rim[i] || word) {
        d.data[o] = d.data[o + 1] = d.data[o + 2] = word ? text : 0;
        d.data[o + 3] = Math.round(Math.max(0, Math.min(1, (0.97 - lum[i]) / 0.97)) * 255);
      } else {
        d.data[o] = px[i * 4]; d.data[o + 1] = px[i * 4 + 1]; d.data[o + 2] = px[i * 4 + 2]; d.data[o + 3] = 255;
      }
    }
    cg.putImageData(d, 0, 0);
    return c;
  };
  const scaled = (c, size) => {
    // halve repeatedly for a clean downscale, then finish at the exact size
    let cur = c;
    while (cur.width / 2 >= size) {
      const n = Object.assign(document.createElement('canvas'), { width: cur.width / 2 | 0, height: cur.height / 2 | 0 });
      const ng = n.getContext('2d');
      ng.imageSmoothingQuality = 'high';
      ng.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    const f = Object.assign(document.createElement('canvas'), { width: size, height: Math.round((size * c.height) / c.width) });
    const fg = f.getContext('2d');
    fg.imageSmoothingQuality = 'high';
    fg.drawImage(cur, 0, 0, f.width, f.height);
    return f;
  };

  const side = Math.max(x1 - x0, y1 - y0) + 1;
  const mark = cut(x0 - 1, y0 - 1, side + 2, side + 2);
  const pad = 40;
  const lx = Math.min(x0, tx0) - pad, ly = y0 - pad, lw = Math.max(x1, tx1) - lx + pad, lh = t1 - ly + pad;
  const icons = {};
  for (const s of [16, 20, 24, 32, 40, 48, 64, 128, 256, 512]) icons[s] = scaled(mark, s).toDataURL('image/png');

  return {
    icons,
    logo: scaled(cut(lx, ly, lw, lh, 0), 900).toDataURL('image/png'),
    logoDark: scaled(cut(lx, ly, lw, lh, 255), 900).toDataURL('image/png'),
  };
};

// The mark redrawn as a pixel grid for the terminal (a straight downscale loses the water
// lines): rounded square, sun, and every other row below the horizon as a reflection line.
// . empty, d dark, l light. Proportions measured from the artwork.
function terminalMark(n = 22) {
  const rows = [];
  const R = n * 0.26, cx = n / 2, cy = n * 0.49, r = n * 0.31, horizon = n * 0.55;
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const px = x + 0.5, py = y + 0.5;
      const qx = Math.max(R - px, px - (n - R), 0), qy = Math.max(R - py, py - (n - R), 0);
      if (qx * qx + qy * qy > R * R) row += '.';
      else if (Math.hypot(px - cx, py - cy) < r && (py < horizon || (y - Math.ceil(horizon)) % 2 === 0)) row += 'l';
      else row += 'd';
    }
    rows.push(row);
  }
  return rows;
}

const png = (url) => Buffer.from(url.split(',')[1], 'base64');

// .ico with PNG frames (Windows Vista and later read these at every size)
function ico(frames) {
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(frames.length, 4);
  let at = head.length;
  frames.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8);
    head.writeUInt32LE(at, e + 12);
    at += buf.length;
  });
  return Buffer.concat([head, ...frames.map((f) => f[1])]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<body></body>');
  const src = `data:image/png;base64,${fs.readFileSync(path.join(ASSETS, 'logo-source.png')).toString('base64')}`;
  const r = await win.webContents.executeJavaScript(`(${PAGE})(${JSON.stringify(src)})`);
  const I = Object.fromEntries(Object.entries(r.icons).map(([k, v]) => [k, png(v)]));
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), I[512]);
  fs.writeFileSync(path.join(ASSETS, 'tray.png'), I[32]);
  fs.writeFileSync(path.join(ASSETS, 'tray@2x.png'), I[64]);
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico([16, 20, 24, 32, 40, 48, 64, 128, 256].map((s) => [s, I[s]])));
  fs.writeFileSync(path.join(ASSETS, 'logo.png'), png(r.logo));
  fs.writeFileSync(path.join(ASSETS, 'logo-dark.png'), png(r.logoDark));
  fs.writeFileSync(path.join(__dirname, '..', 'cli', 'logo.mjs'), `// The Mirage mark as a pixel grid for the terminal (generated by: npm run icon).\n// . empty, d dark, l light. Two rows print as one line of half blocks.\nexport const MARK = ${JSON.stringify(terminalMark(), null, 2)};\n`);
  console.log('wrote icon.png, icon.ico, tray.png, tray@2x.png, logo.png, logo-dark.png, cli/logo.mjs');
  app.quit();
});

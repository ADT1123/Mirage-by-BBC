// Real Earth for the Astronomy pack: coastlines from Natural Earth (via the world-atlas
// package) drawn into an equirectangular texture, night lights around real cities, and the
// Sun's true position, so day and night on the globe match the actual time.

const RAD = Math.PI / 180;

// [lat, lon, brightness 1..5]: big metros glow most at night
const CITIES = [
  [28.61, 77.21, 5], [19.08, 72.88, 5], [12.97, 77.59, 4], [13.08, 80.27, 4], [22.57, 88.36, 5], [17.39, 78.49, 4], [23.03, 72.58, 3], [18.52, 73.86, 3],
  [26.91, 75.79, 3], [26.85, 80.95, 3], [21.15, 79.09, 2], [22.72, 75.86, 2], [30.73, 76.78, 2], [25.59, 85.14, 2], [9.93, 76.27, 2], [11.02, 76.96, 2],
  [21.17, 72.83, 3], [15.3, 74.12, 1], [31.63, 74.87, 2], [26.14, 91.74, 1], [20.3, 85.82, 2], [27.18, 78.01, 2], [25.32, 82.97, 2], [23.26, 77.41, 2],
  [24.86, 67.0, 4], [31.55, 74.34, 4], [33.69, 73.06, 2], [23.81, 90.41, 5], [27.72, 85.32, 2], [6.93, 79.86, 2],
  [39.9, 116.4, 5], [31.23, 121.47, 5], [23.13, 113.26, 5], [22.54, 114.06, 5], [30.57, 104.07, 4], [29.56, 106.55, 4], [34.34, 108.94, 3], [30.59, 114.31, 4],
  [32.06, 118.8, 3], [36.07, 120.38, 3], [41.8, 123.43, 3], [45.8, 126.53, 2], [22.32, 114.17, 4], [25.03, 121.57, 4], [37.57, 126.98, 5], [35.18, 129.08, 3],
  [35.68, 139.69, 5], [34.69, 135.5, 4], [35.18, 136.91, 3], [43.06, 141.35, 2], [33.59, 130.4, 2], [14.6, 120.98, 4], [13.76, 100.5, 4], [10.82, 106.63, 4],
  [21.03, 105.85, 3], [3.14, 101.69, 3], [1.35, 103.82, 4], [-6.21, 106.85, 5], [-7.25, 112.75, 3], [16.84, 96.17, 2],
  [-33.87, 151.21, 4], [-37.81, 144.96, 4], [-27.47, 153.03, 2], [-31.95, 115.86, 2], [-36.85, 174.76, 2],
  [51.51, -0.13, 5], [48.86, 2.35, 5], [52.52, 13.41, 4], [40.42, -3.7, 4], [41.39, 2.17, 3], [41.9, 12.5, 3], [45.46, 9.19, 4], [52.37, 4.9, 3],
  [50.85, 4.35, 3], [48.21, 16.37, 3], [50.08, 14.44, 2], [52.23, 21.01, 3], [47.5, 19.04, 2], [55.76, 37.62, 5], [59.94, 30.31, 3], [41.01, 28.98, 5],
  [39.93, 32.86, 2], [37.98, 23.73, 2], [53.48, -2.24, 3], [55.95, -3.19, 1], [53.35, -6.26, 2], [59.33, 18.07, 2], [55.68, 12.57, 2], [60.17, 24.94, 1],
  [50.45, 30.52, 3], [44.43, 26.1, 2], [38.72, -9.14, 2], [51.23, 6.78, 3], [50.11, 8.68, 3], [48.14, 11.58, 3], [53.55, 9.99, 3], [45.76, 4.84, 2],
  [30.04, 31.24, 5], [31.2, 29.92, 3], [6.52, 3.38, 4], [-1.29, 36.82, 2], [-26.2, 28.05, 4], [-33.92, 18.42, 3], [33.57, -7.59, 3], [36.75, 3.06, 2],
  [9.03, 38.74, 2], [5.6, -0.19, 2], [-4.32, 15.31, 3], [15.5, 32.56, 2], [35.69, 51.39, 4], [33.31, 44.37, 3], [24.71, 46.68, 4], [25.2, 55.27, 4],
  [21.49, 39.19, 3], [29.38, 47.99, 2], [25.29, 51.53, 2], [32.09, 34.78, 3], [33.89, 35.5, 2], [41.31, 69.24, 2], [43.24, 76.95, 2],
  [40.71, -74.01, 5], [34.05, -118.24, 5], [41.88, -87.63, 5], [29.76, -95.37, 4], [33.45, -112.07, 3], [39.95, -75.17, 4], [32.78, -96.8, 4], [37.77, -122.42, 4],
  [47.61, -122.33, 3], [25.76, -80.19, 4], [33.75, -84.39, 4], [42.36, -71.06, 4], [38.91, -77.04, 4], [39.74, -104.99, 3], [36.17, -115.14, 2], [44.98, -93.27, 3],
  [42.33, -83.05, 3], [29.95, -90.07, 2], [35.23, -80.84, 2], [45.5, -73.57, 3], [43.65, -79.38, 4], [49.28, -123.12, 3], [51.05, -114.07, 2], [19.43, -99.13, 5],
  [20.67, -103.35, 3], [25.69, -100.32, 3], [23.13, -82.38, 2], [4.71, -74.07, 4], [10.48, -66.9, 3], [-12.05, -77.04, 4], [-0.18, -78.47, 2], [-33.45, -70.67, 4],
  [-34.6, -58.38, 5], [-23.55, -46.63, 5], [-22.91, -43.17, 4], [-19.92, -43.94, 3], [-15.79, -47.88, 3], [-30.03, -51.23, 2], [-12.97, -38.5, 3], [-3.73, -38.52, 3],
];

let landPromise = null;

function loadLand() {
  // XHR rather than fetch: the page is a file:// URL and Chromium's fetch() refuses file URLs
  landPromise ??= new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', new URL('../../../../node_modules/world-atlas/land-50m.json', import.meta.url).href);
    x.responseType = 'json';
    x.onload = () => (x.response ? resolve(x.response) : reject(new Error('no land data')));
    x.onerror = () => reject(new Error('could not read land data'));
    x.send();
  });
  return landPromise;
}

// TopoJSON → polygons of [lon, lat] rings
function polygons(topo) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
  const arcPts = (i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
  const ring = (ids) => ids.flatMap((i, k) => (k ? arcPts(i).slice(1) : arcPts(i)));
  const obj = Object.values(topo.objects)[0];
  const geoms = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
  const out = [];
  for (const g of geoms) {
    if (g.type === 'Polygon') out.push(g.arcs.map(ring));
    else if (g.type === 'MultiPolygon') for (const p of g.arcs) out.push(p.map(ring));
  }
  return out;
}

const cache = new Map();

// R = land, G = city lights, B = shallow water near the coast
export function earthTexture(width = 4096) {
  if (cache.has(width)) return cache.get(width);
  const job = loadLand().then((topo) => {
    const W = width;
    const H = width / 2;
    const px = ([lon, lat]) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
    const canvas = (blur = 0) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      if (blur) g.filter = `blur(${blur}px)`;
      return [c, g];
    };
    const polys = polygons(topo);
    const drawLand = (g) => {
      g.fillStyle = '#fff';
      for (const rings of polys) {
        g.beginPath();
        for (const r of rings) r.forEach((pt, i) => (i ? g.lineTo(...px(pt)) : g.moveTo(...px(pt))));
        g.fill('evenodd');
      }
    };
    const [landC, landG] = canvas();
    drawLand(landG);
    const [shelfC, shelfG] = canvas(W / 300);
    drawLand(shelfG);

    // lights: a dense cluster per city, then fainter sprawl wherever there is land
    const [litC, litG] = canvas();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    const s = W / 4096;
    litG.globalCompositeOperation = 'lighter';
    // a metro is a bright core, a speckle of suburbs and a few strings of towns along roads
    const dot = (x, y, a) => {
      litG.fillStyle = `rgba(255,255,255,${a})`;
      litG.fillRect(x, y, Math.max(1, (0.6 + rnd() * 0.8) * s), Math.max(1, (0.6 + rnd() * 0.8) * s));
    };
    for (const [lat, lon, w] of CITIES) {
      const [cx, cy] = px([lon, lat]);
      const spread = (1.4 + w * 1.3) * s;
      for (let i = 0; i < 40 + w * 70; i++) dot(cx + gauss() * spread, cy + gauss() * spread * 0.85, 0.2 + rnd() * 0.45);
      for (let r = 0; r < w; r++) {
        let x = cx;
        let y = cy;
        const a = rnd() * Math.PI * 2;
        for (let k = 0; k < 12 + w * 5; k++) {
          x += Math.cos(a + gauss() * 0.5) * 1.6 * s;
          y += Math.sin(a + gauss() * 0.5) * 1.6 * s;
          if (rnd() < 0.55) dot(x, y, 0.08 + rnd() * 0.2);
        }
      }
      const glow = litG.createRadialGradient(cx, cy, 0, cx, cy, spread * 1.2);
      glow.addColorStop(0, `rgba(255,255,255,${0.05 + w * 0.03})`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      litG.fillStyle = glow;
      litG.fillRect(cx - spread * 1.3, cy - spread * 1.3, spread * 2.6, spread * 2.6);
    }
    // sprawl only lands on land: test against a small copy of the land mask
    const probeC = document.createElement('canvas');
    probeC.width = 1024;
    probeC.height = 512;
    const pg = probeC.getContext('2d');
    pg.drawImage(landC, 0, 0, 1024, 512);
    const land = pg.getImageData(0, 0, 1024, 512).data;
    for (let i = 0; i < 60000 * s * s; i++) {
      const lat = -42 + rnd() * 104;
      const lon = -180 + rnd() * 360;
      if (land[(Math.floor(((90 - lat) / 180) * 512) * 1024 + Math.floor(((lon + 180) / 360) * 1024)) * 4] < 128) continue;
      const [x, y] = px([lon, lat]);
      litG.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.1})`;
      litG.fillRect(x, y, Math.max(1, s), Math.max(1, s));
    }

    // pack the three masks into R, G and B on the GPU (multiply by a pure color, then add)
    const tint = (src, color) => {
      const [c, g] = canvas();
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = color;
      g.fillRect(0, 0, W, H);
      return c;
    };
    const [outC, outG] = canvas();
    outG.drawImage(tint(landC, '#ff0000'), 0, 0);
    outG.globalCompositeOperation = 'lighter';
    outG.drawImage(tint(litC, '#00ff00'), 0, 0);
    outG.drawImage(tint(shelfC, '#0000ff'), 0, 0);
    return outC;
  });
  cache.set(width, job);
  return job;
}

const julian = (date) => date.getTime() / 864e5 + 2440587.5;

// the point on Earth where the Sun is straight overhead right now
export function subsolar(date = new Date()) {
  const d = julian(date) - 2451545;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  const lon = ((((ra - gmst) % 360) + 540) % 360) - 180;
  return { lat: dec / RAD, lon };
}

export const toVec = (lat, lon) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];

// view → earth rotation that puts (lat, lon) at the point `tilt` radians above the disc centre
export function viewRotation(lat, lon, tilt = 0) {
  const rx = (a) => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
  const ry = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
  // column-major 3x3 multiply
  const mul = (a, b) => {
    const o = new Array(9).fill(0);
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) o[c * 3 + r] += a[k * 3 + r] * b[c * 3 + k];
    return o;
  };
  return mul(ry(lon * RAD), mul(rx(-lat * RAD), rx(tilt)));
}

// best guess at where you are: the weather's location, your city, or your time zone
export function homeFor(ctx) {
  const k = ctx.store?.weather?.key;
  if (k && /^-?[\d.]+,-?[\d.]+$/.test(k)) {
    const [lat, lon] = k.split(',').map(Number);
    return { lat, lon, name: ctx.store.weather.city || ctx.cfg.city?.name || '' };
  }
  if (ctx.cfg.city) return { lat: ctx.cfg.city.lat, lon: ctx.cfg.city.lon, name: ctx.cfg.city.name };
  return { lat: 22, lon: -new Date().getTimezoneOffset() / 4, name: '' };
}

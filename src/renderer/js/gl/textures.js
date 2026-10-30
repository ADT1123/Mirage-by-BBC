// Planet maps (Solar System Scope, CC BY 4.0). The 2k set ships in assets/planets; the 8k
// originals are fetched once by the main process when they're needed (High quality, or the
// sharp patch around your city) and kept on disk. Everything falls back to the 2k set.

const LOCAL = new URL('../../../../assets/planets/', import.meta.url).href;

// XHR rather than fetch (fetch refuses file:// URLs); a decoded blob never taints WebGL
function blob(url) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = 'blob';
    x.onload = () => (x.response && x.response.size ? resolve(x.response) : reject(new Error(`empty ${url}`)));
    x.onerror = () => reject(new Error(`could not read ${url}`));
    x.send();
  });
}

const file = (name) => `${name}${name === 'saturn_ring_alpha' ? '.png' : '.jpg'}`;
const cache = new Map();

// the bundled 2k map, decoded once per page
export function local(name) {
  const key = `2k|${name}`;
  if (!cache.has(key)) cache.set(key, blob(LOCAL + file(name)).then((b) => createImageBitmap(b)));
  return cache.get(key);
}

// the 8k original as a blob (downloaded on first use); null when offline or unavailable
const big = new Map();
export function hires(name) {
  if (!big.has(name)) {
    const job = (window.wall?.planetMap ? window.wall.planetMap(name) : Promise.resolve(null))
      .then((url) => (url ? blob(url) : null))
      .catch(() => null);
    big.set(name, job);
    job.then((b) => b || big.delete(name)); // try again next time
  }
  return big.get(name);
}

// the whole map at `width` (for High: 8k scaled to 4k, which every decent GPU takes)
export async function whole(name, width) {
  const b = await hires(name);
  if (!b) return null;
  const bmp = await createImageBitmap(b);
  if (bmp.width <= width) return bmp;
  const out = await createImageBitmap(bmp, { resizeWidth: width, resizeHeight: Math.round((bmp.height * width) / bmp.width), resizeQuality: 'high' });
  bmp.close();
  return out;
}

// width and height from a JPEG/PNG header
const sizes = new Map();
async function jpegSize(b) {
  const v = new DataView(await b.slice(0, Math.min(b.size, 1 << 16)).arrayBuffer());
  if (v.getUint32(0) === 0x89504e47) return { w: v.getUint32(16), h: v.getUint32(20) };
  for (let i = 2; i + 9 < v.byteLength; ) {
    if (v.getUint8(i) !== 0xff) break;
    const m = v.getUint8(i + 1);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: v.getUint16(i + 7), h: v.getUint16(i + 5) };
    i += 2 + v.getUint16(i + 2);
  }
  return { w: 0, h: 0 };
}

// A square patch of the 8k map covering lon [lon0, lon0 + span] and lat [lat1 - spanLat, lat1]
// (degrees), wrapping around the date line. Returns a canvas of n x n pixels.
export async function patch(name, box, n) {
  const b = await hires(name);
  if (!b) return null;
  // the map's size, without decoding all of it on this thread
  const dims = sizes.get(name) || (await jpegSize(b));
  sizes.set(name, dims);
  const sx0 = (((box.lon0 + 180) / 360) * dims.w + dims.w) % dims.w;
  const sw0 = (box.span / 360) * dims.w;
  if (dims.w && sx0 + sw0 <= dims.w) {
    // the usual case: crop and scale in the image decoder, off the main thread (no stutter)
    const sy0 = ((90 - box.lat1) / 180) * dims.h;
    const sh0 = (box.spanLat / 180) * dims.h;
    return createImageBitmap(b, Math.round(sx0), Math.round(sy0), Math.round(sw0), Math.round(sh0), { resizeWidth: n, resizeHeight: n, resizeQuality: 'high' });
  }
  // the patch crosses the date line: stitch the two halves
  const bmp = await createImageBitmap(b);
  const W = bmp.width;
  const H = bmp.height;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const sx = (((box.lon0 + 180) / 360) * W + W) % W;
  const sw = (box.span / 360) * W;
  const sy = ((90 - box.lat1) / 180) * H;
  const sh = (box.spanLat / 180) * H;
  const first = Math.min(sw, W - sx);
  g.drawImage(bmp, sx, sy, first, sh, 0, 0, (first / sw) * n, n);
  if (first < sw) g.drawImage(bmp, 0, sy, sw - first, sh, (first / sw) * n, 0, ((sw - first) / sw) * n, n);
  bmp.close();
  return c;
}

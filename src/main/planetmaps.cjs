// The 8k planet maps (Solar System Scope, CC BY 4.0, mirrored on Wikimedia Commons) for High
// quality and the close-up over your city. Each is downloaded once, only when a wallpaper
// asks for it, and kept in the app's data folder. The 2k set ships with the app.

const fs = require('fs');
const path = require('path');
const { app, net } = require('electron');
const { pathToFileURL } = require('url');

const BASE = 'https://upload.wikimedia.org/wikipedia/commons/';
const FILES = {
  earth_daymap: '0/04/Solarsystemscope_texture_8k_earth_daymap.jpg',
  earth_nightmap: 'b/b3/Solarsystemscope_texture_8k_earth_nightmap.jpg',
  earth_clouds: '7/7a/Solarsystemscope_texture_8k_earth_clouds.jpg',
  moon: 'd/d1/Solarsystemscope_texture_8k_moon.jpg',
  mars: '7/70/Solarsystemscope_texture_8k_mars.jpg',
  mercury: '2/27/Solarsystemscope_texture_8k_mercury.jpg',
  venus_atmosphere: '5/57/Solarsystemscope_texture_4k_venus_atmosphere.jpg',
  jupiter: '5/5e/Solarsystemscope_texture_8k_jupiter.jpg',
  saturn: '1/1e/Solarsystemscope_texture_8k_saturn.jpg',
  saturn_ring_alpha: '2/29/Solarsystemscope_texture_8k_saturn_ring_alpha.png',
  sun: 'a/a4/Solarsystemscope_texture_8k_sun.jpg',
  stars_milky_way: '8/85/Solarsystemscope_texture_8k_stars_milky_way.jpg',
};
// Wikimedia asks every client to say who it is
const UA = 'MirageWallpaper/1.0 (https://github.com/ADT1123/Mirage-by-BBC)';

const dir = () => path.join(app.getPath('userData'), 'planets');
const pending = new Map();

async function download(name) {
  const dest = path.join(dir(), path.basename(FILES[name]));
  if (fs.existsSync(dest)) return dest;
  fs.mkdirSync(dir(), { recursive: true });
  const res = await net.fetch(BASE + FILES[name], { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const part = `${dest}.part`;
  fs.writeFileSync(part, buf);
  fs.renameSync(part, dest);
  return dest;
}

// file:// URL of the 8k map, or null (unknown name, offline)
function get(name) {
  if (!FILES[name]) return Promise.resolve(null);
  if (!pending.has(name)) {
    const job = download(name)
      .then((p) => pathToFileURL(p).href)
      .catch((e) => {
        console.error(`[planets] ${name}: ${e.message}`);
        pending.delete(name);
        return null;
      });
    pending.set(name, job);
  }
  return pending.get(name);
}

module.exports = { get };

// Mounts a pack wallpaper (live 3D shader, Color gradient, Astronomy body or Emoji) into
// the scene layer, and renders still thumbnails of them for the pack browser.

import { VERT, COMMON, SHADERS, RES } from './shaders.js';
import { ASTRO_SHADERS, DERIVATIVES, BODIES, frameState, view, viewsFor, startView, lerpView, pulledBack, onBody, regionFor, sized } from './astro.js';
import * as mood from './sc-mood.js';
import * as galaxy from './sc-galaxy.js';
import * as liquid from './sc-liquid.js';
import { mountInk } from './fluid.js';
import { local, whole, patch } from './textures.js';
import { subsolar, toVec, homeFor } from './earth.js';
import { drawEmoji } from './emoji.js';

const STYLE = { mesh: 0, linear: 1, radial: 2 };
const ALL = { ...SHADERS, ...ASTRO_SHADERS, ...mood.SCENES, ...galaxy.SCENES, ...liquid.SCENES };
const META = { ...mood.META, ...galaxy.META, ...liquid.META };
// Frames a second while nobody touches the desktop. These scenes all move slowly, so this looks
// the same as 60 at a fraction of the cost; moving the mouse or clicking brings full speed back
// for a moment (ACTIVE_MS). Scenes with hard edges keep a minimum sharpness (FLOOR).
const FPS = { silk: 30, dots: 30, neon: 30, gradient: 20, aurora: 24, glass: 30, chrome: 30, clay: 24, dunes: 24 };
const ACTIVE_MS = 2000;
const FLOOR = { glass: 0.75, chrome: 0.75, clay: 0.8, earth: 0.85, body: 0.85, sun: 0.8, earthrise: 0.6 };
const SHARE = { ...RES, earth: 1, body: 1, sun: 0.9, earthrise: 1 };
// frames per second for a planet sitting still (clouds drift and stars twinkle, slowly)
const IDLE = { earth: 10, body: 8, sun: 15, earthrise: 6 };
for (const [k, m] of Object.entries(META)) {
  if (m.fps) FPS[k] = m.fps;
  if (m.res) SHARE[k] = m.res;
  if (m.floor) FLOOR[k] = m.floor;
}
const ZERO = [0, 0, 0];

// Quality tiers (Settings > Wallpaper quality). load: the share of the GPU's time the wallpaper
// may use. The resolution climbs to the sharpest that fits it (full screen on a decent GPU), so the
// wallpaper never weighs on the PC. Slow scenes draw fewer frames, so each frame may cost more.
const TIERS = {
  still: { q: 0, dpr: 1, res: 0.5, fps: 1 / 20, load: 0 }, // no GPU at all: a still picture
  low: { q: 0, dpr: 1, res: 0.75, fps: 30, load: 0.06 },
  balanced: { q: 1, dpr: 2, res: 1, fps: 60, load: 0.12 },
  high: { q: 2, dpr: 2, res: 1, fps: 60, load: 0.18 },
};
// Auto: a dedicated GPU gets High, built-in graphics Balanced, battery saver Low. With no
// usable GPU (old driver, VM, remote desktop) Chrome draws WebGL on the CPU: keep it still.
export function tierOf(cfg, gpu) {
  if (gpu === 'none') return 'still';
  const q = cfg?.wallQuality;
  if (TIERS[q]) return q;
  if (document.documentElement.dataset.perf === 'saver') return 'low';
  return gpu === 'dedicated' ? 'high' : 'balanced';
}

const shaderOf = (wall) => {
  if (wall.kind === 'color') return 'gradient';
  if (wall.kind === 'astro') return BODIES[wall.body]?.shader || 'body';
  return wall.shader;
};

// the colors a wallpaper paints with; "Your Colors" / "Your Emoji" read the config
export function looksOf(wall, cfg) {
  if (!wall.custom) return wall;
  return { ...wall, ...(cfg?.wallCustom?.[wall.kind] || {}) };
}

const nightNow = () => (document.documentElement.dataset.appearance === 'dark' ? 1 : 0);

// real sun height where you are, time of day, and the weather
function envOf(ctx) {
  const home = homeFor(ctx);
  const now = ctx.now?.() || new Date();
  const s = subsolar(now);
  const a = toVec(s.lat, s.lon);
  const b = toVec(home.lat, home.lon);
  const w = ctx.store?.weather;
  const kind = w?.kind || '';
  const rain = kind === 'storm' ? 1 : kind === 'rain' ? (w.code >= 51 && w.code <= 57 ? 0.35 : 0.7) : 0;
  return [a[0] * b[0] + a[1] * b[1] + a[2] * b[2], (now.getHours() * 60 + now.getMinutes()) / 1440, rain, kind === 'snow' ? 1 : 0];
}

// which GPU this is: none (software), integrated, or dedicated
function gpuOf(gl) {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const card = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(card) ? 'none' : /nvidia|geforce|quadro|rtx|gtx|radeon\s*(\(tm\)\s*)?(rx|pro)|arc\(tm\) a|\barc a\d/i.test(card) ? 'dedicated' : 'integrated';
}

function makeRenderer(gl) {
  const progs = {};
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const deriv = !!gl.getExtension('OES_standard_derivatives');
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const textures = new Map(); // key -> { tex, src, w, h }
  const gpu = gpuOf(gl);
  // GPU timing, so the resolution can follow what the card really costs
  const timer = gl.getExtension('EXT_disjoint_timer_query');
  let query = null;
  // compile shaders in the background where the driver can (Windows' shader compiler can
  // otherwise freeze the page for a moment when a wallpaper is picked)
  const parallel = gl.getExtension('KHR_parallel_shader_compile');

  // the program for a scene, or null while it is still compiling (or if it failed)
  function program(name) {
    let pr = progs[name];
    if (pr === undefined) {
      if (!ALL[name]) return (progs[name] = null);
      const make = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      const ext = DERIVATIVES.has(name) && deriv ? '#extension GL_OES_standard_derivatives : enable\n' : '';
      const v = make(gl.VERTEX_SHADER, VERT);
      const f = make(gl.FRAGMENT_SHADER, ext + COMMON + ALL[name]);
      const p = gl.createProgram();
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.bindAttribLocation(p, 0, 'a');
      gl.linkProgram(p);
      pr = progs[name] = { p, v, f, pending: true };
    }
    if (!pr?.pending) return pr;
    if (parallel && !gl.getProgramParameter(pr.p, parallel.COMPLETION_STATUS_KHR)) return null;
    // finished: check it and learn its uniforms
    if (!gl.getProgramParameter(pr.p, gl.LINK_STATUS)) {
      console.error(`[wall] shader ${name}: ${gl.getShaderInfoLog(pr.f) || gl.getProgramInfoLog(pr.p)}`);
      return (progs[name] = null);
    }
    const u = {};
    const samplers = [];
    for (let i = 0; i < gl.getProgramParameter(pr.p, gl.ACTIVE_UNIFORMS); i++) {
      const info = gl.getActiveUniform(pr.p, i);
      u[info.name] = { loc: gl.getUniformLocation(pr.p, info.name), type: info.type };
      if (info.type === gl.SAMPLER_2D) samplers.push(info.name);
    }
    return (progs[name] = { p: pr.p, u, samplers });
  }
  // resolves once a shader is ready to draw (false if it failed)
  async function compiled(name) {
    for (let i = 0; i < 300; i++) {
      if (program(name)) return true;
      if (progs[name] === null) return false;
      await new Promise((r) => setTimeout(r, 16));
    }
    return false;
  }

  function set(un, value) {
    if (!un || value == null) return;
    const { loc, type } = un;
    if (type === gl.FLOAT) gl.uniform1f(loc, value);
    else if (type === gl.FLOAT_VEC2) gl.uniform2fv(loc, value);
    else if (type === gl.FLOAT_VEC3) gl.uniform3fv(loc, value);
    else if (type === gl.FLOAT_VEC4) gl.uniform4fv(loc, value);
    else if (type === gl.FLOAT_MAT3) gl.uniformMatrix3fv(loc, false, value);
  }

  return {
    gl,
    maxTex,
    gpu,
    timed: !!timer,
    compiled,
    has: (key) => textures.has(key),
    size: (key) => textures.get(key),
    // upload an image/canvas under a name; repeats with the same source are free
    texture(key, src, { wrap = 'repeat' } = {}) {
      let t = textures.get(key);
      if (t?.src === src) return;
      t ??= { tex: gl.createTexture() };
      t.src = src;
      t.w = src.width;
      t.h = src.height;
      textures.set(key, t);
      const pot = (n) => (n & (n - 1)) === 0;
      const mips = pot(t.w) && pot(t.h);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (mips) gl.generateMipmap(gl.TEXTURE_2D);
      if (aniso && mips) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mips && wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
    draw(name, w, h, v) {
      const pr = program(name);
      if (!pr) return false;
      const { u } = pr;
      gl.useProgram(pr.p);
      gl.viewport(0, 0, w, h);
      set(u.uRes, [w, h]);
      set(u.uTime, v.time);
      set(u.uMouse, v.mouse);
      set(u.uNight, v.night);
      set(u.uA, v.A || ZERO);
      set(u.uB, v.B || ZERO);
      set(u.uC, v.C || ZERO);
      set(u.uStyle, STYLE[v.style] ?? 0);
      set(u.uQ, v.q ?? 1);
      set(u.uEnv, v.env || [0.5, 0.5, 0, 0]);
      set(u.uTap, v.tap || [0, 0, 99, 0]);
      set(u.uPtr, v.ptr || [9, 9, 0, 0]);
      for (const [k, val] of Object.entries(v.u || {})) set(u[k], val);
      pr.samplers.forEach((s, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, textures.get(v.tex?.[s])?.tex || null);
        gl.uniform1i(u[s].loc, i);
      });
      // time one frame at a time on the GPU (the answer arrives a frame or two later)
      const timing = v.timed && timer && !query;
      if (timing) {
        query = timer.createQueryEXT();
        timer.beginQueryEXT(timer.TIME_ELAPSED_EXT, query);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (timing) timer.endQueryEXT(timer.TIME_ELAPSED_EXT);
      return true;
    },
    // milliseconds the last timed frame took on the GPU, once known (null until then)
    gpuTime() {
      if (!query || !timer.getQueryObjectEXT(query, timer.QUERY_RESULT_AVAILABLE_EXT)) return null;
      const ns = timer.getQueryObjectEXT(query, timer.QUERY_RESULT_EXT);
      const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
      timer.deleteQueryEXT(query);
      query = null;
      return disjoint ? null : ns / 1e6;
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

// ------------------------------------------------------------------ planet maps

const tick = () => new Promise((r) => setTimeout(r, 0));

// which uniform reads which texture
const EARTH_TEX = { uDay: 'day', uNit: 'nit', uCld: 'cld', uDayR: 'dayR', uNitR: 'nitR', uCldR: 'cldR', uSkyT: 'sky' };
const BODY_TEX = { uAlb: 'alb', uRingT: 'ring', uSkyT: 'sky' };
const RISE_TEX = { ...EARTH_TEX, uAlb: 'alb' };
const texOf = (body) => ({ earth: EARTH_TEX, earthrise: RISE_TEX })[BODIES[body].shader] || BODY_TEX;

// the ring map is a 2048x125 strip; squeeze it to a power of two so it can be mipmapped
const strips = new WeakMap();
function strip(img) {
  if (!strips.has(img)) {
    const c = document.createElement('canvas');
    c.width = 2 ** Math.round(Math.log2(img.width));
    c.height = 4;
    c.getContext('2d').drawImage(img, 0, 0, c.width, 4);
    strips.set(img, c);
  }
  return strips.get(img);
}

// load the maps a body needs into a renderer: the bundled 2k set first, then (High) the 8k
async function loadBody(R, body, tier, alive = () => true) {
  const B = BODIES[body];
  const sky = local('stars_milky_way').then((b) => alive() && R.texture('sky', b));
  if (B.maps) {
    const [d, n, c] = await Promise.all(B.maps.map(local));
    // one upload per frame, so picking a wallpaper doesn't hitch
    for (const [key, img] of [['day', d], ['nit', n], ['cld', c]]) {
      if (!alive()) return;
      R.texture(key, img);
      await tick();
    }
  }
  if (B.map) {
    const a = await local(B.map);
    if (!alive()) return;
    R.texture('alb', a);
    if (B.rings) R.texture('ring', strip(await local('saturn_ring_alpha')), { wrap: 'clamp' });
    if (tier === 'high' && R.maxTex >= 4096) {
      whole(B.map, 4096).then((img) => img && alive() && R.texture('alb', img));
      if (B.rings) whole('saturn_ring_alpha', 4096).then((img) => img && alive() && R.texture('ring', strip(img), { wrap: 'clamp' }));
    }
  }
  await sky;
}

// the sharp 8k patch around your location (Earth); resolves to the uRegion uniform
async function loadRegion(R, home, close, tier, alive, onSwap, calm = () => true) {
  const box = regionFor(home, close, tier);
  if (!box || R.maxTex < box.n) return null;
  // one at a time: each 8k map is ~130 MB while it's being decoded
  const maps = [];
  for (const [i, m] of ['earth_daymap', 'earth_nightmap', 'earth_clouds'].entries()) maps.push(await patch(m, box, i === 2 && box.n > 2048 ? 2048 : box.n));
  if (!alive() || maps.some((m) => !m)) return null;
  // big uploads stall a frame or two: wait until the camera isn't moving
  while (alive() && !calm()) await new Promise((r) => setTimeout(r, 120));
  onSwap?.();
  for (const [i, key] of ['dayR', 'nitR', 'cldR'].entries()) {
    if (!alive()) return null;
    R.texture(key, maps[i], { wrap: 'clamp' });
    maps[i].close?.(); // the GPU has its own copy now
    await tick();
  }
  const r = Math.PI / 180;
  return [box.lon0 * r, box.lat1 * r, box.span * r, box.spanLat * r];
}

// ------------------------------------------------------------------ live wallpaper

export function mountWall(host, wall, ctx0) {
  let ctx = ctx0;
  host.innerHTML = `<div class="sc sc-gl" data-kind="${wall.kind}"><canvas></canvas><div class="gl-cap"></div></div>`;
  const canvas = host.querySelector('canvas');
  const cap = host.querySelector('.gl-cap');
  if (wall.kind === 'emoji') return mountEmoji(canvas, wall, () => ctx, (n) => (ctx = n));

  let gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return fallback(host, wall, ctx);
  if (wall.shader === 'ink') {
    const ink = inkSim(canvas, gl, wall, () => ctx);
    if (ink) {
      return {
        update(next) {
          ctx = next;
        },
        destroy: ink.destroy,
      };
    }
  }
  let R = makeRenderer(gl);
  const name = shaderOf(wall);
  const astro = wall.kind === 'astro';
  const body = wall.body;
  let tier = tierOf(ctx.cfg, R.gpu);
  let alive = true;
  let ready = !astro;
  let region = null;
  let regionKey = '';

  // the camera: a target framing, and an eased move toward it
  let viewName = astro ? startView(body) : null;
  const target = () => sized(body, view(viewName));
  let cam = astro ? target() : null;
  let move = null; // { from, to, start, dur }
  // fresh: draw the first frame of a move right away, not at the next idle tick
  const fly = (from, to, dur) => (move = { from, to, start: performance.now(), dur, fresh: true });
  if (astro && ctx.cfg.motion !== false) fly(pulledBack(target()), target(), 1800);

  const loadAll = () => {
    if (!astro) return;
    loadBody(R, body, tier, () => alive)
      .then(() => {
        ready = true;
        if (BODIES[body].shader === 'earth') refreshRegion();
      })
      .catch((e) => console.error('[wall] maps:', e.message));
  };
  const refreshRegion = () => {
    const home = homeFor(ctx);
    const close = viewName === 'city';
    const key = `${tier}|${home.lat.toFixed(1)},${home.lon.toFixed(1)}`;
    if (key === regionKey) return;
    regionKey = key;
    loadRegion(R, home, close, tier, () => alive && regionKey === key, () => (region = null), () => !move).then((r) => {
      if (regionKey === key) region = r;
    });
  };
  loadAll();
  R.compiled(name);

  let night = nightNow();
  // start a little low and let the frame-rate check raise it: a first frame at full size
  // on a slow GPU can stall long enough for the driver to reset
  let scale = Math.max(0.75, FLOOR[name] || 0);
  let time = 12;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let frames = 0;
  let lastFps = 0;
  let gpuMs = null; // what a frame costs on the GPU at the current resolution
  let env = envOf(ctx);
  let envAt = 0;
  let state = null;
  const tap = [0, 0, 99, 0];
  let tapAt = -1e9;
  let inputAt = -1e9; // the last mouse move or click: full frame rate for a moment after it
  // the cursor (p units) and its velocity, for the scenes that react to it
  const ptr = [9, 9, 0, 0];
  const ptrTo = [9, 9];
  const mouse = [0, 0];
  const mouseTo = [0, 0];
  const toP = (e) => [(e.clientX - canvas.clientWidth / 2) / canvas.clientHeight, (canvas.clientHeight / 2 - e.clientY) / canvas.clientHeight];
  const onMove = (e) => {
    if (e.clientX < 0) return;
    inputAt = performance.now();
    wakeSoon();
    [ptrTo[0], ptrTo[1]] = toP(e);
    mouseTo[0] = (e.clientX / innerWidth) * 2 - 1;
    mouseTo[1] = -((e.clientY / innerHeight) * 2 - 1);
  };
  // clicks on the bare desktop: ripples for the scenes; on a planet, zoom in or back out
  const onClick = (e) => {
    if (e.target.closest?.('.w, .popup, .mb, button, a, input')) return;
    const p = toP(e);
    tap[0] = p[0];
    tap[1] = p[1];
    tapAt = inputAt = performance.now();
    wakeSoon();
    if (astro && cam && (BODIES[body].scene || onBody(cam, p, [mouse[0] * 0.012, cam.shiftY + mouse[1] * 0.008]))) {
      const views = viewsFor(body);
      viewName = views[(views.indexOf(viewName) + 1) % views.length];
      fly(cam, target(), 2200);
    }
  };
  window.addEventListener('mousemove', onMove);
  document.addEventListener('click', onClick);
  // coming back to the desktop: the planet zooms in like an iPhone unlocking
  const watch = new MutationObserver(() => {
    if (astro && !document.documentElement.hasAttribute('data-paused') && ctx.cfg.motion !== false) fly(pulledBack(target()), target(), 1500);
  });
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-paused'] });

  function size() {
    const T = TIERS[tier];
    const dpr = Math.min(window.devicePixelRatio || 1, T.dpr);
    // a blurred wallpaper (Control Center) hides fine detail, so it can render smaller
    const soft = 1 / (1 + (ctx.cfg.wallBlur || 0) / 25);
    const f = Math.min(1, (SHARE[name] ?? 0.6) * scale * T.res) * soft;
    const w = Math.max(2, Math.round(canvas.clientWidth * dpr * f));
    const h = Math.max(2, Math.round(canvas.clientHeight * dpr * f));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Frames are scheduled, not polled: between frames the page sleeps on a timer instead of waking
  // on every screen refresh (60 to 165 times a second on laptops), which keeps the CPU idle.
  let wake = 0;
  let due = 0;
  function schedule(ms) {
    clearTimeout(wake);
    cancelAnimationFrame(raf);
    due = performance.now() + ms;
    if (ms > 20) wake = setTimeout(() => (raf = requestAnimationFrame(frame)), ms - 18);
    else raf = requestAnimationFrame(frame);
  }
  // input during a long sleep (a planet at a few frames a second): answer it right away
  const wakeSoon = () => due - performance.now() > 30 && schedule(0);
  function frame(t) {
    if (!alive) return;
    schedule(render(t));
  }

  // draws a frame if one is due; returns how long until the next (ms)
  function render(t) {
    const motion = ctx.cfg.motion !== false;
    const T = TIERS[tier];
    const dark = nightNow();
    const easing = Math.abs(dark - night) > 0.001;
    // planets barely change on their own: a few frames a second while still, full speed only
    // while the camera flies or the view follows the mouse
    const settling = !!move || Math.abs(mouseTo[0] * 0.6 - mouse[0]) + Math.abs(mouseTo[1] * 0.6 - mouse[1]) > 0.002;
    // no animation (switched off, or no GPU): a fresh still every so often, smooth only for camera moves
    const still = !motion || tier === 'still';
    const active = performance.now() - inputAt < ACTIVE_MS;
    const fps = still ? (move ? 30 : tier === 'still' ? T.fps : 1 / 30) : astro ? (settling ? T.fps : IDLE[name] || 8) : Math.min(active ? 60 : FPS[name] || 30, T.fps);
    if (fps !== lastFps) {
      lastFps = fps;
      acc = 0;
      frames = 0;
    }
    if (last && t - last < 1000 / fps - 3 && !easing && !move?.fresh) return last + 1000 / fps - t;
    if (move) move.fresh = false;
    const dt = last ? Math.min(0.25, (t - last) / 1000) : 0;
    last = t;
    if (motion) time += dt;
    night += (dark - night) * (motion ? Math.min(1, dt * 1.6) : 1);
    if (!easing) night = dark;
    const k = Math.min(1, dt * 2);
    mouse[0] += (mouseTo[0] * 0.6 - mouse[0]) * k;
    mouse[1] += (mouseTo[1] * 0.6 - mouse[1]) * k;
    if (t - envAt > 30000) {
      env = envOf(ctx);
      envAt = t;
    }
    tap[2] = (t - tapAt) / 1000;
    if (ptr[0] === 9) [ptr[0], ptr[1]] = ptrTo;
    else if (dt > 0) {
      const kp = Math.min(1, dt * 14);
      const vx = ((ptrTo[0] - ptr[0]) * kp) / dt;
      const vy = ((ptrTo[1] - ptr[1]) * kp) / dt;
      ptr[0] += vx * dt;
      ptr[1] += vy * dt;
      const kv = Math.min(1, dt * 5);
      ptr[2] += (vx - ptr[2]) * kv;
      ptr[3] += (vy - ptr[3]) * kv;
    }
    size();
    const look = looksOf(wall, ctx.cfg);
    const v = { time, mouse, night, A: look.A, B: look.B, C: look.C, style: look.style, q: T.q, env, tap, ptr };
    if (astro) {
      if (!ready) return 50;
      if (move) {
        const p = Math.min(1, (performance.now() - move.start) / move.dur);
        const e = 1 - Math.pow(1 - p, 3);
        cam = lerpView(move.from, move.to, e);
        if (p >= 1) move = null;
      }
      state = frameState(body, cam, ctx, time, [canvas.width, canvas.height], mouse);
      if (cap.textContent !== state.caption) cap.textContent = state.caption;
      const u = { ...state.u };
      if (BODIES[body].shader === 'earth') u.uRegion = region || [0, 0, 0, 0];
      else {
        const a = R.size('alb');
        if (a) u.uTexel = [1 / a.w, 1 / a.h];
      }
      v.u = u;
      v.tex = texOf(body);
    }
    v.timed = !still;
    R.draw(name, canvas.width, canvas.height, v);
    // Resolution follows the GPU: as sharp as fits the tier's time budget per frame, up to full
    // screen resolution. Without GPU timing, fall back to watching the frame rate.
    if (!still) {
      const g = R.gpuTime();
      if (g != null) gpuMs = gpuMs == null ? g : gpuMs * 0.7 + g * 0.3;
      acc += dt;
      frames++;
      // never resize the canvas mid-move or while you're moving the mouse (that drops frames);
      // adjust once things are still, against the idle frame rate
      if (acc > 1.2 && !move && !settling && !active) {
        const top = 1 / ((SHARE[name] ?? 0.6) * T.res);
        const floor = FLOOR[name] || 0.4;
        const budget = (T.load * 1000) / fps; // GPU ms a frame may take
        const was = scale;
        if (gpuMs != null) {
          if (gpuMs > budget * 1.15 && scale > floor) scale = Math.max(floor, scale * 0.88);
          else if (gpuMs < budget * 0.75 && scale < top) scale = Math.min(top, scale * 1.12);
        } else {
          const avg = acc / frames;
          if (avg > 1.7 / fps && scale > floor) scale *= 0.85;
          else if (avg < 1.15 / fps && scale < top) scale = Math.min(top, scale * 1.05);
        }
        if (scale !== was) gpuMs = null;
        acc = 0;
        frames = 0;
      }
    }
    canvas.gpuMs = gpuMs; // for performance tests
    return 1000 / fps;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    clearTimeout(wake);
    cancelAnimationFrame(raf);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    R = makeRenderer(gl);
    ready = !astro;
    regionKey = '';
    region = null;
    loadAll();
    last = 0;
    schedule(0);
  });
  schedule(0);

  return {
    update(next) {
      ctx = next;
      last = 0;
      schedule(0);
      const t = tierOf(ctx.cfg, R.gpu);
      if (t !== tier) {
        tier = t;
        loadAll();
      }
      if (astro && BODIES[body].shader === 'earth' && ready) refreshRegion();
    },
    destroy() {
      alive = false;
      clearTimeout(wake);
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('click', onClick);
      watch.disconnect();
      R.dispose();
      R = null;
      gl = null;
    },
  };
}

function inkSim(canvas, gl, wall, getCtx) {
  const tier = tierOf(getCtx().cfg, gpuOf(gl));
  if (tier === 'still') return null;
  return mountInk(canvas, gl, {
    tier,
    look: () => looksOf(wall, getCtx().cfg),
    night: nightNow,
    motion: () => getCtx().cfg.motion !== false,
  });
}

function mountEmoji(canvas, wall, getCtx, setCtx) {
  let key = '';
  const paint = () => {
    const look = looksOf(wall, getCtx().cfg);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    const k = `${w}x${h}|${look.text}|${look.layout}|${look.bg}|${nightNow()}`;
    if (k === key) return;
    key = k;
    canvas.width = w;
    canvas.height = h;
    drawEmoji(canvas, look, nightNow());
  };
  requestAnimationFrame(paint);
  const timer = setInterval(paint, 1000);
  window.addEventListener('resize', paint);
  return {
    update(next) {
      setCtx(next);
      paint();
    },
    destroy() {
      clearInterval(timer);
      window.removeEventListener('resize', paint);
    },
  };
}

// no WebGL (hardware acceleration off): a still gradient in the wallpaper's colors
function fallback(host, wall, ctx) {
  const look = looksOf(wall, ctx.cfg);
  const c = (v) => `rgb(${(v || ZERO).map((x) => Math.round(Math.min(1, x) * 255)).join(',')})`;
  host.firstElementChild.style.background = wall.body ? '#000' : `linear-gradient(160deg, ${c(look.A)}, ${c(look.B)} 55%, ${c(look.C)})`;
  return { update() {}, destroy() {} };
}

// ------------------------------------------------------------------ thumbnails

let thumbR = null;
let thumbCanvas = null;

// opts (for tests and previews): time, env, mouse, tap, tier, view, ctx
export async function renderThumb(wall, cfg, night, w = 320, h = 200, opts = {}) {
  const look = looksOf(wall, cfg);
  if (wall.kind === 'scene') return null;
  if (wall.kind === 'emoji') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    drawEmoji(c, look, night);
    return c.toDataURL('image/jpeg', 0.85);
  }
  if (!thumbR) {
    thumbCanvas = document.createElement('canvas');
    const gl = thumbCanvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    thumbR = makeRenderer(gl);
  }
  thumbCanvas.width = w;
  thumbCanvas.height = h;
  const name = opts.shader || shaderOf(wall);
  const ctx = opts.ctx || { cfg: cfg || {}, store: {} };
  const time = opts.time ?? 14;
  const tier = opts.tier || 'low';
  const v = { time, mouse: opts.mouse || [0, 0], night, A: look.A, B: look.B, C: look.C, style: look.style, q: TIERS[tier].q, env: opts.env || envOf(ctx), tap: opts.tap, ptr: opts.ptr };
  if (wall.kind === 'astro') {
    await loadBody(thumbR, wall.body, tier);
    const cam = sized(wall.body, view(opts.view || startView(wall.body)));
    const st = frameState(wall.body, cam, ctx, time, [w, h], v.mouse);
    const u = { ...st.u };
    if (BODIES[wall.body].shader === 'earth') u.uRegion = (opts.region && (await loadRegion(thumbR, homeFor(ctx), (opts.view || startView(wall.body)) === 'city', tier, () => true))) || [0, 0, 0, 0];
    else {
      const a = thumbR.size('alb');
      u.uTexel = [1 / a.w, 1 / a.h];
    }
    v.u = u;
    v.tex = texOf(wall.body);
  }
  if (!(await thumbR.compiled(name)) || !thumbR.draw(name, w, h, v)) return null;
  return thumbCanvas.toDataURL(opts.png ? 'image/png' : 'image/jpeg', 0.9);
}

// for tests: average milliseconds per frame of a shader at a size
export async function benchShader(name, w, h, frames = 30, q = 1) {
  if (!thumbR) await renderThumb({ kind: 'color', A: ZERO, B: ZERO, C: ZERO }, {}, 0, 2, 2);
  await thumbR.compiled(name);
  thumbCanvas.width = w;
  thumbCanvas.height = h;
  const g = thumbR.gl;
  const v = { time: 3, mouse: [0, 0], night: 0, A: [0.5, 0.5, 0.5], B: [0.3, 0.3, 0.6], C: [1, 0.6, 0.3], q, env: [0.4, 0.5, 0, 0] };
  thumbR.draw(name, w, h, v);
  g.finish();
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    v.time += 0.016;
    thumbR.draw(name, w, h, v);
  }
  g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4));
  return (performance.now() - t0) / frames;
}

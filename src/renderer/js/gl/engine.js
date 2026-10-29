// Mounts a pack wallpaper (live 3D shader, Color gradient, Astronomy body or Emoji) into
// the scene layer, and renders still thumbnails of them for the pack browser.

import { VERT, COMMON, SHADERS, RES } from './shaders.js';
import { earthTexture, subsolar, toVec, viewRotation, homeFor } from './earth.js';
import { drawEmoji } from './emoji.js';
import { moon } from '../sky.js';

const STYLE = { mesh: 0, linear: 1, radial: 2 };
// slow-moving scenes don't need 60 fps; scenes with hard edges keep a minimum sharpness
const FPS = { silk: 60, dots: 60, neon: 45, gradient: 30, aurora: 30, glass: 30, chrome: 30, clay: 30, dunes: 24, planet: 12 };
const FLOOR = { glass: 0.75, chrome: 0.75, clay: 0.8 };
const ZERO = [0, 0, 0];

const shaderOf = (wall) => (wall.kind === 'color' ? 'gradient' : wall.kind === 'astro' ? 'planet' : wall.shader);

// the colors a wallpaper paints with; "Your Colors" / "Your Emoji" read the config
export function looksOf(wall, cfg) {
  if (!wall.custom) return wall;
  return { ...wall, ...(cfg?.wallCustom?.[wall.kind] || {}) };
}

const nightNow = () => (document.documentElement.dataset.appearance === 'dark' ? 1 : 0);

function makeRenderer(gl) {
  const progs = {};
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  let tex = null;
  let texFrom = null;

  function program(name) {
    if (name in progs) return progs[name];
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(`[wall] shader ${name}: ${gl.getShaderInfoLog(s)}`);
        return null;
      }
      return s;
    };
    const v = make(gl.VERTEX_SHADER, VERT);
    const f = make(gl.FRAGMENT_SHADER, COMMON + SHADERS[name]);
    let p = null;
    if (v && f) {
      p = gl.createProgram();
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.bindAttribLocation(p, 0, 'a');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error(`[wall] shader ${name}: ${gl.getProgramInfoLog(p)}`);
        p = null;
      }
    }
    const u = {};
    if (p) for (const k of ['uRes', 'uTime', 'uMouse', 'uNight', 'uA', 'uB', 'uC', 'uStyle', 'uTex', 'uRot', 'uSun', 'uFrame', 'uLoc', 'uLight', 'uMark']) u[k] = gl.getUniformLocation(p, k);
    return (progs[name] = p ? { p, u } : null);
  }

  return {
    gl,
    ok: (name) => !!program(name),
    texture(source) {
      if (texFrom === source) return;
      texFrom = source;
      tex ??= gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
    draw(name, w, h, v) {
      const pr = program(name);
      if (!pr) return false;
      const { u } = pr;
      gl.useProgram(pr.p);
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uTime, v.time);
      gl.uniform2f(u.uMouse, v.mouse[0], v.mouse[1]);
      gl.uniform1f(u.uNight, v.night);
      gl.uniform3fv(u.uA, v.A || ZERO);
      gl.uniform3fv(u.uB, v.B || ZERO);
      gl.uniform3fv(u.uC, v.C || ZERO);
      if (u.uStyle) gl.uniform1f(u.uStyle, STYLE[v.style] ?? 0);
      if (u.uRot) {
        gl.activeTexture(gl.TEXTURE0);
        if (tex) gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(u.uTex, 0);
        gl.uniformMatrix3fv(u.uRot, false, v.rot);
        gl.uniform3fv(u.uSun, v.sun);
        gl.uniform4fv(u.uFrame, v.frame);
        gl.uniform3fv(u.uLoc, v.loc);
        gl.uniform3fv(u.uLight, v.light);
        gl.uniform1f(u.uMark, v.mark);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

// where the planet sits on screen and how it is lit, for this moment
function astro(wall, ctx, time) {
  const now = new Date();
  if (wall.body === 'earth' || wall.body === 'city') {
    const home = homeFor(ctx);
    const s = subsolar(now);
    const city = wall.body === 'city';
    const sun = toVec(s.lat, s.lon);
    const loc = toVec(home.lat, home.lon);
    const day = sun[0] * loc[0] + sun[1] * loc[1] + sun[2] * loc[2] > 0;
    return {
      rot: viewRotation(home.lat, home.lon, Math.asin(city ? 0.86 : 0.22)),
      sun,
      loc,
      frame: city ? [0, -1.25, 1.2, 0] : [0, -0.12, 0.36, 0],
      light: [0, 0, 1],
      mark: city ? 0.006 : 0.014,
      caption: `${home.name || 'Your location'} · ${day ? 'Daytime' : 'Night'}`,
    };
  }
  if (wall.body === 'moon') {
    const m = moon(now);
    const a = 2 * Math.PI * m.age;
    return { rot: viewRotation(4, 0, 0), sun: ZERO, loc: [0, 1, 0], frame: [0, -0.1, 0.33, 1], light: norm([Math.sin(a), 0.12, -Math.cos(a)]), mark: 0, caption: `${m.name} · ${Math.round(m.illum * 100)}% lit` };
  }
  return { rot: viewRotation(18, time * 1.5, 0), sun: ZERO, loc: [0, 1, 0], frame: [0, -0.1, 0.33, 2], light: norm([-0.55, 0.3, 0.78]), mark: 0, caption: 'Mars' };
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
  let R = makeRenderer(gl);
  const name = shaderOf(wall);
  // the close-up over your city needs the sharper map; the whole globe is fine with half
  const maxTex = wall.body === 'city' && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096 ? 4096 : 2048;
  const loadTexture = () => {
    if (name !== 'planet' || (wall.body !== 'earth' && wall.body !== 'city')) return;
    earthTexture(maxTex).then((c) => R?.texture(c)).catch((e) => console.error('[wall] earth:', e.message));
  };
  loadTexture();

  let night = nightNow();
  // start a little low and let the frame-rate check raise it: a first frame at full size
  // on a slow GPU can stall long enough for the driver to reset
  let scale = Math.max(0.7, FLOOR[name] || 0);
  let time = 12;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let frames = 0;
  let astroState = null;
  let astroAt = 0;
  const mouse = [0, 0];
  const mouseTo = [0, 0];
  const onMove = (e) => {
    if (e.clientX < 0) return;
    mouseTo[0] = (e.clientX / innerWidth) * 2 - 1;
    mouseTo[1] = -((e.clientY / innerHeight) * 2 - 1);
  };
  window.addEventListener('mousemove', onMove);

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const saver = document.documentElement.dataset.perf === 'saver';
    const f = Math.min(1, RES[name] * scale * (saver ? 0.7 : 1));
    const w = Math.max(2, Math.round(canvas.clientWidth * dpr * f));
    const h = Math.max(2, Math.round(canvas.clientHeight * dpr * f));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const motion = ctx.cfg.motion !== false;
    const saver = document.documentElement.dataset.perf === 'saver';
    const fps = !motion ? 1 / 30 : Math.min(FPS[name] || 60, saver ? 24 : 60);
    const target = nightNow();
    const easing = Math.abs(target - night) > 0.001;
    if (last && t - last < 1000 / fps - 3 && !easing) return;
    const dt = last ? Math.min(0.25, (t - last) / 1000) : 0;
    last = t;
    if (motion) time += dt;
    night += (target - night) * (motion ? Math.min(1, dt * 1.6) : 1);
    if (!easing) night = target;
    const k = Math.min(1, dt * 2);
    mouse[0] += (mouseTo[0] * 0.6 - mouse[0]) * k;
    mouse[1] += (mouseTo[1] * 0.6 - mouse[1]) * k;
    size();
    const look = looksOf(wall, ctx.cfg);
    const v = { time, mouse, night, A: look.A, B: look.B, C: look.C, style: look.style };
    if (name === 'planet') {
      if (!astroState || t - astroAt > 30000) {
        astroState = astro(wall, ctx, time);
        astroAt = t;
        cap.textContent = astroState.caption;
      }
      if (wall.body === 'mars') astroState.rot = viewRotation(18, time * 1.5, 0);
      Object.assign(v, astroState);
    }
    R.draw(name, canvas.width, canvas.height, v);
    // keep the frame rate up on slower GPUs by rendering fewer pixels (and more when there is room)
    if (motion && fps >= 24) {
      acc += dt;
      frames++;
      if (acc > 1.5) {
        const avg = acc / frames;
        if (avg > 1.7 / fps && scale > (FLOOR[name] || 0.4)) scale *= 0.85;
        else if (avg < 1.15 / fps && scale < 1.3) scale *= 1.05;
        acc = 0;
        frames = 0;
      }
    }
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    R = makeRenderer(gl);
    loadTexture();
    last = 0;
    raf = requestAnimationFrame(frame);
  });
  raf = requestAnimationFrame(frame);

  return {
    update(next) {
      ctx = next;
      astroState = null;
      last = 0;
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      R.dispose();
      R = null;
      gl = null;
    },
  };
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

export async function renderThumb(wall, cfg, night, w = 320, h = 200) {
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
  const name = shaderOf(wall);
  const v = { time: 14, mouse: [0, 0], night, A: look.A, B: look.B, C: look.C, style: look.style };
  if (name === 'planet') {
    if (wall.body === 'earth' || wall.body === 'city') {
      const tex = await earthTexture(1024).catch(() => null);
      if (tex) thumbR.texture(tex);
    }
    Object.assign(v, astro(wall, { cfg: cfg || {}, store: {} }, 14));
  }
  if (!thumbR.draw(name, w, h, v)) return null;
  return thumbCanvas.toDataURL('image/jpeg', 0.85);
}

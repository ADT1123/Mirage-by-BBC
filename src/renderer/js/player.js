// Full-screen Now Playing, Apple Music style: big artwork, a living backdrop made from the
// artwork itself, premium controls, and a visualizer driven by the PC's audio output.

import { esc, mediaPosition, fmtTime } from './widgets.js';
import { icon } from './icons.js';

let m = { active: false };
let lastArt = '';
let raf = 0;
let viz = null;
let seeking = false;

let vizOn = true;

export function start(env = {}) {
  vizOn = env.cfg?.visualizer !== false;
  const root = document.getElementById('chrome');
  root.className = 'np-root';
  root.innerHTML = `
    <div class="np">
      <div class="np-bg"><i class="art-layer a1"></i><i class="art-layer a2"></i><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i></div>
      <div class="np-shade"></div>
      <canvas class="np-viz"></canvas>
      <button class="np-close" title="Close (Esc)">${icon('x')}</button>
      <button class="np-viz-toggle" title="Visualizer on/off (V)"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 14v4M8 10v8M12 6v12M16 11v7M20 8v10"/></svg></button>
      <button class="np-hist-toggle" title="Recently played (H)">${icon('clock')}</button>
      <aside class="np-history"><h2>Recently played</h2><div class="np-hlist"></div></aside>
      <main class="np-main">
        <div class="np-art"><img alt="" draggable="false" /><div class="np-noart">${icon('volume')}</div></div>
        <div class="np-meta">
          <div class="np-text"><h1 data-k="title">Nothing playing</h1><p data-k="sub"></p></div>
        </div>
        <div class="np-progress">
          <div class="np-track"><div class="np-fill"></div><div class="np-knob"></div></div>
          <div class="np-times"><span data-k="pos">0:00</span><span data-k="left">-0:00</span></div>
        </div>
        <div class="np-controls">
          <button data-cmd="shuffle" class="np-small" title="Shuffle" data-label="Shuffle">${shuffleIcon()}</button>
          <button data-cmd="prev" title="Previous" data-label="Previous">${icon('prev')}</button>
          <button data-cmd="toggle" class="np-play" title="Play / pause"></button>
          <button data-cmd="next" title="Next" data-label="Next">${icon('next')}</button>
          <button data-cmd="repeat" class="np-small" title="Repeat" data-label="Repeat">${repeatIcon()}</button>
        </div>
        <div class="np-volume">
          ${icon('mute')}
          <input type="range" min="0" max="100" value="50" />
          ${icon('volume')}
        </div>
      </main>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const set = (k, v) => {
    const el = $(`[data-k="${k}"]`);
    if (el && el.textContent !== v) el.textContent = v;
  };

  function paint() {
    root.classList.toggle('idle', !m.active);
    set('title', m.active ? m.title || 'Unknown title' : 'Nothing playing');
    set('sub', m.active ? [m.artist, m.album].filter(Boolean).join(' — ') || m.appName || '' : 'Play something in Spotify, Apple Music or your browser');
    $('.np-play').innerHTML = m.playing ? icon('pause') : icon('play');
    $('[data-cmd="shuffle"]').classList.toggle('on', !!m.shuffle);
    const cap = (cmd, ok, what) => {
      const b = $(`[data-cmd="${cmd}"]`);
      b.disabled = m.active && !ok;
      b.title = b.disabled ? `${m.appName || 'This app'} doesn't support ${what}` : b.dataset.label || b.title;
    };
    cap('shuffle', m.canShuffle !== false, 'shuffle');
    cap('repeat', m.canRepeat !== false, 'repeat');
    cap('prev', m.canPrev !== false, 'previous track');
    cap('next', m.canNext !== false, 'next track');
    $('[data-cmd="repeat"]').classList.toggle('on', m.repeat > 0);
    root.classList.toggle('playing', !!m.playing);
    root.classList.toggle('can-seek', mediaPosition(m).dur > 0 && m.canSeek !== false);
    if ((m.art || '') !== lastArt) {
      lastArt = m.art || '';
      setArtwork(root, m);
    }
  }

  // the progress bar is interpolated locally between updates, so it moves smoothly
  function tick() {
    const { pos, dur } = mediaPosition(m);
    if (!seeking) $('.np-fill').style.width = `${dur ? (pos / dur) * 100 : 0}%`;
    $('.np-knob').style.left = $('.np-fill').style.width;
    set('pos', fmtTime(pos));
    set('left', dur ? `-${fmtTime(Math.max(0, dur - pos))}` : 'live');
    root.classList.toggle('no-duration', !dur);
  }

  window.wall.media().then((s) => {
    m = s || m;
    paint();
  });

  // recently played: the last 10 songs, newest first; click one to find it again
  let recent = [];
  const paintHistory = () => {
    const list = $('.np-hlist');
    list.innerHTML = recent.length
      ? recent
          .map(
            (h, i) => `<button class="np-h" data-i="${i}" title="Find this song">
          <span class="np-hc"${h.art ? ` style="background-image:url('${h.art.replace(/'/g, '%27')}')"` : ''}></span>
          <span class="np-ht"><b>${esc(h.title)}</b><small>${esc(h.artist || h.app)}</small></span>
          <em>${ago(h.at)}</em>
        </button>`,
          )
          .join('')
      : '<p class="np-hempty">Songs you play show up here.</p>';
  };
  const ago = (t) => {
    const min = Math.round((Date.now() - t) / 60000);
    return min < 1 ? 'now' : min < 60 ? `${min}m` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;
  };
  window.wall.mediaHistory?.().then((h) => {
    recent = h || [];
    paintHistory();
  });
  window.wall.onMediaHistory?.((h) => {
    recent = h || [];
    paintHistory();
  });
  let histOpen = false;
  try {
    histOpen = localStorage.getItem('np-history') === '1';
  } catch {}
  const showHistory = (on) => {
    histOpen = on;
    root.classList.toggle('show-history', on);
    $('.np-hist-toggle').classList.toggle('on', on);
    try {
      localStorage.setItem('np-history', on ? '1' : '0');
    } catch {}
    if (on) paintHistory(); // refresh the "5m ago" labels
  };
  showHistory(histOpen);
  $('.np-hist-toggle').addEventListener('click', () => showHistory(!histOpen));
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.altKey) showHistory(!histOpen);
  });
  $('.np-hlist').addEventListener('click', (e) => {
    const h = recent[Number(e.target.closest('.np-h')?.dataset.i)];
    if (!h) return;
    const q = encodeURIComponent(`${h.title} ${h.artist}`.trim());
    window.wall.action('url', /spotify/i.test(h.app) ? `https://open.spotify.com/search/${q}` : `https://music.youtube.com/search?q=${q}`);
  });
  window.wall.onMedia((s) => {
    m = s;
    paint();
  });
  setInterval(tick, 250);

  // controls
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('np-close')) return window.wall.closePlayer();
    if (b.dataset.cmd) {
      window.wall.mediaCmd(b.dataset.cmd);
      if (b.dataset.cmd === 'toggle') {
        m = { ...m, playing: !m.playing };
        paint();
      }
    }
  });

  // seeking (only when the player reports a real timeline)
  const track = $('.np-track');
  const seekTo = (e) => {
    const r = track.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    $('.np-fill').style.width = `${f * 100}%`;
    $('.np-knob').style.left = `${f * 100}%`;
    return f * (mediaPosition(m).dur || 0);
  };
  track.addEventListener('pointerdown', (e) => {
    if (!(mediaPosition(m).dur > 0 && m.canSeek !== false)) return;
    seeking = true;
    track.setPointerCapture(e.pointerId);
    seekTo(e);
  });
  track.addEventListener('pointermove', (e) => seeking && seekTo(e));
  track.addEventListener('pointerup', (e) => {
    if (!seeking) return;
    seeking = false;
    const sec = seekTo(e);
    window.wall.mediaCmd('seek', sec);
    m = { ...m, position: sec, updated: Date.now(), clock: { base: sec, since: Date.now(), playing: m.playing } };
  });

  // volume = the real Windows master volume
  const vol = $('.np-volume input');
  const fillVol = () => vol.style.setProperty('--v', `${vol.value}%`);
  vol.addEventListener('input', () => {
    fillVol();
    window.wall.sysSet('volume', Number(vol.value));
  });
  const syncVolume = () =>
    window.wall.sysState().then((s) => {
      if (s?.volume) {
        vol.value = s.volume.level;
        fillVol();
      }
    });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.wall.closePlayer();
    if (e.key === ' ') {
      e.preventDefault();
      window.wall.mediaCmd('toggle');
    }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && mediaPosition(m).dur > 0) {
      const { pos } = mediaPosition(m);
      const sec = Math.max(0, pos + (e.key === 'ArrowRight' ? 10 : -10));
      window.wall.mediaCmd('seek', sec);
      m = { ...m, position: sec, updated: Date.now() };
    }
    if (e.key.toLowerCase() === 'n') window.wall.mediaCmd('next');
    if (e.key.toLowerCase() === 'p') window.wall.mediaCmd('prev');
    if (e.key.toLowerCase() === 'v') toggleViz();
  });

  // visualizer on/off is a saved setting (also in the top-bar Settings)
  const paintViz = () => root.classList.toggle('viz-off', !vizOn);
  async function toggleViz() {
    vizOn = !vizOn;
    paintViz();
    if (vizOn) startVisualizer(root);
    else stopVisualizer();
    const c = await window.wall.getConfig();
    c.visualizer = vizOn;
    window.wall.setConfig(c);
  }
  root.querySelector('.np-viz-toggle').addEventListener('click', toggleViz);
  window.wall.onConfig?.((c) => {
    if ((c.visualizer !== false) === vizOn) return;
    vizOn = c.visualizer !== false;
    paintViz();
    if (!vizOn) stopVisualizer();
  });
  paintViz();

  window.wall.onPlayerShow(() => {
    syncVolume();
    if (vizOn) startVisualizer(root);
  });
  window.wall.onPlayerHidden(stopVisualizer);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncVolume();
      if (vizOn) startVisualizer(root);
    } else stopVisualizer();
  });
  paint();
  tick();
  syncVolume();
}

// ---------------------------------------------------------------- artwork + living backdrop
// The backdrop is the artwork plus its most vivid colors as soft blobs that drift and
// swirl. It's drawn small and heavily blurred, then scaled up: very soft, very cheap.

function setArtwork(root, media) {
  const img = root.querySelector('.np-art img');
  const layers = root.querySelectorAll('.np-bg .art-layer');
  root.classList.toggle('has-art', !!media.art);
  if (!media.art) {
    img.removeAttribute('src');
    applyPalette(root, fallbackPalette(media.title || 'music'));
    layers.forEach((l) => (l.style.backgroundImage = ''));
    return;
  }
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = () => {
    img.src = media.art;
    let small = media.art;
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 16;
      const g = cv.getContext('2d');
      g.drawImage(im, 0, 0, 16, 16);
      small = cv.toDataURL();
      applyPalette(root, extractPalette(g.getImageData(0, 0, 16, 16).data));
    } catch {
      applyPalette(root, fallbackPalette(media.title || 'music'));
    }
    layers.forEach((l) => (l.style.backgroundImage = `url("${small}")`));
  };
  im.src = media.art;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// The artwork's dominant colors, weighted by how much of the cover they fill, then toned
// down into deep, muted shades so the backdrop flatters the art instead of shouting.
function extractPalette(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    const key = s < 0.18 || l < 0.08 || l > 0.94 ? 'neutral' : Math.round(h / 30) % 12;
    const k = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    k.n++;
    k.r += r;
    k.g += g;
    k.b += b;
    buckets.set(key, k);
  }
  const ranked = [...buckets.entries()]
    .map(([key, k]) => ({ key, n: k.n, hsl: rgbToHsl(k.r / k.n, k.g / k.n, k.b / k.n) }))
    // colorful areas lead; a neutral area only leads when it truly dominates
    .sort((a, b) => b.n * (a.key === 'neutral' ? 0.6 : 1) - a.n * (b.key === 'neutral' ? 0.6 : 1));
  const tone = ([h, s, l], dl = 0) => `hsl(${Math.round(h)} ${Math.round(Math.min(0.5, s * 0.85) * 100)}% ${Math.round(Math.min(0.4, Math.max(0.16, l * 0.75 + dl)) * 100)}%)`;
  const picks = ranked.slice(0, 4).map((x) => x.hsl);
  while (picks.length < 4) picks.push(picks[0] || [260, 0.3, 0.3]);
  return [tone(picks[0]), tone(picks[1], 0.03), tone(picks[2], -0.02), tone(picks[0], -0.12)];
}

function fallbackPalette(seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return [`hsl(${h} 70% 45%)`, `hsl(${(h + 40) % 360} 75% 38%)`, `hsl(${(h + 300) % 360} 60% 34%)`, `hsl(${(h + 180) % 360} 55% 30%)`];
}

function applyPalette(root, colors) {
  colors.forEach((c, i) => root.style.setProperty(`--p${i + 1}`, c));
  root.style.setProperty('--tint', colors[3]);
}

// ---------------------------------------------------------------- visualizer

async function startVisualizer(root) {
  if (viz) return;
  const mine = (viz = { bars: new Float32Array(72) });
  drawLoop(root);
  try {
    const stream = await Promise.race([captureAudio(), new Promise((_, no) => setTimeout(() => no(new Error('timed out')), 5000))]);
    if (viz !== mine) return stream.getTracks().forEach((t) => t.stop());
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!stream.getAudioTracks().length) throw new Error('no audio track');
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0.82;
    ctx.createMediaStreamSource(stream).connect(an);
    Object.assign(mine, { stream, ctx, an, data: new Uint8Array(an.frequencyBinCount) });
  } catch (e) {
    console.warn(`[visualizer] no system audio (${e.message}); showing the idle wave`);
  }
}

// Electron's desktop capture hands us the PC's audio output (loopback) without a picker.
function captureAudio() {
  return navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'desktop' } },
    video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 2, maxHeight: 2, maxFrameRate: 1 } },
  });
}

function drawLoop(root) {
  const canvas = root.querySelector('.np-viz');
  const g = canvas.getContext('2d');
  const art = root.querySelector('.np-art');
  const draw = (t) => {
    if (!viz) return;
    const W = (canvas.width = canvas.clientWidth * devicePixelRatio);
    const H = (canvas.height = canvas.clientHeight * devicePixelRatio);
    g.clearRect(0, 0, W, H);
    const n = viz.bars.length;
    let bass = 0;
    if (viz.an) {
      viz.an.getByteFrequencyData(viz.data);
      const bins = viz.data.length;
      for (let i = 0; i < n; i++) {
        // log-spaced bands so lows and highs both get room
        const a = Math.floor(Math.pow(i / n, 2) * bins * 0.55);
        const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 2) * bins * 0.55));
        let s = 0;
        for (let k = a; k < b; k++) s += viz.data[k];
        viz.bars[i] += (s / (b - a) / 255 - viz.bars[i]) * 0.35;
      }
      for (let i = 0; i < 6; i++) bass += viz.bars[i];
      bass /= 6;
    } else {
      for (let i = 0; i < n; i++) viz.bars[i] = root.classList.contains('playing') ? 0.1 + 0.08 * Math.sin(t / 420 + i / 3) ** 2 : 0.03;
    }
    const gap = W / n;
    const bw = Math.max(2, gap * 0.42);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < n; i++) {
      const h = Math.max(bw, viz.bars[i] * H * 0.95);
      roundRect(g, i * gap + (gap - bw) / 2, H - h, bw, h, bw / 2);
    }
    art.style.transform = `scale(${1 + Math.min(0.03, bass * 0.045)})`;
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, 0);
  g.arcTo(x, y + h, x, y, 0);
  g.arcTo(x, y, x + w, y, r);
  g.fill();
}

function stopVisualizer() {
  cancelAnimationFrame(raf);
  if (viz?.stream) viz.stream.getTracks().forEach((t) => t.stop());
  viz?.ctx?.close();
  viz = null;
}

function shuffleIcon() {
  return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3.5c4 0 6 10 10 10H21M3 17h3.5c1.6 0 2.8-1.6 3.8-3.6M13.7 9.6c1-2 2.2-3.6 3.8-3.6H21M18 3.5L21 6l-3 2.5M18 15.5l3 2.5-3 2.5"/></svg>';
}
function repeatIcon() {
  return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3"/></svg>';
}

export { esc };

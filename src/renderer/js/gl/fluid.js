// Ink in Water (Liquid pack): a real fluid simulation on the GPU (stable fluids: advection,
// vorticity, a pressure solve). Ink is heavier than water, so drops sink and curl into plumes;
// moving the cursor stirs the water and a click drops in fresh ink. Needs float render targets;
// without them mountInk returns null and the engine draws the procedural "ink" shader instead.

const VS = `precision highp float;
attribute vec2 a; uniform vec2 uTexel;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
void main(){
  vUv = a*0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0); vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y); vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const HEAD = `precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
`;

const FS = {
  splat: `uniform sampler2D uTarget; uniform float uAspect; uniform vec4 uColor; uniform vec2 uPoint; uniform float uRadius;
void main(){ vec2 p = vUv - uPoint; p.x *= uAspect; gl_FragColor = texture2D(uTarget, vUv) + exp(-dot(p, p)/uRadius)*uColor; }`,

  // semi-Lagrangian: fetch what was upstream a moment ago (bilinear by hand where the GPU
  // can't filter float textures)
  advect: `uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 uVelTexel; uniform vec2 uSrcTexel;
uniform float uDt; uniform float uDissipation;
vec4 bilerp(sampler2D s, vec2 uv, vec2 ts){
  vec2 st = uv/ts - 0.5; vec2 i = floor(st); vec2 f = fract(st);
  vec4 a = texture2D(s, (i + vec2(0.5, 0.5))*ts); vec4 b = texture2D(s, (i + vec2(1.5, 0.5))*ts);
  vec4 c = texture2D(s, (i + vec2(0.5, 1.5))*ts); vec4 d = texture2D(s, (i + vec2(1.5, 1.5))*ts);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
#ifdef MANUAL
  vec2 coord = vUv - uDt*bilerp(uVelocity, vUv, uVelTexel).xy*uVelTexel;
  vec4 r = bilerp(uSource, coord, uSrcTexel);
#else
  vec2 coord = vUv - uDt*texture2D(uVelocity, vUv).xy*uVelTexel;
  vec4 r = texture2D(uSource, coord);
#endif
  gl_FragColor = r/(1.0 + uDissipation*uDt);
}`,

  curl: `uniform sampler2D uVelocity;
void main(){
  float L = texture2D(uVelocity, vL).y; float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x; float B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5*(R - L - T + B), 0.0, 0.0, 1.0);
}`,

  // vorticity confinement keeps the small curls alive
  vorticity: `uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float uCurlK; uniform float uDt;
void main(){
  float L = texture2D(uCurl, vL).x; float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x; float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 f = 0.5*vec2(abs(T) - abs(B), abs(R) - abs(L));
  f = f/(length(f) + 0.0001)*uCurlK*C;
  f.y *= -1.0;
  vec2 v = texture2D(uVelocity, vUv).xy + f*uDt;
  gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,

  // ink sinks (it's heavier than the water) and a slow current keeps the water moving
  force: `uniform sampler2D uVelocity; uniform sampler2D uDye; uniform float uDt; uniform float uSink; uniform float uTime;
float h(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y); }
void main(){
  vec2 v = texture2D(uVelocity, vUv).xy;
  v.y -= uSink*texture2D(uDye, vUv).a*uDt;
  vec2 q = vUv*3.0 + vec2(uTime*0.03, 0.0);
  float e = 0.05;
  vec2 cn = vec2(n(q + vec2(0.0, e)) - n(q - vec2(0.0, e)), n(q - vec2(e, 0.0)) - n(q + vec2(e, 0.0)))/(2.0*e);
  v += cn*1.6*uDt;
  gl_FragColor = vec4(v, 0.0, 1.0);
}`,

  divergence: `uniform sampler2D uVelocity;
void main(){
  float L = texture2D(uVelocity, vL).x; float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y; float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if(vL.x < 0.0) L = -C.x; if(vR.x > 1.0) R = -C.x;
  if(vT.y > 1.0) T = -C.y; if(vB.y < 0.0) B = -C.y;
  gl_FragColor = vec4(0.5*(R - L + T - B), 0.0, 0.0, 1.0);
}`,

  fade: `uniform sampler2D uTarget; uniform float uValue;
void main(){ gl_FragColor = uValue*texture2D(uTarget, vUv); }`,

  pressure: `uniform sampler2D uPressure; uniform sampler2D uDivergence;
void main(){
  float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
  gl_FragColor = vec4((L + R + B + T - texture2D(uDivergence, vUv).x)*0.25, 0.0, 0.0, 1.0);
}`,

  gradient: `uniform sampler2D uPressure; uniform sampler2D uVelocity;
void main(){
  float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
  vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
  gl_FragColor = vec4(v, 0.0, 1.0);
}`,

  // rgb = ink colour times amount, a = amount. By day the ink absorbs light in clear water;
  // by night it glows on black. A little relief from the ink's thickness, lit from above.
  display: `uniform sampler2D uDye; uniform float uNight; uniform float uTime; uniform vec2 uRes;
void main(){
  vec4 d = texture2D(uDye, vUv);
  float l = texture2D(uDye, vL).a; float r = texture2D(uDye, vR).a;
  float t = texture2D(uDye, vT).a; float b = texture2D(uDye, vB).a;
  vec3 n = normalize(vec3(l - r, b - t, 0.35));
  float sh = clamp(0.8 + 0.4*dot(n, normalize(vec3(-0.3, 0.6, 0.75))), 0.5, 1.25);
  float k = clamp(d.a*2.0, 0.0, 1.0);
  vec3 bg = mix(vec3(0.85, 0.87, 0.9), vec3(0.975, 0.975, 0.97), smoothstep(0.0, 1.0, vUv.y));
  vec3 day = bg*exp(-max(vec3(d.a) - d.rgb, 0.0)*2.6)*mix(1.0, sh, k);
  vec3 night = vec3(0.006, 0.007, 0.012) + (1.0 - exp(-max(d.rgb, 0.0)*4.0))*mix(1.0, sh, k);
  vec3 col = mix(day, night, uNight);
  col *= 0.88 + 0.12*pow(16.0*vUv.x*vUv.y*(1.0 - vUv.x)*(1.0 - vUv.y), 0.2);
  vec2 fc = gl_FragCoord.xy;
  vec2 p = fract(fc*vec2(0.1031, 0.1030) + fract(uTime*7.13)); p += dot(p, p.yx + 33.33);
  col += (fract((p.x + p.y)*p.x) - 0.5)*0.012;
  gl_FragColor = vec4(col, 1.0);
}`,
};

// grid sizes (cells across the short side) and pressure solver passes per tier
const SIM = { low: [80, 256, 14], balanced: [128, 640, 20], high: [160, 1024, 24] };

function floatTargets(gl) {
  const half = gl.getExtension('OES_texture_half_float');
  gl.getExtension('EXT_color_buffer_half_float');
  const tryType = (type, linear) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return ok ? { type, linear } : null;
  };
  if (half) {
    const r = tryType(half.HALF_FLOAT_OES, !!gl.getExtension('OES_texture_half_float_linear'));
    if (r) return r;
  }
  if (gl.getExtension('OES_texture_float')) {
    gl.getExtension('WEBGL_color_buffer_float');
    return tryType(gl.FLOAT, !!gl.getExtension('OES_texture_float_linear'));
  }
  return null;
}

// look(): the wallpaper's colours; night(): 0..1; tier: quality tier name
export function mountInk(canvas, gl, { look, night, tier, motion }) {
  const fmt = floatTargets(gl);
  if (!fmt) return null;
  const [simN, dyeN, iters] = SIM[tier] || SIM.balanced;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const P = {};
  try {
    for (const [k, src] of Object.entries(FS)) {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, (k === 'advect' && !fmt.linear ? '#define MANUAL\n' : '') + HEAD + src));
      gl.bindAttribLocation(p, 0, 'a');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        const name = gl.getActiveUniform(p, i).name;
        u[name] = gl.getUniformLocation(p, name);
      }
      P[k] = { p, u };
    }
  } catch (e) {
    console.error('[wall] ink:', e.message);
    return null;
  }

  const filter = fmt.linear ? gl.LINEAR : gl.NEAREST;
  function target(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, fmt.type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h, texel: [1 / w, 1 / h] };
  }
  const pair = (w, h) => {
    const p = { read: target(w, h), write: target(w, h) };
    p.swap = () => ([p.read, p.write] = [p.write, p.read]);
    return p;
  };
  const sizeOf = (n) => {
    const a = canvas.clientWidth / Math.max(1, canvas.clientHeight) || 16 / 9;
    return a >= 1 ? [Math.round(n * a), n] : [n, Math.round(n / a)];
  };
  const [sw, sh] = sizeOf(simN);
  const [dw, dh] = sizeOf(dyeN);
  const vel = pair(sw, sh);
  const dye = pair(dw, dh);
  const pressure = pair(sw, sh);
  const div = target(sw, sh);
  const curl = target(sw, sh);

  let cur = null;
  const use = (prog, texel) => {
    cur = prog;
    gl.useProgram(prog.p);
    gl.uniform2fv(prog.u.uTexel, texel);
  };
  let unit = 0;
  const bind = (name, t) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(cur.u[name], unit++);
  };
  const draw = (t) => {
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    unit = 0;
  };

  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight) || 16 / 9;
  function splat(x, y, fx, fy, color, amount, radius) {
    use(P.splat, vel.read.texel);
    bind('uTarget', vel.read);
    gl.uniform1f(cur.u.uAspect, aspect());
    gl.uniform2f(cur.u.uPoint, x, y);
    gl.uniform4f(cur.u.uColor, fx, fy, 0, 0);
    gl.uniform1f(cur.u.uRadius, radius * 1.4);
    draw(vel.write);
    vel.swap();
    if (!amount) return;
    use(P.splat, dye.read.texel);
    bind('uTarget', dye.read);
    gl.uniform1f(cur.u.uAspect, aspect());
    gl.uniform2f(cur.u.uPoint, x, y);
    gl.uniform4f(cur.u.uColor, color[0] * amount, color[1] * amount, color[2] * amount, amount);
    gl.uniform1f(cur.u.uRadius, radius);
    draw(dye.write);
    dye.swap();
  }

  let time = 0;
  function step(dt) {
    use(P.curl, vel.read.texel);
    bind('uVelocity', vel.read);
    draw(curl);

    use(P.vorticity, vel.read.texel);
    bind('uVelocity', vel.read);
    bind('uCurl', curl);
    gl.uniform1f(cur.u.uCurlK, 10);
    gl.uniform1f(cur.u.uDt, dt);
    draw(vel.write);
    vel.swap();

    use(P.force, vel.read.texel);
    bind('uVelocity', vel.read);
    bind('uDye', dye.read);
    gl.uniform1f(cur.u.uDt, dt);
    gl.uniform1f(cur.u.uSink, 14);
    gl.uniform1f(cur.u.uTime, time);
    draw(vel.write);
    vel.swap();

    use(P.divergence, vel.read.texel);
    bind('uVelocity', vel.read);
    draw(div);

    use(P.fade, vel.read.texel);
    bind('uTarget', pressure.read);
    gl.uniform1f(cur.u.uValue, 0.8);
    draw(pressure.write);
    pressure.swap();

    use(P.pressure, vel.read.texel);
    for (let i = 0; i < iters; i++) {
      bind('uDivergence', div);
      bind('uPressure', pressure.read);
      draw(pressure.write);
      pressure.swap();
    }

    use(P.gradient, vel.read.texel);
    bind('uPressure', pressure.read);
    bind('uVelocity', vel.read);
    draw(vel.write);
    vel.swap();

    use(P.advect, vel.read.texel);
    bind('uVelocity', vel.read);
    bind('uSource', vel.read);
    gl.uniform2fv(cur.u.uVelTexel, vel.read.texel);
    gl.uniform2fv(cur.u.uSrcTexel, vel.read.texel);
    gl.uniform1f(cur.u.uDt, dt);
    gl.uniform1f(cur.u.uDissipation, 0.25);
    draw(vel.write);
    vel.swap();

    use(P.advect, dye.read.texel);
    bind('uVelocity', vel.read);
    bind('uSource', dye.read);
    gl.uniform2fv(cur.u.uVelTexel, vel.read.texel);
    gl.uniform2fv(cur.u.uSrcTexel, dye.read.texel);
    gl.uniform1f(cur.u.uDt, dt);
    gl.uniform1f(cur.u.uDissipation, 0.045);
    draw(dye.write);
    dye.swap();
  }

  let nightK = night();
  function show() {
    const T = { low: [1, 0.75], balanced: [2, 1], high: [2, 1] }[tier] || [2, 1];
    const dpr = Math.min(window.devicePixelRatio || 1, T[0]);
    const w = Math.max(2, Math.round(canvas.clientWidth * dpr * T[1]));
    const h = Math.max(2, Math.round(canvas.clientHeight * dpr * T[1]));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    use(P.display, dye.read.texel);
    bind('uDye', dye.read);
    gl.uniform1f(cur.u.uNight, nightK);
    gl.uniform1f(cur.u.uTime, time);
    gl.uniform2f(cur.u.uRes, w, h);
    draw(null);
  }

  // ink comes in three colours from the wallpaper, taking turns
  let colorAt = 0;
  const nextColor = () => {
    const l = look();
    const c = [l.A, l.B, l.C][colorAt++ % 3] || [0.2, 0.3, 0.8];
    return c;
  };
  // a drop of ink falling in from above
  const drop = (x, y, big = 1) => splat(x, y, (Math.random() - 0.5) * 40, -260 * big, nextColor(), 0.9 * big, 0.0011 * big);

  // the cursor stirs; fast strokes leave a wisp of ink
  let last = null;
  let inputAt = -1e9; // full frame rate for a couple of seconds after you stir or click
  const pending = [];
  const onMove = (e) => {
    if (e.clientX < 0) return;
    inputAt = performance.now();
    const x = e.clientX / innerWidth;
    const y = 1 - e.clientY / innerHeight;
    if (last) {
      const dx = x - last[0];
      const dy = y - last[1];
      if (Math.abs(dx) + Math.abs(dy) > 0.0005) pending.push([x, y, dx * 5000, dy * 5000, Math.min(0.12, Math.hypot(dx, dy) * 3)]);
    }
    last = [x, y];
  };
  const onClick = (e) => {
    if (e.target.closest?.('.w, .popup, .mb, button, a, input')) return;
    inputAt = performance.now();
    drop(e.clientX / innerWidth, 1 - e.clientY / innerHeight, 1.5);
  };
  window.addEventListener('mousemove', onMove);
  document.addEventListener('click', onClick);

  let raf = 0;
  let wake = 0;
  let prev = 0;
  let nextDrop = 0;
  let stirColor = nextColor();
  // a couple of drops already falling when it appears
  drop(0.35, 0.86, 1.2);
  drop(0.62, 0.95, 1);
  for (let i = 0; i < 90; i++) {
    time += 1 / 60;
    step(1 / 60);
  }
  // sleeps on a timer between frames; 30 a second while the ink drifts on its own, 60 while you stir
  function frame(t) {
    const moving = motion();
    const fps = !moving ? 1 / 2 : tier === 'low' || performance.now() - inputAt > 2000 ? 30 : 60;
    const wait = prev ? prev + 1000 / fps - t : 0;
    if (wait > 3) {
      if (wait > 20) wake = setTimeout(() => (raf = requestAnimationFrame(frame)), wait - 18);
      else raf = requestAnimationFrame(frame);
      return;
    }
    raf = requestAnimationFrame(frame);
    const dt = prev ? Math.min(1 / 30, (t - prev) / 1000) : 1 / 60;
    prev = t;
    const n = night();
    nightK += (n - nightK) * Math.min(1, dt * 1.6);
    if (moving) {
      time += dt;
      // a fresh drop every few seconds keeps it alive
      if (time > nextDrop) {
        drop(0.12 + Math.random() * 0.76, 0.9 + Math.random() * 0.08, 0.7 + Math.random() * 0.5);
        nextDrop = time + 3.5 + Math.random() * 4;
        stirColor = nextColor();
      }
      for (const [x, y, fx, fy, amt] of pending.splice(0)) splat(x, y, fx, fy, stirColor, amt, 0.0006);
      step(dt);
    } else pending.length = 0;
    show();
  }
  raf = requestAnimationFrame(frame);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    clearTimeout(wake);
    cancelAnimationFrame(raf);
  });

  return {
    destroy() {
      clearTimeout(wake);
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('click', onClick);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

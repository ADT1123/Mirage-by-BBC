// Astronomy pack: the Sun, the planets and the Moon, drawn from real maps (Solar System Scope,
// CC BY 4.0) with a real camera, so the Earth can be a globe or a view down over your city.
// Earth is lit by the Sun's true position; the Moon shows tonight's phase.

import { subsolar, toVec, viewRotation, homeFor } from './earth.js';
import { moon } from '../sky.js';

// ------------------------------------------------------------------ GLSL

const CAMERA = `
uniform mat3 uRot; uniform vec3 uSunV; uniform vec4 uCam; uniform vec2 uShift; uniform float uSpin;
uniform sampler2D uSkyT; uniform vec3 uMarkP;
// camera at (0, 0, uCam.x) body radii from the centre, turned up by uCam.y from looking
// straight at it; uCam.z = tan(half the vertical field of view)
void camRay(vec2 fc, out vec3 ro, out vec3 rd){
  vec2 p = (fc - 0.5*uRes)/uRes.y - uShift;
  float ct = cos(uCam.y); float st = sin(uCam.y);
  ro = vec3(0.0, 0.0, uCam.x);
  rd = normalize(vec3(0.0, st, -ct) + (vec3(1.0, 0.0, 0.0)*p.x + vec3(0.0, ct, st)*p.y)*2.0*uCam.z);
}
vec2 equi(vec3 e){ return vec2(atan(e.x, e.z)/(2.0*PI) + 0.5, 0.5 - asin(clamp(e.y, -1.0, 1.0))/PI); }
// the longitude wraps from 1 back to 0 on the far meridian; pick whichever coordinate is smooth
// there so the mipmaps don't draw a seam (Tarini's trick)
vec2 seam(vec2 uv){
#ifdef GL_OES_standard_derivatives
  float u2 = fract(uv.x + 0.5) - 0.5;
  if(fwidth(u2) < fwidth(uv.x) - 0.00001) uv.x = u2;
#endif
  return uv;
}
vec3 lin(vec3 c){ return c*c*(c*0.305306 + 0.682171) + c*0.012522; }
// crisp stars in screen space (a little parallax) over the faint Milky Way map
vec3 space(vec3 rd, vec2 fc){
  vec3 mw = lin(texture2D(uSkyT, seam(equi(uRot*rd))).rgb);
  vec3 col = mw*mw*1.6;
  float px = uRes.y/1080.0;
  vec2 s = (fc/px + uMouse*vec2(14.0, 9.0))/5.5;
  vec2 c = floor(s); float h = hash(c);
  vec2 f = fract(s) - 0.5 - (vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5)*0.7;
  float star = step(0.987, h)*smoothstep(0.17, 0.0, length(f))*(0.25 + 0.75*pow(hash(c + 1.9), 3.0));
  star *= 0.8 + 0.2*sin(uTime*(1.0 + 2.0*hash(c + 4.4)) + h*40.0);
  vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), hash(c + 8.8));
  return col + tint*star*1.6;
}
// the tiny white dot on your location, drawn after tone mapping so it stays pure white
vec3 marker(vec3 col, vec2 fc){
  if(uMarkP.z <= 0.0) return col;
  float px = uRes.y/1080.0;
  float d = length(fc - uMarkP.xy)/px;
  col = mix(col, vec3(1.0), smoothstep(2.9, 1.9, d)*uMarkP.z);
  return col + vec3(1.0)*exp(-d*d/40.0)*0.22*uMarkP.z;
}
`;

const EARTH = `${CAMERA}
uniform sampler2D uDay; uniform sampler2D uNit; uniform sampler2D uCld;
uniform sampler2D uDayR; uniform sampler2D uNitR; uniform sampler2D uCldR;
uniform vec4 uRegion; uniform float uCldShift;
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec3 ro; vec3 rd; camRay(fc, ro, rd);
  vec3 L = uSunV;
  vec3 col = space(rd, fc);

  // closest approach of the ray to the centre: the limb, the horizon and the air above it
  float b = dot(ro, rd); vec3 cp = ro - rd*b; float hgt = length(cp);
  float pxw = 2.0*uCam.z/uRes.y*max(-b, 0.05);
  float hh = 1.0 - hgt*hgt;
  vec3 n = normalize(cp - rd*sqrt(max(hh, 0.0)));
  float cov = b < 0.0 ? smoothstep(1.0 + pxw, 1.0 - pxw, hgt) : 0.0;

  vec3 e = uRot*n;
  vec2 uv = seam(equi(e));
  vec2 cuv = uv + vec2(uCldShift, 0.0);
  vec3 day = texture2D(uDay, uv).rgb;
  vec3 nit = texture2D(uNit, uv).rgb;
  float cld = texture2D(uCld, cuv).r;
  // the sharp patch from the 8k maps around you
  if(uRegion.z > 0.0){
    float lon = atan(e.x, e.z); float lat = asin(clamp(e.y, -1.0, 1.0));
    vec2 r = vec2(mod(lon - uRegion.x, 2.0*PI)/uRegion.z, (uRegion.y - lat)/uRegion.w);
    float w = smoothstep(0.0, 0.04, min(r.x, 1.0 - r.x))*smoothstep(0.0, 0.04, min(r.y, 1.0 - r.y));
    vec2 rc = clamp(r, 0.0, 1.0);
    day = mix(day, texture2D(uDayR, rc).rgb, w);
    nit = mix(nit, texture2D(uNitR, rc).rgb, w);
    cld = mix(cld, texture2D(uCldR, rc + vec2(uCldShift*2.0*PI/uRegion.z, 0.0)).r, w);
  }
  day = lin(day); nit = lin(nit);

  // the map's oceans are one flat blue; make them deep navy and keep the shallow seas lighter
  float water = smoothstep(0.03, 0.1, day.b - day.r);
  vec3 land = mix(vec3(dot(day, vec3(0.3, 0.55, 0.15))), day, 1.25);
  vec3 ground = mix(land*vec3(0.78, 0.8, 0.74), day*vec3(0.09, 0.16, 0.25), water);
  float c = smoothstep(0.06, 0.92, cld);
  c = c*(0.85 + 0.15*c);

  float ndl = dot(n, L);
  float lit = smoothstep(-0.1, 0.18, ndl);
  // cloud shadows on the ground, offset away from the Sun
  if(uQ > 0.5){
    vec3 es = normalize(e + (uRot*L)*0.0045);
    float cs = texture2D(uCld, seam(equi(es)) + vec2(uCldShift, 0.0)).r;
    ground *= 1.0 - 0.5*smoothstep(0.1, 0.8, cs)*lit;
  }
  // low sunlight goes orange through more air
  vec3 sunc = vec3(1.0, 0.97, 0.92)*mix(vec3(1.0), vec3(1.0, 0.5, 0.25), exp(-pow(max(ndl, 0.0)/0.16, 2.0))*0.75);
  float dif = max(ndl, 0.0) + 0.05*smoothstep(-0.18, 0.0, ndl);
  vec3 surf = mix(ground, vec3(0.8, 0.82, 0.86), c)*sunc*dif*1.75;
  vec3 V = -rd;
  vec3 H = normalize(L + V);
  float nh = max(dot(n, H), 0.0);
  surf += vec3(1.0, 0.86, 0.66)*sunc*(pow(nh, 260.0)*2.2 + pow(nh, 36.0)*0.1)*water*(1.0 - c)*step(0.0, ndl);
  // night: warm city lights (softened under cloud) and a faint moonlit land, like a long exposure
  float night = 1.0 - smoothstep(-0.16, 0.06, ndl);
  vec3 lights = nit*vec3(1.0, 0.7, 0.4)*(5.0 + 2.0*uQ)*(1.0 - c*0.75);
  vec3 moonlit = mix(ground, vec3(0.45, 0.47, 0.5), c)*vec3(0.45, 0.6, 1.0)*0.022;
  surf += (lights + moonlit)*night;
  // air: haze toward the limb, blue on the day side
  float mu = max(dot(n, V), 0.0);
  float haze = pow(1.0 - mu, 2.6);
  vec3 sky = vec3(0.16, 0.4, 1.0)*smoothstep(-0.25, 0.5, ndl);
  surf = mix(surf, sky*0.9, haze*0.6) + sky*0.02*(1.0 - mu);
  col = mix(col, surf, cov);

  // the glow of the atmosphere beyond the edge
  if(b < 0.0 && hgt > 1.0 - pxw){
    float a = max(hgt - 1.0, 0.0);
    vec3 up = cp/hgt;
    float sl = dot(up, L);
    float glow = exp(-a*90.0)*0.8 + exp(-a*450.0)*0.9;
    vec3 ac = mix(vec3(0.22, 0.48, 1.0), vec3(1.0, 0.5, 0.22), exp(-pow(sl/0.2, 2.0))*0.7);
    col += ac*glow*smoothstep(-0.35, 0.45, sl)*(1.0 - cov)*1.3;
  }
  vec3 o = finish(col, fc);
  gl_FragColor = vec4(marker(o, fc), 1.0);
}
`;

const BODY = `${CAMERA}
uniform sampler2D uAlb; uniform sampler2D uRingT;
// uKind: x relief from the map, y gas-giant softness, z atmosphere, w rings
uniform vec4 uKind; uniform vec3 uAtm; uniform vec2 uTexel; uniform float uGlow; uniform float uExp;
const float R0 = 1.24; const float R1 = 2.27;
vec4 ring(float r){
  float u = (r - R0)/(R1 - R0);
  vec4 t = texture2D(uRingT, vec2(clamp(u, 0.0, 1.0), 0.5));
  t.rgb *= vec3(1.0, 0.88, 0.7);
  return t*step(0.0, u)*step(u, 1.0);
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec3 ro; vec3 rd; camRay(fc, ro, rd);
  vec3 L = uSunV;
  vec3 bg = space(rd, fc);

  float b = dot(ro, rd); vec3 cp = ro - rd*b; float hgt = length(cp);
  float pxw = 2.0*uCam.z/uRes.y*max(-b, 0.05);
  float hh = 1.0 - hgt*hgt;
  vec3 n = normalize(cp - rd*sqrt(max(hh, 0.0)));
  float cov = b < 0.0 ? smoothstep(1.0 + pxw, 1.0 - pxw, hgt) : 0.0;
  float tP = -b - sqrt(max(hh, 0.0));

  vec3 e = uRot*n;
  vec2 uv = equi(e); uv.x += uSpin; uv = seam(uv);
  vec3 tx = texture2D(uAlb, uv).rgb;
  vec3 alb = lin(tx);
  vec3 nn = n;
  if(uKind.x > 0.0){
    // relief from the map's own shading: brighter reads as higher
    float hx = dot(texture2D(uAlb, uv + vec2(uTexel.x, 0.0)).rgb - texture2D(uAlb, uv - vec2(uTexel.x, 0.0)).rgb, vec3(0.333));
    float hy = dot(texture2D(uAlb, uv - vec2(0.0, uTexel.y)).rgb - texture2D(uAlb, uv + vec2(0.0, uTexel.y)).rgb, vec3(0.333));
    vec3 east = normalize(vec3(e.z, 0.0, -e.x) + vec3(1e-5, 0.0, 0.0));
    vec3 north = cross(e, east);
    nn = normalize(e - (east*hx + north*hy)*uKind.x)*uRot;
  }
  float ndl = dot(nn, L);
  float mu = max(dot(n, -rd), 0.0);
  float light = mix(max(ndl, 0.0), smoothstep(-0.12, 1.0, dot(n, L)), uKind.y);
  float limb = mix(1.0, pow(mu, 0.3), uKind.y);
  vec3 pc = alb*light*limb*uExp + alb*uGlow;
  pc += uAtm*pow(1.0 - mu, 2.5)*smoothstep(-0.2, 0.5, dot(n, L))*uKind.z;
  if(uKind.w > 0.5){
    // the rings' shadow across the planet
    vec3 eb = uRot*n; vec3 Lb = uRot*L;
    float s = -eb.y/(abs(Lb.y) < 1e-3 ? 1e-3 : Lb.y);
    pc *= 1.0 - ring(length(eb.xz + Lb.xz*s)).a*0.85*step(0.0, s);
  }
  vec3 col = mix(bg, pc, cov);
  if(uKind.z > 0.0 && b < 0.0){
    float a = max(hgt - 1.0, 0.0);
    col += uAtm*(exp(-a*60.0)*0.5 + exp(-a*300.0)*0.5)*smoothstep(-0.3, 0.5, dot(cp/hgt, L))*uKind.z*(1.0 - cov);
  }
  if(uKind.w > 0.5){
    vec3 rob = uRot*ro; vec3 rdb = uRot*rd;
    float tr = -rob.y/(abs(rdb.y) < 1e-5 ? 1e-5 : rdb.y);
    vec3 pr = rob + rdb*tr;
    vec4 rc = ring(length(pr.xz));
    if(tr > 0.0){
      vec3 Lb = uRot*L;
      // the planet's shadow on the rings
      float sb = -dot(pr, Lb);
      float sh = sb > 0.0 ? smoothstep(0.97, 1.03, length(pr + Lb*sb)) : 1.0;
      vec3 rcol = lin(rc.rgb)*(0.35 + 0.9*sqrt(abs(Lb.y)))*(0.06 + 0.94*sh)*uExp;
      float a = rc.a*(tr < tP ? 1.0 : 1.0 - cov);
      col = mix(col, rcol, a);
    }
  }
  gl_FragColor = vec4(finish(col, fc), 1.0);
}
`;

const SUN = `${CAMERA}
uniform sampler2D uAlb;
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec3 ro; vec3 rd; camRay(fc, ro, rd);
  vec3 col = space(rd, fc)*0.5;
  float b = dot(ro, rd); vec3 cp = ro - rd*b; float hgt = length(cp);
  float pxw = 2.0*uCam.z/uRes.y*max(-b, 0.05);
  float hh = 1.0 - hgt*hgt;
  vec3 n = normalize(cp - rd*sqrt(max(hh, 0.0)));
  float cov = b < 0.0 ? smoothstep(1.0 + pxw, 1.0 - pxw, hgt) : 0.0;
  vec3 e = uRot*n;
  // the surface boils: the map, gently warped, over fine moving granules
  vec2 w = vec2(fbm(e.xy*5.0 + uTime*0.03), fbm(e.zy*5.0 - uTime*0.025)) - 0.5;
  vec2 uv = equi(e); uv.x += uSpin; uv = seam(uv + w*0.01);
  float s = dot(texture2D(uAlb, uv).rgb, vec3(0.4, 0.4, 0.2));
  float gr = noise(uv*vec2(900.0, 450.0) + uTime*0.4)*0.5 + noise(uv*vec2(300.0, 150.0) - uTime*0.2)*0.5;
  float mu = max(dot(n, -rd), 0.0);
  float limb = 0.3 + 0.7*pow(mu, 0.6);
  vec3 sc = mix(vec3(0.9, 0.22, 0.02), vec3(1.0, 0.75, 0.35), smoothstep(0.3, 0.9, s*0.9 + gr*0.25))*limb*2.1;
  // corona and streamers
  float a = max(hgt - 1.0, 0.0);
  float ang = atan(cp.y, cp.x);
  float rays = 0.55 + 0.45*fbm(vec2(ang*4.0, a*1.5 - uTime*0.04));
  vec3 cor = vec3(1.0, 0.45, 0.12)*(exp(-a*14.0)*1.3 + exp(-a*3.5)*0.3*rays + exp(-a*1.2)*0.035)*(b < 0.0 ? 1.0 : 0.0);
  col = mix(col + cor, sc, cov);
  gl_FragColor = vec4(finish(col, fc), 1.0);
}
`;

export const ASTRO_SHADERS = { earth: EARTH, body: BODY, sun: SUN };
// the shaders that pick mip levels by screen-space derivatives
export const DERIVATIVES = new Set(['earth', 'body', 'sun']);

// ------------------------------------------------------------------ bodies

const RAD = Math.PI / 180;
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
// 3x3, column-major (what uniformMatrix3fv takes)
const rx = (a) => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
const rz = (a) => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const mul = (a, b) => {
  const o = new Array(9).fill(0);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) o[c * 3 + r] += a[k * 3 + r] * b[c * 3 + k];
  return o;
};
const tmul = (m, v) => [0, 1, 2].map((c) => m[c * 3] * v[0] + m[c * 3 + 1] * v[1] + m[c * 3 + 2] * v[2]); // transpose(m) * v

// a nice studio light for planets we don't place by the real Sun: from the front left, a bit above
const KEY = norm([-0.78, 0.28, 0.56]);

// pole tipped toward you by `tip` and rolled by `roll` (view -> body rotation)
const pose = (tip, roll = 0) => mul(rx(-tip), rz(-roll));

export const BODIES = {
  earth: { shader: 'earth', maps: ['earth_daymap', 'earth_nightmap', 'earth_clouds'] },
  city: { shader: 'earth', maps: ['earth_daymap', 'earth_nightmap', 'earth_clouds'], close: true },
  moon: { shader: 'body', map: 'moon', bump: 1.6 },
  mercury: { shader: 'body', map: 'mercury', bump: 1.3, spin: 0.0006, caption: 'Mercury · closest to the Sun' },
  venus: { shader: 'body', map: 'venus_atmosphere', soft: 0.6, exp: 1.6, atm: [1, 0.78, 0.45], atmK: 0.5, spin: 0.0004, caption: 'Venus · the hottest planet' },
  mars: { shader: 'body', map: 'mars', bump: 0.7, atm: [1, 0.5, 0.3], atmK: 0.3, spin: 0.0015, tip: 0.25, caption: 'Mars · the red planet' },
  jupiter: { shader: 'body', map: 'jupiter', soft: 1, exp: 1.9, spin: 0.0028, tip: 0.05, caption: 'Jupiter · largest planet' },
  saturn: { shader: 'body', map: 'saturn', soft: 1, exp: 1.45, rings: true, spin: 0.0025, tip: 0.42, roll: -0.12, size: 0.7, caption: 'Saturn · 146 moons' },
  uranus: { shader: 'body', map: 'uranus', soft: 0.85, atm: [0.55, 0.85, 1], atmK: 0.45, spin: 0.001, tip: -0.3, roll: 1.2, caption: 'Uranus · spins on its side' },
  neptune: { shader: 'body', map: 'neptune', soft: 0.85, atm: [0.3, 0.5, 1], atmK: 0.55, spin: 0.0012, tip: 0.3, caption: 'Neptune · the windiest planet' },
  sun: { shader: 'sun', map: 'sun', spin: 0.0008, caption: 'The Sun · 150 million km away' },
};

// Camera framings. d: distance from the centre in radii, up: how far the camera looks up from
// the centre, tan: half the field of view, y: where your location sits on screen.
const VIEWS = {
  globe: { d: 6.2, up: 0, tan: 0.24, y: 0.09, shiftY: -0.02 },
  city: { d: 1.33, up: 0.56, tan: 0.42, y: -0.13, shiftY: 0 },
  body: { d: 6.2, up: 0, tan: 0.24, shiftY: -0.02 },
  near: { d: 3.1, up: 0, tan: 0.24, shiftY: -0.1 },
};
export const viewsFor = (body) => (body === 'earth' || body === 'city' ? ['globe', 'city'] : ['body', 'near']);
export const startView = (body) => (BODIES[body]?.close ? 'city' : viewsFor(body)[0]);

export function lerpView(a, b, k) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = key === 'd' ? 1 + (a.d - 1) * Math.pow((b.d - 1) / (a.d - 1), k) : a[key] + ((b[key] ?? a[key]) - a[key]) * k;
  return out;
}
export const view = (name) => ({ ...VIEWS[name] });
// where the iPhone-style "unlock" zoom starts from
export const pulledBack = (v) => ({ ...v, d: 1 + (v.d - 1) * 1.45 });

// the camera basis, matching camRay in the shader
function basis(v) {
  const ct = Math.cos(v.up);
  const st = Math.sin(v.up);
  return { fw: [0, st, -ct], up: [0, ct, st] };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// the ray through a screen point (p units) hits the unit sphere where? (view space)
function hit(v, px, py) {
  const { fw, up } = basis(v);
  const k = 2 * v.tan;
  const rd = norm([px * k, fw[1] + up[1] * py * k, fw[2] + up[2] * py * k]);
  const ro = [0, 0, v.d];
  const b = dot(ro, rd);
  const h = b * b - (dot(ro, ro) - 1);
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
}

// screen point (p units, before shift) of a view-space point on the sphere, or null if hidden
function project(v, q) {
  const { fw, up } = basis(v);
  const c = [0, 0, v.d];
  if (dot(q, [c[0] - q[0], c[1] - q[1], c[2] - q[2]]) <= 0) return null;
  const w = [q[0] - c[0], q[1] - c[1], q[2] - c[2]];
  const z = dot(w, fw);
  return [w[0] / z / (2 * v.tan), dot(w, up) / z / (2 * v.tan)];
}

// is a click (p units) on the planet?
export function onBody(v, p, shift) {
  return !!hit(v, p[0] - shift[0], p[1] - shift[1]);
}

// Everything the shader needs for this frame: rotation, light, camera, marker, caption.
export function frameState(body, v, ctx, time, size, mouse) {
  const B = BODIES[body] || BODIES.moon;
  const shift = [mouse[0] * 0.012, v.shiftY + mouse[1] * 0.008];
  const u = { uCam: [v.d, v.up, v.tan, 0], uShift: shift, uSpin: 0, uMarkP: [0, 0, 0] };
  let caption = B.caption || '';
  if (B.shader === 'earth') {
    const home = homeFor(ctx);
    const s = subsolar(ctx.now?.() || new Date());
    const at = hit(v, 0, v.y) || [0, Math.sin(0.3), Math.cos(0.3)];
    const tilt = Math.atan2(at[1], at[2]);
    const rot = viewRotation(home.lat, home.lon, tilt);
    const sunBody = toVec(s.lat, s.lon);
    const homeV = [0, Math.sin(tilt), Math.cos(tilt)];
    const sunV = tmul(rot, sunBody);
    const pt = project(v, homeV);
    const H = size[1];
    u.uRot = rot;
    u.uSunV = sunV;
    u.uCldShift = (time * 0.00002) % 1;
    if (pt) u.uMarkP = [(pt[0] + shift[0]) * H + size[0] / 2, (pt[1] + shift[1]) * H + H / 2, 1];
    const day = dot(sunV, homeV) > 0;
    caption = `${home.name || 'Your location'} · ${day ? 'Day' : 'Night'}`;
    return { u, caption, home };
  }
  if (body === 'moon') {
    const m = moon(ctx.now?.() || new Date());
    const a = 2 * Math.PI * m.age;
    u.uRot = rx(-4 * RAD);
    u.uSunV = norm([Math.sin(a), 0.1, -Math.cos(a)]);
    u.uGlow = 0.006; // earthshine on the dark side
    caption = `${m.name} · ${Math.round(m.illum * 100)}% lit`;
  } else {
    u.uRot = pose(B.tip || 0.1, B.roll || 0);
    u.uSunV = KEY;
    u.uSpin = (time * (B.spin || 0)) % 1;
    u.uGlow = 0;
  }
  u.uKind = [B.bump || 0, B.soft || 0, B.atmK || 0, B.rings ? 1 : 0];
  u.uExp = B.exp || 2.4;
  u.uAtm = B.atm || [0, 0, 0];
  return { u, caption };
}

// the patch of the 8k Earth maps worth loading for a framing (degrees), and its size
export function regionFor(home, close, tier) {
  if (tier === 'low' || tier === 'still') return null;
  const span = close ? 100 : 180;
  const lat1 = Math.min(90, home.lat + span / 2);
  const lat0 = Math.max(-90, home.lat - span / 2);
  const n = tier === 'high' && !close ? 4096 : 2048;
  return { lon0: home.lon - span / 2, span, lat1, spanLat: lat1 - lat0, n };
}

// the size each body is drawn at on screen (Saturn smaller, its rings need the room)
export function sized(body, v) {
  const s = BODIES[body]?.size || 1;
  return s === 1 ? v : { ...v, d: 1 + (v.d - 1) / s };
}

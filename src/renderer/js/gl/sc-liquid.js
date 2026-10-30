// Liquid pack: chrome blobs, a soap bubble, a koi pond and ink in water, all reacting to the
// cursor. The strings are appended after COMMON (see shaders.js).
// uPtr: the cursor in the same units as p (xy) and how fast it is moving (zw, units a second);
// it sits far off screen until the mouse first moves.

import { PRE } from './sc-galaxy.js';

// Chrome Blobs: mirror-polished metaballs in a studio. They lean toward the cursor (a thread of
// metal stretches out to it) and a click flings a droplet that falls back and merges.
const BLOBS = `
uniform vec4 uPtr;
vec3 gB[6]; float gR[6];
vec3 gC; float gCR; vec3 gD; float gDR;
float map(vec3 p){
  float d = 1e3;
  for(int i = 0; i < 6; i++) d = smin(d, length(p - gB[i]) - gR[i], 0.45);
  d = smin(d, length(p - gC) - gCR, 0.7);
  return smin(d, length(p - gD) - gDR, 0.45);
}
vec3 nrm(vec3 p){ vec2 e = vec2(0.002, -0.002);
  return normalize(e.xyy*map(p + e.xyy) + e.yyx*map(p + e.yyx) + e.yxy*map(p + e.yxy) + e.xxx*map(p + e.xxx)); }
float box(vec2 ae, vec2 c, vec2 h){ vec2 d = abs(ae - c) - h; return smoothstep(0.08, -0.02, max(d.x, d.y)); }
// the studio the metal reflects: coloured softboxes behind the camera, a white strip overhead
// and a bright floor, so the chrome reads as chrome
vec3 env(vec3 rd){
  float az = atan(rd.x, -rd.z); float el = asin(clamp(rd.y, -1.0, 1.0));
  vec2 ae = vec2(az, el);
  float k = mix(1.0, 0.6, uNight);
  vec3 c = mix(vec3(0.1, 0.1, 0.11), vec3(0.008, 0.008, 0.012), smoothstep(0.0, 0.9, el))*mix(1.0, 0.45, uNight);
  // a dark floor that brightens into a glowing horizon band
  c = mix(c, mix(vec3(0.035, 0.035, 0.04), vec3(0.01), uNight), smoothstep(0.0, -0.08, el));
  c += vec3(0.75, 0.77, 0.82)*exp(-pow((el + 0.03)/0.045, 2.0))*k;
  c += mix(uA, uB, 0.5 + 0.5*sin(az))*0.08*smoothstep(-0.1, -0.6, el)*k;
  c += uA*box(ae, vec2(-2.35, 0.3), vec2(0.4, 0.45))*2.4*k;
  c += uB*box(ae, vec2(2.3, 0.2), vec2(0.35, 0.5))*2.2*k;
  c += uC*box(ae, vec2(0.0, 0.25), vec2(0.5, 0.3))*1.4*k;
  c += vec3(1.0)*box(ae, vec2(3.14, 1.0), vec2(1.2, 0.08))*3.2*k;
  c += vec3(1.0)*box(ae, vec2(-3.14, 1.0), vec2(1.2, 0.08))*3.2*k;
  c += vec3(1.0)*box(ae, vec2(1.75, 0.1), vec2(0.05, 0.45))*2.4*k;
  return c;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - 0.5*uRes)/uRes.y;
  float t = uTime*0.5;
  // the cursor on the plane the blobs float in (the camera sees 3 units per screen height there)
  vec3 C = vec3(uPtr.xy*3.0, 0.0);
  vec3 M = vec3(0.0);
  float nd = 99.0;
  for(int i = 0; i < 6; i++){
    float fi = float(i);
    float h1 = hash(vec2(fi, 1.3)); float h2 = hash(vec2(fi, 4.7)); float h3 = hash(vec2(fi, 8.1));
    vec3 b = vec3(sin(t*(0.5 + 0.4*h1) + h2*6.28)*1.85, cos(t*(0.4 + 0.3*h2) + h3*6.28)*0.85, sin(t*(0.3 + 0.3*h3) + h1*6.28)*0.6);
    // lean toward the cursor, nearer blobs more
    vec3 dc = C - b;
    b += dc*exp(-dot(dc.xy, dc.xy)*0.3)*0.4;
    float r = 0.3 + 0.24*h3;
    gB[i] = b; gR[i] = r;
    M += b/6.0;
    nd = min(nd, length(C - b) - r);
  }
  // a thread of metal reaching out to the cursor
  gCR = 0.17*smoothstep(1.7, 0.35, nd);
  gC = gCR > 0.005 ? C : vec3(0.0, 0.0, 60.0);
  // a click flings a droplet out to it, then it falls back in and merges
  float tz = uTap.z;
  if(tz < 2.6){
    float k = pow(sin(PI*clamp(tz/2.6, 0.0, 1.0)), 0.6);
    gD = mix(M, vec3(uTap.xy*3.0, 0.3), k);
    gDR = 0.3 + 0.06*sin(tz*10.0)*exp(-tz*1.5);
  } else { gD = vec3(0.0, 0.0, 60.0); gDR = 0.0; }

  vec3 bg = mix(mix(vec3(0.2, 0.2, 0.22), vec3(0.09, 0.09, 0.1), smoothstep(-0.5, 0.5, p.y)), mix(vec3(0.016, 0.016, 0.022), vec3(0.004, 0.004, 0.008), smoothstep(-0.5, 0.5, p.y)), uNight);
  bg += mix(uA, uB, 0.5 + 0.5*p.x)*exp(-dot(p, p)*2.5)*mix(0.07, 0.05, uNight);
  vec3 col = bg;

  vec3 ro = vec3(uMouse.x*0.35, uMouse.y*0.22, 6.0);
  vec3 rd = normalize(vec3(p, -2.0));
  // only march inside the sphere the blobs can reach
  float b = dot(ro, rd); float h = b*b - dot(ro, ro) + 4.4*4.4;
  if(h > 0.0){
    float t1 = -b + sqrt(h);
    float tt = max(-b - sqrt(h), 0.0);
    bool hit = false;
    float steps = uQ < 0.5 ? 56.0 : 88.0;
    for(int i = 0; i < 88; i++){
      if(float(i) >= steps) break;
      float d = map(ro + rd*tt);
      if(d < 0.0012){ hit = true; break; }
      tt += d;
      if(tt > t1) break;
    }
    if(hit){
      vec3 pp = ro + rd*tt; vec3 n = nrm(pp);
      vec3 r = reflect(rd, n);
      vec3 rc = env(r);
      // High: the blobs see each other in their reflections
      if(uQ > 1.5){
        float t2 = 0.03; bool h2 = false;
        for(int i = 0; i < 36; i++){ float d = map(pp + r*t2); if(d < 0.002){ h2 = true; break; } t2 += d; if(t2 > 7.0) break; }
        if(h2){ vec3 p2 = pp + r*t2; rc = env(reflect(r, nrm(p2)))*vec3(0.82, 0.83, 0.86); }
      }
      float fres = pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
      col = rc*mix(vec3(0.8, 0.81, 0.85), vec3(1.0), fres);
      // darker where blobs meet
      col *= 0.6 + 0.4*clamp(map(pp + n*0.22)/0.22, 0.0, 1.0);
    }
  }
  gl_FragColor = vec4(finish(col, fc), 1.0);
}
`;

// Soap Bubble: a big bubble with a real thin-film rainbow (the film drains, thick and colourful
// at the bottom, thin and dark at the top) reflecting a room with a window. Moving the cursor past
// it makes it wobble; clicking it pops it and a new one grows back.
const BUBBLE = `
uniform vec4 uPtr;
// how much each colour a soap film of thickness d (nm) reflects at an angle (cos ct)
vec3 film(float d, float ct){
  float cr = sqrt(1.0 - (1.0 - ct*ct)/1.77);
  vec3 ph = 4.0*PI*1.33*d*cr/vec3(650.0, 532.0, 450.0);
  return 0.5 - 0.5*cos(ph);
}
vec3 backdrop(vec2 p){
  vec3 top = mix(uB*0.5 + 0.06, uB*0.08, uNight);
  vec3 bot = mix(mix(uA, uC, 0.5)*0.42 + 0.03, mix(uA, uC, 0.5)*0.05, uNight);
  vec3 c = mix(bot, top, smoothstep(-0.65, 0.6, p.y));
  // out-of-focus lights behind
  for(int i = 0; i < 9; i++){
    float fi = float(i);
    vec2 o = (vec2(hash(vec2(fi, 2.0)), hash(vec2(fi, 5.0)))*2.0 - 1.0)*vec2(0.95, 0.55);
    o += 0.03*vec2(sin(uTime*0.07 + fi), cos(uTime*0.05 + fi*1.7)) - uMouse*0.03;
    float r = 0.05 + 0.1*hash(vec2(fi, 9.0));
    vec3 bc = mix(mix(uA, uC, hash(vec2(fi, 3.3))), vec3(1.0), 0.3);
    c += bc*smoothstep(r, r*0.8, length(p - o))*mix(0.1, 0.16, uNight);
  }
  return c;
}
// the room the bubble reflects: a bright window up to the left, a warm lamp to the right
vec3 room(vec3 r){
  vec3 c = mix(vec3(0.08, 0.08, 0.1), vec3(0.55, 0.6, 0.7), smoothstep(-0.3, 0.6, r.y))*mix(1.0, 0.2, uNight);
  vec3 W = normalize(vec3(-0.5, 0.5, 0.7)); vec3 X = normalize(cross(vec3(0.0, 1.0, 0.0), W)); vec3 Y = cross(W, X);
  float f = dot(r, W);
  vec2 wv = vec2(dot(r, X), dot(r, Y))/max(f, 0.001);
  float win = step(0.0, f)*smoothstep(0.04, 0.0, max(abs(wv.x) - 0.32, abs(wv.y) - 0.42));
  win *= smoothstep(0.0, 0.025, abs(wv.x))*smoothstep(0.0, 0.025, abs(wv.y));
  c += vec3(1.0, 0.98, 0.95)*win*mix(3.2, 0.5, uNight);
  c += mix(uC, vec3(1.0, 0.75, 0.45), 0.6)*pow(max(dot(r, normalize(vec3(0.8, 0.05, 0.6))), 0.0), 30.0)*mix(0.6, 2.6, uNight);
  return c;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - 0.5*uRes)/uRes.y;
  float t = uTime;
  bool hi = uQ > 0.5;
  vec3 col = backdrop(p);
  float px = 1.5/uRes.y;

  // little bubbles rising behind
  for(int i = 0; i < 6; i++){
    float fi = float(i);
    float h1 = hash(vec2(fi, 7.1)); float h2 = hash(vec2(fi, 8.3));
    float rr = 0.018 + 0.03*h2;
    vec2 o = vec2((h1*2.0 - 1.0)*0.85 + 0.03*sin(t*0.6 + fi*2.0), fract(t*(0.02 + 0.02*h2) + h1)*1.4 - 0.7) - uMouse*0.05;
    vec2 qq = (p - o)/rr; float r = length(qq);
    if(r < 1.2){
      float z = sqrt(max(1.0 - r*r, 0.0));
      vec3 fr = film(350.0 + 400.0*fbm3(qq*1.5 + fi + t*0.05), z);
      float a = smoothstep(1.0 + px/rr, 1.0 - px/rr, r);
      vec3 s = fr*(0.15 + 0.85*pow(r, 6.0))*0.7 + vec3(1.0)*smoothstep(0.3, 0.1, length(qq - vec2(-0.4, 0.45)))*0.6*mix(1.0, 0.5, uNight);
      col = mix(col, col + s, a);
    }
  }

  vec2 c = vec2(0.03*sin(t*0.13), 0.02 + 0.025*sin(t*0.21)) + uMouse*0.02;
  float R0 = 0.31;
  // a click on the bubble pops it; a new one grows back
  float pt = (length(uTap.xy - c) < R0 && uTap.z < 2.4) ? uTap.z : 99.0;
  float g = pt < 0.2 ? 1.0 : pt < 1.0 ? 0.0 : 1.0 - exp(-5.0*min((pt - 1.0)/1.2, 1.5))*cos(8.0*min((pt - 1.0)/1.2, 1.5));
  if(pt > 50.0) g = 1.0;
  float R = R0*g;

  vec2 q = p - c;
  float ang = atan(q.y, q.x);
  // wobble when the cursor sweeps past
  float sp = min(length(uPtr.zw), 3.0);
  float near = exp(-pow(max(length(uPtr.xy - c) - R, 0.0)/0.15, 2.0));
  float a = sp*near*0.018;
  float push = dot(normalize(q + 1e-5), normalize(uPtr.zw + 1e-5));
  float w = 0.006*sin(3.0*ang + t*1.3) + 0.004*sin(2.0*ang - t*0.9) + a*(0.6*sin(3.0*ang + t*11.0) + 0.4*sin(4.0*ang - t*13.0)) - a*0.5*push;
  float Rw = max(R*(1.0 + w), 1e-4);
  float r = length(q)/Rw;
  float inside = R > 0.002 ? smoothstep(1.0 + px/Rw, 1.0 - px/Rw, r) : 0.0;
  // the pop: a hole tears open from where you clicked
  float hole = 1.0;
  if(pt < 0.2){
    float hr = pt/0.2*2.2*R0;
    float dh = length(p - uTap.xy);
    hole = smoothstep(hr - 0.006, hr + 0.006, dh);
    col += vec3(1.0)*exp(-pow((dh - hr)/0.005, 2.0))*inside*0.8*(0.5 + 0.5*noise(vec2(atan(p.y - uTap.y, p.x - uTap.x)*12.0, 0.0)));
  }
  if(inside*hole > 0.0){
    vec2 qq = q/Rw; float z = sqrt(max(1.0 - dot(qq, qq), 0.0));
    vec3 n = vec3(qq, z);
    // the film drains: thick and colourful below, thin and dark at the top, swirling
    vec2 sw = rot(t*0.04)*qq;
    vec2 wq = sw*2.0 + (hi ? vec2(fbm(sw*2.2 + t*0.05), fbm(sw*2.2 - t*0.045 + 3.0)) : vec2(fbm3(sw*2.2 + t*0.05), fbm3(sw*2.2 - t*0.045 + 3.0)))*1.7;
    float th = 260.0 + 560.0*(hi ? fbm(wq + vec2(0.0, t*0.035)) : fbm3(wq + vec2(0.0, t*0.035))) + 240.0*smoothstep(0.6, -1.0, qq.y);
    th = max(th - 300.0*smoothstep(0.5, 1.0, qq.y), 15.0);
    vec3 fr = film(th, z);
    float F = 0.04 + 0.96*pow(1.0 - z, 5.0);
    vec3 r1 = vec3(2.0*z*qq, 2.0*z*z - 1.0);
    vec3 r2 = vec3(-2.0*z*qq, 2.0*z*z - 1.0);
    vec3 spec = room(r1)*fr*(0.45 + 2.4*F) + room(r2)*film(th*1.05, z)*0.1;
    vec3 through = backdrop(p - qq*R*0.035*z);
    vec3 bub = through*(1.0 - 0.12*F) + spec + fr*fr*0.09;
    bub += mix(vec3(1.0), fr, 0.6)*smoothstep(0.88, 1.0, r)*0.1;
    col = mix(col, bub, inside*hole);
  }
  // the spray of the pop
  if(pt < 1.0){
    for(int i = 0; i < 18; i++){
      float fi = float(i);
      float an = fi/18.0*6.2832 + hash(vec2(fi, 2.2))*0.4;
      float s = 0.25 + 0.3*hash(vec2(fi, 4.4));
      vec2 o = c + vec2(cos(an), sin(an))*(R0 + s*pt) + vec2(0.0, -0.25*pt*pt);
      col += vec3(1.0)*smoothstep(0.006, 0.0, length(p - o))*(1.0 - pt)*0.8;
    }
  }
  gl_FragColor = vec4(finish(col*1.05, fc), 1.0);
}
`;

// Koi Pond: looking down into a garden pond. Koi swim slow loops of their own over the pebbles;
// the cursor and clicks only move the water (ripples that bend the view below), never the fish.
const KOI = `
uniform vec4 uPtr;
float gW;
// the bottom: rounded stones of different sizes, each turned its own way, bedded in silt
vec3 pebbles(vec2 p){
  vec2 g = floor(p); vec2 f = fract(p);
  float best = 9.0; float near = 9.0; vec2 id = g; vec2 rv = vec2(0.0);
  for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
    vec2 o = vec2(float(i), float(j));
    vec2 r = f - o - 0.2 - 0.6*vec2(hash(g + o), hash(g + o + 17.3));
    float rad = 0.3 + 0.22*hash(g + o + 4.4);
    r = rot(hash(g + o + 8.8)*6.28)*r;
    r.x *= 1.3;
    float d = length(r)/rad;
    near = min(near, d);
    if(d < 1.0 && d < best){ best = d; id = g + o; rv = r/rad; }
  }
  // silt, darker right beside the stones
  vec3 col = vec3(0.2, 0.18, 0.13)*(0.75 + 0.5*noise(p*2.7))*(0.55 + 0.45*smoothstep(1.0, 1.5, near));
  if(best < 1.0){
    float k = hash(id + 3.7);
    vec3 stone = mix(vec3(0.3, 0.28, 0.24), vec3(0.62, 0.59, 0.54), k)*(0.8 + 0.4*hash(id + 9.1));
    stone = mix(stone, vec3(0.48, 0.32, 0.2), step(0.75, hash(id + 5.5))*0.7);
    stone = mix(stone, vec3(0.15, 0.16, 0.15), step(0.88, hash(id + 2.2))*0.75);
    stone *= 0.9 + 0.2*noise(p*9.0 + id);
    vec3 n = normalize(vec3(rv*1.2, sqrt(max(1.0 - best*best, 0.0)) + 0.2));
    stone *= 0.3 + 0.85*max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
    col = mix(col, stone, smoothstep(1.0, 0.9, best));
  }
  return col;
}
// light focused by the waves onto the bottom (after Dave Hoskins)
float caustic(vec2 uv, float t){
  vec2 p = mod(uv*6.2832, 6.2832) - 250.0;
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for(int n = 0; n < 4; n++){
    float tt = t*(1.0 - (3.5/float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0/length(vec2(p.x/(sin(i.x + tt)/inten), p.y/(cos(i.y + tt)/inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
// the water surface: a breeze, the click's ripple, and little waves around the cursor
float surf(vec2 p, float t){
  float h = 0.0012*sin(dot(p, vec2(9.0, 5.0)) + t*1.3) + 0.0009*sin(dot(p, vec2(-6.0, 11.0)) + t*1.7) + 0.0006*sin(dot(p, vec2(17.0, -13.0)) + t*2.3);
  float r = length(p - uTap.xy); float tz = uTap.z;
  float fr = r - 0.3*tz;
  h += 0.006*sin(fr*70.0)*exp(-fr*fr/0.006)*exp(-tz*0.7)/(1.0 + r*6.0)*step(0.0, 0.3*tz + 0.05 - r);
  float rc = length(p - uPtr.xy);
  h += min(length(uPtr.zw), 2.0)*0.0025*sin(rc*90.0 - t*10.0)*exp(-rc*14.0);
  return h;
}
// where fish i is: each swims its own slow wandering loop around the pond
vec2 fishAt(float i, float t){
  float h1 = hash(vec2(i, 1.1)); float h2 = hash(vec2(i, 2.3)); float h3 = hash(vec2(i, 3.7)); float h4 = hash(vec2(i, 4.9));
  float s = (0.04 + 0.03*h1)*(h4 > 0.5 ? 1.0 : -1.0);
  return vec2(sin(t*s + h2*6.28)*(gW - 0.18) + 0.12*sin(t*s*2.3 + h3*6.28), sin(t*s*1.37 + h3*6.28)*0.3 + 0.08*sin(t*s*3.1 + h4*6.28));
}
// a koi in its own frame (x forward): body and fin distances, along (0 nose .. 1) and across (-1..1)
vec4 koi(vec2 lp, float L, float ph, float amp){
  float u = (0.5*L - lp.x)/L;
  float s = amp*L*(0.04 + u*u)*sin(u*3.6 - ph);
  float y = lp.y - s;
  float w = L*0.18*sqrt(clamp(u/0.22, 0.0, 1.0))*(1.0 - 0.86*smoothstep(0.32, 0.86, u));
  float body = max(abs(y) - w, max(-u, u - 0.86)*L);
  // the tail fin: a soft fork, and two pectoral fins that paddle
  float wt = L*0.2*smoothstep(0.76, 1.08, u);
  float fin = max(max(abs(y) - wt, (u - 1.04 - 0.12*abs(y)/max(wt, 1e-4))*L), (0.76 - u)*L);
  vec2 fq = vec2(lp.x - 0.24*L, abs(y) - 0.11*L);
  fq = rot(0.7 + 0.3*sin(ph*0.6))*fq;
  fin = min(fin, (length(fq/vec2(0.12*L, 0.045*L)) - 1.0)*0.045*L);
  return vec4(body, fin, u, y/max(w, 1e-4));
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - 0.5*uRes)/uRes.y;
  float t = uTime;
  bool hi = uQ > 0.5;
  float px = 1.2/uRes.y;
  gW = 0.5*uRes.x/uRes.y;
  // light: the sun by day; the moon plus a warm garden lamp by night
  vec2 sunD = vec2(-0.35, 0.45);
  vec2 lampP = vec2(-gW + 0.15, 0.42);
  float lamp = exp(-length(p - lampP)*2.2)*uNight;
  float light = mix(1.0, 0.13, uNight) + lamp*1.3;
  vec3 lightC = mix(vec3(1.0, 0.97, 0.9), mix(vec3(0.55, 0.65, 1.0), vec3(1.0, 0.7, 0.4), clamp(lamp*3.0, 0.0, 1.0)), uNight);

  // the surface tilts and bends what's below
  float e = 0.0015;
  float h0 = surf(p, t);
  vec2 grad = vec2(surf(p + vec2(e, 0.0), t) - h0, surf(p + vec2(0.0, e), t) - h0)/e;
  vec2 pb = p + grad*0.06;

  // the bottom: pebbles, deeper (darker) toward the middle, under dancing caustics
  vec3 bot = pebbles(pb*17.0 + 3.0);
  float deep = smoothstep(0.0, 0.7, 1.0 - length(p*vec2(0.7/gW, 1.0)*1.1));
  bot *= mix(1.0, 0.5, deep)*mix(vec3(1.0), uB*1.6 + 0.15, 0.5);
  float ca = caustic(pb*1.3 + 0.2, t*0.35);
  if(hi) ca = ca*0.6 + 0.4*caustic(pb*2.1 + 3.7, t*0.3);
  bot += vec3(0.9, 0.95, 0.85)*ca*0.8*mix(1.0, 0.0, uNight);

  // fish and lily pads cast soft shadows onto the bottom
  float shadow = 0.0;
  vec3 fishC = vec3(0.0); float fishA = 0.0;
  float n = hi ? 7.0 : 5.0;
  for(int i = 0; i < 7; i++){
    float fi = float(i);
    if(fi >= n) break;
    float h1 = hash(vec2(fi, 6.1)); float h2 = hash(vec2(fi, 7.3)); float dep = 0.2 + 0.6*hash(vec2(fi, 8.7));
    vec2 c = fishAt(fi, t);
    vec2 dir = normalize(fishAt(fi, t + 0.4) - fishAt(fi, t - 0.4) + 1e-5);
    float L = 0.13 + 0.07*h1;
    // an easy, unhurried tail beat
    float ph = t*(3.5 + 1.5*h2) + h2*30.0;
    float amp = 0.28;
    mat2 F = mat2(dir.x, -dir.y, dir.y, dir.x);
    // its shadow, further off and blurrier the higher it swims
    vec2 so = sunD*(1.0 - dep)*0.07 + vec2(0.0, -0.004);
    vec2 ls = F*(pb - c - so);
    if(dot(ls, ls) < L*L*1.6){
      vec4 k = koi(ls, L, ph, amp);
      float bl = 0.006 + 0.02*(1.0 - dep);
      shadow = max(shadow, smoothstep(bl, -bl, min(k.x, k.y + 0.002))*(0.5 + 0.2*(1.0 - dep)));
    }
    vec2 lp = F*(p + grad*0.07*dep - c);
    if(dot(lp, lp) < L*L*1.6){
      vec4 k = koi(lp, L, ph, amp);
      float bl = px + dep*0.003;
      float ab = smoothstep(bl, -bl, k.x);
      float af = smoothstep(bl, -bl, k.y)*0.55;
      if(ab + af > 0.0){
        // koi varieties: kohaku, showa, tancho, ogon and orange
        float kind = hash(vec2(fi, 9.9));
        vec3 white = vec3(0.97, 0.95, 0.9);
        vec3 red = uA;
        float pat = noise(vec2(k.z*5.0, k.w*1.3) + fi*13.0);
        float pat2 = noise(vec2(k.z*7.0, k.w*1.8) + fi*31.0 + 5.0);
        vec3 bc = white;
        if(kind < 0.35) bc = mix(white, red, smoothstep(0.42, 0.48, pat));
        else if(kind < 0.55){ bc = mix(white, red, smoothstep(0.45, 0.5, pat)); bc = mix(bc, vec3(0.05, 0.05, 0.06), smoothstep(0.6, 0.66, pat2)); }
        else if(kind < 0.7) bc = mix(white, red, smoothstep(0.075, 0.06, length(vec2(k.z - 0.14, k.w*0.04))));
        else if(kind < 0.85) bc = mix(red, vec3(1.0, 0.82, 0.4), 0.55)*1.1;
        else bc = mix(red, white, smoothstep(0.7, 0.75, pat)*0.6);
        // round back, a sheen along the spine, fine scales
        float ridge = sqrt(max(1.0 - k.w*k.w, 0.0));
        bc *= 0.62 + 0.45*ridge;
        bc += vec3(1.0)*pow(ridge, 8.0)*0.12*smoothstep(0.15, 0.4, k.z)*(1.0 - smoothstep(0.6, 0.8, k.z));
        if(hi) bc *= 0.96 + 0.06*sin(k.z*120.0 + abs(k.w)*20.0);
        vec3 fc2 = mix(bc, white, 0.5);
        vec3 col2 = mix(fc2, bc, ab/(ab + af + 1e-4));
        float a = max(ab, af);
        // deeper fish fade into the water
        col2 = mix(col2*lightC*light, uB*0.3*light, dep*0.22);
        fishC = mix(fishC, col2, a);
        fishA = max(fishA, a);
      }
    }
  }
  // lily pads (and a lotus on two of them) float on top
  vec3 padC = vec3(0.0); float padA = 0.0;
  for(int i = 0; i < 6; i++){
    float fi = float(i);
    vec2 c = (vec2(fract(fi*0.618 + 0.13), fract(fi*0.382 + 0.71))*2.0 - 1.0)*vec2(gW - 0.12, 0.38);
    c += 0.012*vec2(sin(t*0.11 + fi), cos(t*0.09 + fi*2.0));
    float r = 0.055 + 0.035*hash(vec2(fi, 13.0));
    float a0 = hash(vec2(fi, 14.0))*6.28 + 0.05*sin(t*0.07 + fi);
    vec2 sq = rot(a0)*(pb - c - sunD*0.05);
    float sd = max(length(sq) - r, -(abs(atan(sq.y, sq.x)) - 0.2)*length(sq));
    shadow = max(shadow, smoothstep(0.02, -0.02, sd)*0.55);
    vec2 q = rot(a0)*(p - c);
    float lq = length(q); float an = atan(q.y, q.x);
    float d = max(lq - r, -(abs(an) - 0.2)*lq);
    float a = smoothstep(px, -px, d);
    if(a > 0.0){
      vec3 g = mix(vec3(0.1, 0.25, 0.08), vec3(0.24, 0.42, 0.14), noise(q*40.0 + fi));
      g *= 0.9 + 0.1*sin(an*22.0);
      g = mix(g, vec3(0.45, 0.5, 0.15), smoothstep(-0.012, 0.0, d)*0.6);
      g += vec3(0.6, 0.7, 0.5)*pow(max(1.0 - lq/r, 0.0), 3.0)*0.12;
      if(mod(fi, 3.0) < 0.5){
        // a lotus: two rings of petals around a golden heart
        float pr = 0.42*r*(0.62 + 0.38*abs(cos(an*4.0 + 0.4)));
        float pr2 = 0.28*r*(0.62 + 0.38*abs(cos(an*4.0 + 1.2)));
        vec3 lot = mix(uC, vec3(1.0), smoothstep(pr*0.3, pr, lq)*0.55);
        g = mix(g, lot*(0.7 + 0.3*lq/pr), smoothstep(pr + px, pr - px, lq));
        g = mix(g, mix(uC, vec3(1.0), 0.25)*(0.75 + 0.4*lq/pr2), smoothstep(pr2 + px, pr2 - px, lq));
        g = mix(g, vec3(1.0, 0.8, 0.3), smoothstep(0.08*r + px, 0.08*r - px, lq));
      }
      padC = mix(padC, g*lightC*light, a);
      padA = max(padA, a);
    }
  }
  vec3 col = bot*lightC*light*(1.0 - shadow*mix(0.75, 0.35, uNight));
  // the water itself: tinted and hazier with depth
  vec3 water = mix(mix(uB, vec3(0.1, 0.2, 0.12), 0.35)*0.32, uB*0.06, uNight);
  col = mix(col, water, 0.45 + 0.3*deep);
  col = mix(col, fishC, fishA);
  // the surface reflects the sky and the trees around the pond, and the sun glints on ripples
  vec3 nrmS = normalize(vec3(-grad*0.6, 1.0));
  float fres = 0.03 + 0.25*pow(1.0 - nrmS.z, 2.0);
  float trees = smoothstep(0.35, 0.7, fbm3(p*2.0 + vec2(t*0.004, 0.0)))*smoothstep(0.15, 0.7, length(p*vec2(0.6/gW, 1.0)));
  vec3 sky = mix(mix(vec3(0.75, 0.85, 0.95), vec3(0.08, 0.14, 0.08), trees), vec3(0.02, 0.03, 0.06), uNight);
  col = mix(col, sky, fres + 0.03);
  vec3 L = normalize(vec3(sunD, 0.75));
  float spec = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), nrmS), L), 0.0), 220.0);
  col += lightC*spec*mix(1.6, 0.5, uNight);
  col += vec3(1.0, 0.75, 0.45)*lamp*0.08;
  col = mix(col, padC, padA);
  gl_FragColor = vec4(finish(col*1.05, fc), 1.0);
}
`;

// Ink in Water, drawn without the simulation (thumbnails, no-GPU stills, GPUs without float
// render targets): ink clouds curling through clear water.
const INK = PRE + `
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - 0.5*uRes)/uRes.y;
  float t = uTime*0.03;
  vec2 q = p*1.5 + uMouse*0.04 + vec2(0.0, t);
  vec2 w1 = vec2(F(q), F(q + vec2(5.2, 1.3)));
  vec2 w2 = vec2(F(q + 3.0*w1 + vec2(1.7, 9.2) + t*0.5), F(q + 3.0*w1 + vec2(8.3, 2.8)));
  float f = F(q + 2.4*w2);
  float amt = smoothstep(0.3, 0.75, f)*(0.6 + 0.6*smoothstep(-0.5, 0.5, p.y + 0.3*w1.x));
  vec3 ink = mix(mix(uA, uB, smoothstep(0.3, 0.7, w2.x)), uC, smoothstep(0.5, 0.8, w1.y));
  vec3 bg = mix(vec3(0.86, 0.88, 0.9), vec3(0.97, 0.97, 0.96), smoothstep(-0.6, 0.6, p.y));
  vec3 day = bg*exp(-(1.0 - ink)*amt*2.6);
  vec3 night = vec3(0.006, 0.007, 0.012) + (1.0 - exp(-ink*amt*1.8));
  vec3 col = mix(day, night, uNight);
  vec2 v = fc/uRes;
  col *= 0.88 + 0.12*pow(16.0*v.x*v.y*(1.0 - v.x)*(1.0 - v.y), 0.2);
  col += (hash(fc + fract(uTime*7.13)*91.0) - 0.5)*0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SCENES = { blobs: BLOBS, bubble: BUBBLE, koi: KOI, ink: INK };

// fps cap and share of device pixels rendered (the engine adapts it to the GPU)
export const META = {
  blobs: { fps: 30, res: 0.6, floor: 0.6 },
  bubble: { fps: 30, res: 0.8, floor: 0.7 },
  koi: { fps: 30, res: 0.8, floor: 0.7 },
  ink: { fps: 30, res: 0.6 },
};

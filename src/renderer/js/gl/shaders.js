// GLSL for the live 3D wallpapers. Every scene reads three palette colors (uA, uB, uC) and
// uNight (0 = day, 1 = night, eased by the engine), so one shader serves a whole pack.

export const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

export const COMMON = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uNight;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
#define PI 3.14159265
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for(int i = 0; i < 5; i++){ v += a*noise(p); p = m*p; a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for(int i = 0; i < 3; i++){ v += a*noise(p); p = m*p; a *= 0.5; } return v; }
mat2 rot(float a){ float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0 - h); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
vec3 finish(vec3 col, vec2 fc){
  col = aces(max(col, 0.0));
  col = pow(col, vec3(0.4545));
  vec2 q = fc/uRes;
  col *= 0.7 + 0.3*pow(16.0*q.x*q.y*(1.0 - q.x)*(1.0 - q.y), 0.2);
  col += (hash(fc + fract(uTime*7.13)*91.0) - 0.5)*0.014;
  return col;
}
`;

const SILK = `
float H(vec2 p, float t){
  vec2 q = p;
  q += 0.45*vec2(sin(q.y*1.1 + t*0.21), cos(q.x*0.9 - t*0.17));
  q += 0.25*vec2(sin(q.y*2.3 - t*0.13 + 1.7), cos(q.x*2.1 + t*0.19 + 0.4));
  float h = 0.60*sin(q.x*1.4 + q.y*0.8 + t*0.23);
  h += 0.28*sin(-q.x*2.5 + q.y*1.9 - t*0.18 + 1.3);
  h += 0.12*sin(q.x*4.1 - q.y*3.3 + t*0.31);
  return h;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  float t = uTime;
  vec2 p = rot(0.6)*(uv*3.1) + uMouse*0.25;
  float e = 0.003;
  float h = H(p, t);
  float hx = H(p + vec2(e, 0.0), t);
  float hy = H(p + vec2(0.0, e), t);
  float amp = 0.42;
  vec3 n = normalize(vec3(-(hx - h)/e*amp, -(hy - h)/e*amp, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L1 = normalize(vec3(-0.55, 0.65, 0.55));
  vec3 L2 = normalize(vec3(0.7, -0.4, 0.45));
  float d1 = max(dot(n, L1), 0.0);
  float d2 = max(dot(n, L2), 0.0);
  float s1 = pow(max(dot(n, normalize(L1 + V)), 0.0), 160.0);
  float s1b = pow(max(dot(n, normalize(L1 + V)), 0.0), 18.0);
  float s2 = pow(max(dot(n, normalize(L2 + V)), 0.0), 60.0);
  float fold = smoothstep(-1.0, 1.0, h);
  float g = clamp(uv.x*0.55 + uv.y*0.35 + 0.5, 0.0, 1.0);
  vec3 base = mix(mix(uA, uB, smoothstep(0.0, 0.55, g)), uC, smoothstep(0.45, 1.0, g));
  vec3 col = base*(0.03 + 1.05*pow(d1, 1.6)*(0.3 + 0.7*fold));
  col += base*vec3(0.4, 0.6, 1.0)*d2*0.18;
  col += vec3(1.0, 0.88, 0.78)*(s1*1.4 + s1b*0.18) + vec3(0.6, 0.7, 1.0)*s2*0.3;
  col += mix(uB, uC, 0.5)*pow(1.0 - n.z, 2.0)*0.7;
  col *= 0.45 + 0.55*fold;
  col *= mix(1.25, 0.45, uNight);
  gl_FragColor = vec4(finish(col*1.45, fc), 1.0);
}
`;

const GLASS = `
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float map(vec3 p){
  float t = uTime*0.3;
  vec3 q = p; q.yz *= rot(1.1 + 0.3*sin(t)); q.xz *= rot(t*0.6);
  float d = sdTorus(q, vec2(0.9, 0.30));
  vec3 a = vec3(sin(t*1.1)*0.85, cos(t*0.9)*0.45, sin(t*0.7)*0.35);
  d = smin(d, length(p - a) - 0.52, 0.5);
  vec3 b = vec3(cos(t*0.8)*-0.75, sin(t*1.3)*0.55, cos(t*0.5)*0.3);
  d = smin(d, length(p - b) - 0.40, 0.5);
  return d;
}
vec3 nrm(vec3 p){ vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy*map(p + e.xyy) + e.yyx*map(p + e.yyx) + e.yxy*map(p + e.yxy) + e.xxx*map(p + e.xxx)); }
vec3 env(vec3 rd){
  float y = rd.y*0.5 + 0.5;
  vec3 dark = mix(vec3(0.006, 0.006, 0.016), vec3(0.03, 0.025, 0.07), y);
  vec3 lite = mix(vec3(0.17, 0.17, 0.21), vec3(0.38, 0.39, 0.46), y);
  vec3 c = mix(lite, dark, uNight);
  float k = mix(1.6, 0.65, uNight);
  c += uA*pow(max(dot(rd, normalize(vec3(-0.8, 0.3, -1.0))), 0.0), 14.0)*1.3*k;
  c += uB*pow(max(dot(rd, normalize(vec3(0.8, -0.3, -1.0))), 0.0), 12.0)*1.2*k;
  c += uC*pow(max(dot(rd, normalize(vec3(0.1, 0.85, -0.8))), 0.0), 16.0)*0.9*k;
  c += vec3(1.0)*smoothstep(0.88, 0.97, dot(rd, normalize(vec3(0.6, 0.7, 1.0))))*3.0;
  c += vec3(1.0)*smoothstep(0.93, 0.985, dot(rd, normalize(vec3(-0.8, 0.2, 0.9))))*1.6;
  return c;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  vec3 ro = vec3(uMouse.x*0.8, uMouse.y*0.5, 6.4);
  vec3 ww = normalize(vec3(0.0, 0.45, 0.0) - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.8*ww);
  float t = 0.0; bool hit = false;
  for(int i = 0; i < 90; i++){ float d = map(ro + rd*t); if(d < 0.001){ hit = true; break; } t += d; if(t > 12.0) break; }
  vec3 col = env(rd)*0.9;
  if(hit){
    vec3 p = ro + rd*t; vec3 n = nrm(p);
    float ior = 1.47;
    vec3 rr = refract(rd, n, 1.0/ior);
    vec3 q = p - n*0.01; float tt = 0.0;
    for(int i = 0; i < 40; i++){ float di = -map(q + rr*tt); if(di < 0.001) break; tt += max(di, 0.012); if(tt > 4.0) break; }
    vec3 pe = q + rr*tt; vec3 ne = -nrm(pe);
    vec3 er = refract(rr, ne, ior - 0.03); if(dot(er, er) < 0.01) er = reflect(rr, ne);
    vec3 eg = refract(rr, ne, ior);        if(dot(eg, eg) < 0.01) eg = reflect(rr, ne);
    vec3 eb = refract(rr, ne, ior + 0.04); if(dot(eb, eb) < 0.01) eb = reflect(rr, ne);
    vec3 refrCol = vec3(env(er).r, env(eg).g, env(eb).b);
    vec3 absorb = exp(-tt*vec3(0.18, 0.10, 0.05));
    vec3 refl = env(reflect(rd, n));
    float f = 0.04 + 0.96*pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    col = mix(refrCol*absorb, refl, f);
    col += vec3(1.0)*pow(max(dot(reflect(rd, n), normalize(vec3(0.6, 0.7, 1.0))), 0.0), 120.0)*2.0;
  }
  gl_FragColor = vec4(finish(col, fc), 1.0);
}
`;

const CHROME = `
float blob(vec3 p){
  float t = uTime*0.5;
  vec3 q = p; q.xz *= rot(t*0.3);
  float d = length(q) - 1.05;
  d += 0.09*sin(q.x*3.1 + t)*sin(q.y*2.7 - t*1.2)*sin(q.z*3.3 + t*0.8);
  vec3 a = vec3(sin(t*0.9)*1.25, 0.25 + cos(t*0.7)*0.5, cos(t*0.9)*1.25);
  d = smin(d, length(p - a) - 0.32, 0.55);
  vec3 b = vec3(cos(t*0.6 + 2.0)*1.3, -0.3 + sin(t*0.8)*0.4, sin(t*0.6 + 2.0)*1.3);
  d = smin(d, length(p - b) - 0.25, 0.5);
  return d;
}
vec3 nrm(vec3 p){ vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy*blob(p + e.xyy) + e.yyx*blob(p + e.yyx) + e.yxy*blob(p + e.yxy) + e.xxx*blob(p + e.xxx)); }
float trace(vec3 ro, vec3 rd){
  float t = 0.0;
  for(int i = 0; i < 80; i++){ float d = blob(ro + rd*t); if(d < 0.001) return t; t += d*0.8; if(t > 14.0) break; }
  return -1.0;
}
vec3 env(vec3 rd){
  vec3 dark = mix(vec3(0.02, 0.01, 0.04), vec3(0.10, 0.05, 0.16), smoothstep(-0.3, 0.8, rd.y));
  vec3 lite = mix(vec3(0.30, 0.29, 0.33), vec3(0.72, 0.71, 0.78), smoothstep(-0.3, 0.8, rd.y));
  vec3 c = mix(lite, dark, uNight);
  c += uA*smoothstep(0.55, 0.9, dot(rd, normalize(vec3(-1.0, 0.3, 0.2))))*2.2;
  c += uB*smoothstep(0.6, 0.92, dot(rd, normalize(vec3(1.0, 0.2, 0.3))))*2.0;
  c += vec3(1.0)*smoothstep(0.92, 0.98, dot(rd, normalize(vec3(0.1, 1.0, 0.4))))*3.5;
  c += vec3(1.0, 0.85, 0.7)*smoothstep(0.96, 0.99, dot(rd, normalize(vec3(0.3, 0.4, 1.0))))*2.0;
  return c;
}
vec3 chrome(vec3 p, vec3 rd){
  vec3 n = nrm(p);
  vec3 r = reflect(rd, n);
  float fr = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
  vec3 ir = 0.5 + 0.5*cos(6.2831*(vec3(0.0, 0.33, 0.67) + dot(n, -rd)*1.2 + uTime*0.04));
  vec3 c = env(r)*mix(uC, ir, 0.4);
  return mix(c, env(r)*1.2, fr*0.5);
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  vec3 ro = vec3(uMouse.x*0.7, 0.6 + uMouse.y*0.3, 7.4);
  vec3 ww = normalize(vec3(0.0, 0.55, 0.0) - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.8*ww);
  float bgk = mix(0.75, 0.35, uNight);
  float t = trace(ro, rd);
  float tp = (-1.45 - ro.y)/rd.y;
  vec3 col = env(rd)*bgk;
  if(t > 0.0 && (tp < 0.0 || t < tp)){
    col = chrome(ro + rd*t, rd);
  } else if(tp > 0.0){
    vec3 p = ro + rd*tp;
    vec3 r = reflect(rd, vec3(0.0, 1.0, 0.0));
    float t2 = trace(p + r*0.02, r);
    vec3 rc = t2 > 0.0 ? chrome(p + r*(t2 + 0.02), r) : env(r)*bgk;
    float fade = exp(-length(p.xz)*0.18);
    float fres = 0.08 + 0.6*pow(1.0 - max(-rd.y, 0.0), 5.0);
    float ao = smoothstep(0.0, 1.8, length(p.xz));
    col = mix(vec3(0.22, 0.21, 0.25), vec3(0.012, 0.008, 0.02), uNight)*ao + rc*fres*fade;
    col = mix(col, env(rd)*bgk, smoothstep(6.0, 16.0, tp));
  }
  gl_FragColor = vec4(finish(col, fc), 1.0);
}
`;

const DUNES = `
vec3 gSun; vec3 gZen; vec3 gSd;
float dprof(float s){ s = fract(s); return smoothstep(0.0, 0.82, s)*(1.0 - smoothstep(0.82, 1.0, s)); }
float terr(vec2 p){
  vec2 q = p*0.11;
  float w = fbm3(q*0.7)*2.2;
  float h = dprof(q.x*0.9 + q.y*0.45 + w)*1.3;
  h += dprof(q.x*0.5 - q.y*0.8 + w*0.6 + 0.3)*0.6;
  h += fbm3(q*0.5 + 3.0)*1.4;
  return h;
}
float terrD(vec2 p){ return terr(p) + 0.012*sin(p.x*6.0 + p.y*2.0 + fbm3(p*0.8)*6.0); }
vec3 sky(vec3 rd){
  float y = max(rd.y, 0.0);
  vec3 c = mix(gSun*1.1 + 0.06*(1.0 - uNight*0.7), gZen, pow(y, 0.45));
  float s = max(dot(rd, gSd), 0.0);
  c += gSun*pow(s, 8.0)*0.6 + gSun*pow(s, 64.0)*0.8;
  c += vec3(1.0, 0.95, 0.85)*smoothstep(0.9993, 0.9997, s)*6.0;
  vec2 sg = floor(vec2(rd.x/rd.z, rd.y/rd.z)*300.0);
  c += vec3(0.9, 0.95, 1.0)*step(0.996, hash(sg))*smoothstep(0.04, 0.3, rd.y)*uNight*1.4;
  return c;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  gSun = mix(uC, vec3(0.15, 0.21, 0.36), uNight);
  gZen = mix(uB, vec3(0.008, 0.012, 0.035), uNight);
  gSd = normalize(mix(vec3(-0.25, 0.12, 1.0), vec3(0.3, 0.14, 1.0), uNight));
  vec3 sand = mix(uA, vec3(0.5, 0.55, 0.72), uNight);
  float T = uTime*0.25;
  vec3 ro = vec3(T, 0.0, T*0.4);
  ro.y = max(terr(ro.xz), terr(ro.xz + vec2(1.0, 2.0))) + 1.3;
  vec3 fw = normalize(vec3(0.15 + uMouse.x*0.15, -0.13 + uMouse.y*0.06, 1.0));
  vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 vv = cross(fw, uu);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.5*fw);
  float t = 0.1; bool hit = false;
  float tp = t;
  for(int i = 0; i < 96; i++){ vec3 p = ro + rd*t; float h = p.y - terr(p.xz); if(h < 0.002*t){ hit = true; break; } tp = t; t += h*0.6; if(t > 130.0) break; }
  // the big steps can overshoot a crest; bisect back to the surface so ridges stay clean
  if(hit){ for(int i = 0; i < 5; i++){ float tm = 0.5*(tp + t); vec3 pm = ro + rd*tm; if(pm.y - terr(pm.xz) < 0.0) t = tm; else tp = tm; } }
  vec3 col = sky(rd);
  if(hit){
    vec3 p = ro + rd*t;
    vec2 e = vec2(0.02, 0.0);
    vec3 n = normalize(vec3(terrD(p.xz - e.xy) - terrD(p.xz + e.xy), 2.0*e.x, terrD(p.xz - e.yx) - terrD(p.xz + e.yx)));
    float sh = 1.0; float st = 0.2;
    for(int i = 0; i < 16; i++){ vec3 sp = p + gSd*st; float hh = sp.y - terr(sp.xz); sh = min(sh, 8.0*hh/st); st += clamp(hh, 0.25, 2.0); if(sh < 0.0 || st > 30.0) break; }
    sh = clamp(sh, 0.0, 1.0);
    float dif = max(dot(n, gSd), 0.0);
    float back = max(dot(n, normalize(vec3(-gSd.x, 0.0, -gSd.z))), 0.0);
    col = sand*(dif*sh*gSun*2.4 + (0.5 + 0.5*n.y)*gZen*0.55 + back*sand*0.12);
    col = mix(col, sky(normalize(vec3(rd.x, 0.03, rd.z)))*0.95, 1.0 - exp(-t*0.018));
  }
  gl_FragColor = vec4(finish(col, fc), 1.0);
}
`;

const AURORA = `
float curtain(vec2 p){
  float a = p.x*0.6 + 2.2*fbm3(vec2(p.y*0.18, uTime*0.015)) + 0.4*sin(p.y*0.3 + uTime*0.1);
  float band = pow(0.5 + 0.5*sin(a*1.6), 10.0);
  band *= 0.35 + 0.65*fbm3(vec2(p.x*2.5 + p.y*0.4, p.y*0.7 - uTime*0.08));
  return band;
}
vec3 aurora(vec3 rd){
  vec3 acc = vec3(0.0);
  for(int i = 0; i < 30; i++){
    float fi = float(i);
    float tt = (0.9 + fi*0.035)/(rd.y + 0.04);
    float c = curtain(rd.xz*tt);
    acc += mix(uA, uB, smoothstep(8.0, 26.0, fi))*c*exp(-fi*0.09)*0.11;
  }
  return acc*smoothstep(0.0, 0.25, rd.y)*mix(0.45, 1.0, uNight);
}
float stars(vec3 rd){
  vec2 s = vec2(atan(rd.x, rd.z), rd.y)*220.0;
  vec2 c = floor(s); vec2 f = fract(s) - 0.5;
  float h = hash(c);
  float st = step(0.975, h)*smoothstep(0.25, 0.0, length(f - (vec2(hash(c + 1.3), hash(c + 7.1)) - 0.5)*0.5));
  return st*(0.6 + 0.4*sin(uTime*2.0 + h*50.0))*(0.4 + 0.6*hash(c + 3.3));
}
float mtn(float az){ return 0.015 + 0.14*smoothstep(0.3, 0.8, fbm(vec2(az*1.6, 2.0))) + 0.02*fbm(vec2(az*12.0, 5.0)); }
vec3 skyc(vec3 rd){
  float y = pow(max(rd.y, 0.0), 0.5);
  vec3 c = mix(mix(vec3(0.10, 0.22, 0.34), vec3(0.03, 0.08, 0.18), y), mix(vec3(0.02, 0.05, 0.09), vec3(0.003, 0.006, 0.02), y), uNight);
  c += stars(rd)*vec3(0.9, 0.95, 1.0)*smoothstep(0.02, 0.2, rd.y)*mix(0.25, 1.0, uNight);
  c += aurora(rd);
  return c;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  vec3 rd = normalize(vec3(uv.x, uv.y + 0.18, 1.3));
  rd.xz *= rot(uMouse.x*0.15 + 0.2);
  float m = mtn(atan(rd.x, rd.z));
  vec3 rock = mix(vec3(0.02, 0.035, 0.05), vec3(0.006, 0.01, 0.016), uNight);
  vec3 col;
  if(rd.y >= 0.0){
    if(rd.y < m) col = rock + aurora(normalize(vec3(rd.x, 0.3, rd.z)))*0.05*(1.0 - rd.y/m);
    else col = skyc(rd);
    col += vec3(0.05, 0.14, 0.12)*exp(-rd.y*30.0)*0.35;
  } else {
    vec3 rr = vec3(rd.x, -rd.y, rd.z);
    vec2 wp = rd.xz*(0.5/(-rd.y + 0.001));
    rr.xz += (vec2(noise(wp*2.0 + uTime*0.3), noise(wp*2.0 - uTime*0.25)) - 0.5)*0.015;
    rr = normalize(rr);
    float m2 = mtn(atan(rr.x, rr.z));
    vec3 rc = rr.y < m2 ? rock*0.7 : skyc(rr);
    float fres = 0.25 + 0.75*pow(1.0 + rd.y, 4.0);
    col = rc*fres*0.85 + vec3(0.002, 0.004, 0.006);
  }
  gl_FragColor = vec4(finish(col*1.2, fc), 1.0);
}
`;

const CLAY = `
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdRBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a; vec3 ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*h) - r; }
vec2 map(vec3 p){
  float t = uTime*0.4;
  vec2 res = vec2(p.y, 0.0);
  vec3 q = p - vec3(-1.55, 0.86 + 0.1*sin(t*1.1), 0.4);
  float d = length(q) - 0.75; if(d < res.x) res = vec2(d, 1.0);
  q = p - vec3(0.35, 1.05 + 0.1*sin(t*0.9 + 1.0), -0.3); q.xy *= rot(0.35); q.yz *= rot(1.25 + 0.15*sin(t*0.5));
  d = sdTorus(q, vec2(0.62, 0.24)); if(d < res.x) res = vec2(d, 2.0);
  q = p - vec3(2.0, 0.66 + 0.08*sin(t*1.3 + 2.0), 0.9); q.xz *= rot(0.6 + t*0.15); q.xy *= rot(0.25);
  d = sdRBox(q, vec3(0.38), 0.16); if(d < res.x) res = vec2(d, 3.0);
  q = p - vec3(-0.35, 0.26, 1.5);
  d = sdCapsule(q, vec3(-0.5, 0.0, 0.0), vec3(0.5, 0.0, 0.2), 0.25); if(d < res.x) res = vec2(d, 4.0);
  return res;
}
vec3 nrm(vec3 p){ vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy*map(p + e.xyy).x + e.yyx*map(p + e.yyx).x + e.yxy*map(p + e.yxy).x + e.xxx*map(p + e.xxx).x); }
float softsh(vec3 ro, vec3 rd){ float r = 1.0; float t = 0.02; for(int i = 0; i < 40; i++){ float h = map(ro + rd*t).x; r = min(r, 10.0*h/t); t += clamp(h, 0.02, 0.25); if(r < 0.001 || t > 8.0) break; } return clamp(r, 0.0, 1.0); }
float occ(vec3 p, vec3 n){ float o = 0.0; float s = 1.0; for(int i = 0; i < 5; i++){ float h = 0.02 + 0.12*float(i); o += (h - map(p + n*h).x)*s; s *= 0.75; } return clamp(1.0 - 2.0*o, 0.0, 1.0); }
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  vec3 ro = vec3(0.2 + uMouse.x*0.5, 3.0 + uMouse.y*0.3, 6.8);
  vec3 ww = normalize(vec3(0.2, 0.6, 0.3) - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.9*ww);
  vec3 bgc = pow(uA, vec3(2.2));
  vec3 col = bgc*(1.05 + 0.1*uv.y);
  float t = 0.0; vec2 h = vec2(0.0); bool hit = false;
  for(int i = 0; i < 110; i++){ h = map(ro + rd*t); if(h.x < 0.001){ hit = true; break; } t += h.x; if(t > 30.0) break; }
  if(hit){
    vec3 p = ro + rd*t; vec3 n = nrm(p);
    vec3 alb = bgc;
    if(h.y > 0.5 && h.y < 1.5) alb = pow(uB, vec3(2.2));
    else if(h.y > 1.5 && h.y < 2.5) alb = pow(uC, vec3(2.2));
    else if(h.y > 2.5 && h.y < 3.5) alb = pow(uB*0.55 + 0.45, vec3(2.2));
    else if(h.y > 3.5) alb = pow(uC*0.7 + vec3(0.3, 0.28, 0.22), vec3(2.2));
    vec3 sun = normalize(vec3(-0.6, 0.9, 0.45));
    float sh = softsh(p + n*0.002, sun);
    float dif = clamp(dot(n, sun), 0.0, 1.0)*sh;
    float wrap = clamp(dot(n, sun)*0.5 + 0.5, 0.0, 1.0);
    float o = occ(p, n);
    float skyl = 0.5 + 0.5*n.y;
    col = alb*(vec3(1.0, 0.95, 0.88)*dif*1.55 + vec3(0.78, 0.84, 1.0)*skyl*0.5*o + alb*0.35*wrap*o);
    col += vec3(1.0)*pow(clamp(dot(reflect(rd, n), sun), 0.0, 1.0), 24.0)*0.18*dif;
    col += bgc*pow(clamp(1.0 + dot(rd, n), 0.0, 1.0), 3.0)*0.25*o;
    col = mix(col, bgc*1.05, smoothstep(9.0, 22.0, t));
  }
  // night: the room light is off, only a cool glow from the window
  col *= mix(1.0, 0.15, uNight);
  col = mix(col, col*vec3(0.65, 0.78, 1.35), uNight);
  gl_FragColor = vec4(finish(col*1.08, fc), 1.0);
}
`;

const DOTS = `
float wave(vec2 p){
  float t = uTime*0.6;
  float h = 0.45*sin(p.x*0.55 + t)*cos(p.y*0.45 - t*0.7);
  h += 0.30*sin(length(p - vec2(1.5, 6.0))*0.9 - t*1.4);
  h += 0.15*sin(p.x*1.3 - p.y*0.9 + t*1.1);
  return h;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  vec3 ro = vec3(uMouse.x*0.8, 2.3 + uMouse.y*0.3, -4.0);
  vec3 fw = normalize(vec3(0.0, 0.0, 4.0) - ro);
  vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 vv = cross(fw, uu);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.7*fw);
  vec3 bg = mix(vec3(0.86, 0.86, 0.85), vec3(0.0), uNight);
  vec3 ink = mix(vec3(0.03), uA, uNight);
  float t = 0.0; bool hit = false;
  for(int i = 0; i < 120; i++){ vec3 p = ro + rd*t; float h = p.y - wave(p.xz); if(h < 0.002*t){ hit = true; break; } t += h*0.6; if(t > 40.0) break; }
  vec3 col = bg;
  if(hit){
    vec3 p = ro + rd*t;
    vec2 e = vec2(0.01, 0.0);
    vec3 n = normalize(vec3(wave(p.xz - e.xy) - wave(p.xz + e.xy), 2.0*e.x, wave(p.xz - e.yx) - wave(p.xz + e.yx)));
    float s = 0.17;
    vec2 g = p.xz/s; vec2 c = floor(g); vec2 f = fract(g) - 0.5;
    float r = 0.17;
    float pix = t/(uRes.y*1.7*s)*2.2;
    float dotm = smoothstep(r + pix, r - pix, length(f));
    dotm = mix(dotm, PI*r*r, smoothstep(0.3, 0.9, pix));
    float lum = 0.22 + 0.78*clamp(dot(n, normalize(vec3(-0.4, 0.8, -0.5))), 0.0, 1.0);
    float fog = exp(-t*0.075);
    float cyc = mod(uTime*1.2, 9.0);
    float ring = abs(length(c*s - vec2(sin(uTime*0.2)*1.5, 5.0)) - cyc);
    float red = smoothstep(0.5, 0.0, ring)*(1.0 - smoothstep(5.0, 9.0, cyc));
    vec3 dc = mix(ink, uB*1.6, step(0.5, red));
    col = mix(bg, dc*mix(1.0, lum*1.15, uNight), dotm*fog*mix(0.4 + 0.6*lum, 1.0, uNight));
  }
  gl_FragColor = vec4(finish(col, fc), 1.0);
}
`;

const NEON = `
float terr(vec2 p){ float v = smoothstep(1.2, 7.0, abs(p.x)); return v*(0.6 + 3.2*fbm3(p*0.22)); }
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  float z = uTime*2.2;
  vec3 ro = vec3(uMouse.x*0.6, 0.9 + uMouse.y*0.2, z);
  vec3 fw = normalize(vec3(0.0, 0.02, 1.0));
  vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 vv = cross(fw, uu);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.5*fw);
  vec3 nsky = mix(uC*0.32, vec3(0.05, 0.01, 0.12), smoothstep(0.0, 0.3, rd.y));
  nsky = mix(nsky, vec3(0.008, 0.0, 0.03), smoothstep(0.3, 0.85, rd.y));
  vec3 dsky = mix(vec3(1.0, 0.62, 0.62), vec3(0.45, 0.42, 0.95), smoothstep(0.0, 0.45, rd.y));
  dsky = mix(dsky, vec3(0.2, 0.3, 0.8), smoothstep(0.4, 0.9, rd.y));
  vec3 sc = mix(dsky, nsky, uNight);
  vec2 sp = vec2(rd.x/rd.z, rd.y/rd.z) - vec2(0.0, 0.14);
  float sr = length(sp);
  float sun = smoothstep(0.165, 0.16, sr);
  float gap = smoothstep(0.03, -0.2, sp.y)*0.6;
  sun *= step(gap, fract(sp.y*24.0 - uTime*0.15));
  vec3 sunCol = mix(uC, vec3(1.0, 0.85, 0.3), smoothstep(-0.2, 0.2, sp.y));
  sc += sunCol*sun*mix(1.7, 1.25, uNight) + uC*exp(-sr*5.0)*mix(0.35, 0.18, uNight);
  vec2 sg = floor(vec2(rd.x/rd.z, rd.y/rd.z)*140.0);
  sc += vec3(1.0)*step(0.993, hash(sg))*smoothstep(0.25, 0.5, rd.y)*0.8*uNight;
  vec3 col = sc;
  float t = 0.0; bool hit = false;
  for(int i = 0; i < 130; i++){ vec3 p = ro + rd*t; float h = p.y - terr(p.xz); if(h < 0.002*t){ hit = true; break; } t += h*0.5; if(t > 90.0) break; }
  if(hit){
    vec3 p = ro + rd*t;
    vec2 gd = abs(fract(p.xz) - 0.5);
    float dl = 0.5 - max(gd.x, gd.y);
    float w = 0.015 + t*0.0025;
    float line = smoothstep(w, 0.0, dl) + 0.4*exp(-dl*8.0/(1.0 + t*0.05));
    vec3 lc = mix(uA, uB, smoothstep(0.2, 2.5, p.y));
    col = mix(vec3(0.22, 0.10, 0.32), vec3(0.03, 0.0, 0.06), uNight) + lc*line*1.4;
    col = mix(col, mix(vec3(0.9, 0.5, 0.62), vec3(0.24, 0.04, 0.16), uNight), 1.0 - exp(-t*0.035));
  }
  gl_FragColor = vec4(finish(col, fc), 1.0);
}
`;

// Color: soft mesh, linear or radial gradient from three colors (given in sRGB)
const GRADIENT = `
uniform float uStyle;
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc/uRes;
  vec2 p = (fc - 0.5*uRes)/uRes.y;
  float t = uTime*0.05;
  vec3 col;
  if(uStyle < 0.5){
    vec2 w = p + 0.18*vec2(fbm(p*1.4 + t), fbm(p*1.4 - t + 4.0));
    vec2 c1 = vec2(-0.55 + 0.18*sin(t*1.7), 0.25 + 0.12*cos(t*1.3));
    vec2 c2 = vec2(0.55 + 0.15*cos(t*1.1), 0.2 + 0.15*sin(t*1.9));
    vec2 c3 = vec2(0.05 + 0.2*sin(t*1.3 + 2.0), -0.35 + 0.1*cos(t));
    float w1 = exp(-dot(w - c1, w - c1)*3.0);
    float w2 = exp(-dot(w - c2, w - c2)*3.0);
    float w3 = exp(-dot(w - c3, w - c3)*3.0);
    col = (uA*w1 + uB*w2 + uC*w3 + mix(uA, uC, 0.5)*0.05)/(w1 + w2 + w3 + 0.05);
  } else if(uStyle < 1.5){
    float g = clamp(dot(p, normalize(vec2(0.35 + 0.1*sin(t), 1.0))) + 0.5 + 0.05*fbm(p*2.0 + t), 0.0, 1.0);
    col = g < 0.5 ? mix(uC, uB, g*2.0) : mix(uB, uA, g*2.0 - 1.0);
  } else {
    float d = length(p - vec2(0.15*sin(t), -0.1 + 0.05*cos(t)));
    col = mix(uC, uB, smoothstep(0.0, 0.55, d));
    col = mix(col, uA, smoothstep(0.45, 1.1, d));
  }
  col = mix(col, col*col*0.6 + col*0.12, uNight*0.85);
  vec2 q = uv;
  col *= 0.88 + 0.12*pow(16.0*q.x*q.y*(1.0 - q.x)*(1.0 - q.y), 0.25);
  col += (hash(fc + fract(uTime*7.13)*91.0) - 0.5)*0.02;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Astronomy: Earth (land from Natural Earth in uTex, lit by the real Sun), the Moon (real
// phase) and Mars. Positions are "earth-fixed": (cos lat sin lon, sin lat, cos lat cos lon).
const PLANET = `
uniform sampler2D uTex; uniform mat3 uRot; uniform vec3 uSun; uniform vec4 uFrame; uniform vec3 uLoc; uniform vec3 uLight; uniform float uMark;
float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float noise3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
float fbm3d(vec3 p){ float v = 0.0; float a = 0.5; for(int i = 0; i < 5; i++){ v += a*noise3(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
float craters(vec3 p, float n){
  float h = 0.0;
  for(int o = 0; o < 3; o++){
    float s = n*pow(2.3, float(o));
    vec3 q = p*s; vec3 b = floor(q - 0.5);
    for(int k = 0; k < 8; k++){
      vec3 g = vec3(mod(float(k), 2.0), mod(floor(float(k)/2.0), 2.0), floor(float(k)/4.0));
      vec3 c = b + g;
      // few big craters, rarer small ones: a cratered surface, not foam
      float r0 = hash3(c + 17.0);
      if(r0 < 0.62 + 0.13*float(o)) continue;
      vec3 ctr = c + 0.5 + (vec3(hash3(c), hash3(c + 5.3), hash3(c + 9.1)) - 0.5)*0.6;
      float rad = 0.12 + 0.32*pow(hash3(c + 2.7), 2.0);
      float d = length(q - ctr)/rad;
      if(d < 1.4) h += ((d < 1.0 ? (d*d - 1.0)*0.45 : 0.0) + exp(-pow((d - 1.0)*6.0, 2.0))*0.12)*rad/s;
    }
  }
  return h;
}
vec3 starfield(vec2 uv){
  vec2 s = uv*180.0; vec2 c = floor(s); float h = hash(c);
  vec2 f = fract(s) - 0.5 - (vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5)*0.6;
  float st = step(0.986, h)*smoothstep(0.14, 0.0, length(f))*(0.35 + 0.65*hash(c + 1.9));
  float band = exp(-pow(uv.y*1.4 - uv.x*0.5 - 0.1, 2.0)*6.0)*fbm(uv*3.0)*0.05;
  return vec3(st) + vec3(0.6, 0.65, 0.9)*band;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - 0.5*uRes)/uRes.y + uMouse*0.008;
  float body = uFrame.w;
  vec2 q = (uv - uFrame.xy)/uFrame.z;
  float r2 = dot(q, q); float r = sqrt(r2);
  vec3 col = starfield(uv + uMouse*0.004)*0.9;
  vec3 Lv = body < 0.5 ? uSun*uRot : uLight;
  if(body < 0.5 && r > 1.0){
    float day = clamp(dot(normalize(vec3(q, 0.0)), Lv)*0.8 + 0.35, 0.0, 1.0);
    col += vec3(0.25, 0.55, 1.0)*exp(-(r - 1.0)*uFrame.z*60.0)*0.7*day;
  }
  if(r2 < 1.0){
    vec3 n = vec3(q, sqrt(1.0 - r2));
    vec3 e = uRot*n;
    if(body < 0.5){
      float lat = asin(clamp(e.y, -1.0, 1.0)); float lon = atan(e.x, e.z);
      vec4 tx = texture2D(uTex, vec2(lon/(2.0*PI) + 0.5, 0.5 - lat/PI));
      float land = tx.r; float lights = tx.g; float shelf = tx.b;
      float alat = abs(lat)*57.2958;
      float nz = fbm3d(e*7.0); float nz2 = noise3(e*40.0);
      vec3 green = mix(vec3(0.05, 0.10, 0.035), vec3(0.15, 0.19, 0.07), nz);
      vec3 dry = mix(vec3(0.40, 0.31, 0.17), vec3(0.62, 0.50, 0.32), nz2);
      float desert = smoothstep(12.0, 20.0, alat)*(1.0 - smoothstep(33.0, 43.0, alat))*smoothstep(0.38, 0.62, nz);
      vec3 landc = mix(green, dry, desert);
      landc = mix(landc, vec3(0.06, 0.09, 0.06), smoothstep(50.0, 62.0, alat));
      float ice = clamp(smoothstep(66.0, 76.0, alat) + step(lat, -1.05), 0.0, 1.0);
      landc = mix(landc, vec3(0.80, 0.84, 0.88), ice);
      vec3 ocean = mix(vec3(0.004, 0.02, 0.065), vec3(0.02, 0.11, 0.2), shelf);
      ocean = mix(ocean, vec3(0.7, 0.78, 0.85), smoothstep(74.0, 82.0, alat));
      vec3 surf = mix(ocean, landc, land);
      // clouds: domain-warped noise, busiest near the equator and the stormy mid-latitudes
      vec3 drift = vec3(uTime*0.004, 0.0, uTime*0.002);
      vec3 cw = e*2.2 + drift + 0.45*vec3(fbm3d(e*2.6 + 1.0), fbm3d(e*2.6 + 7.0), fbm3d(e*2.6 + 3.0));
      float belt = 0.06*cos(lat*4.0) + 0.04*cos(lat*2.0);
      float cl = smoothstep(0.5, 0.66, fbm3d(cw*1.7) + 0.14*(fbm3d(e*16.0 + drift*3.0) - 0.5) + belt)*0.92;
      float sl = dot(e, uSun);
      float dif = max(sl, 0.0);
      float tw = exp(-pow(sl/0.1, 2.0));
      vec3 dayc = mix(surf, vec3(0.92, 0.93, 0.95), cl)*(0.015 + 1.3*dif);
      dayc *= mix(vec3(1.0), vec3(1.25, 0.72, 0.48), tw*0.55);
      float spec = pow(max(reflect(-Lv, n).z, 0.0), 140.0)*(1.0 - land)*(1.0 - cl)*dif;
      dayc += vec3(1.0, 0.9, 0.75)*spec*0.45;
      float night = 1.0 - smoothstep(-0.14, 0.04, sl);
      vec3 city = vec3(1.0, 0.66, 0.32)*pow(lights, 1.3)*night*(1.0 - cl*0.75)*1.7;
      col = dayc + city + surf*0.035*night;
      col += vec3(0.25, 0.5, 1.0)*pow(1.0 - n.z, 2.5)*clamp(dot(n, Lv) + 0.35, 0.0, 1.0)*0.9;
      float d = acos(clamp(dot(e, uLoc), -1.0, 1.0));
      float pulse = 0.5 + 0.5*sin(uTime*2.4);
      float ringR = uMark*(1.0 + pulse*0.8);
      col = mix(col, vec3(1.0), smoothstep(uMark*0.5, uMark*0.25, d));
      col += vec3(1.0)*smoothstep(uMark*0.22, 0.0, abs(d - ringR))*(1.0 - pulse)*0.8;
    } else {
      vec3 p = e;
      float h = craters(p, body < 1.5 ? 5.0 : 3.5);
      vec3 t1 = normalize(cross(p, vec3(0.0, 1.0, 0.0) + 0.001)); vec3 t2 = cross(p, t1);
      float ee = 0.004;
      float hx = craters(normalize(p + t1*ee), body < 1.5 ? 5.0 : 3.5) - h;
      float hy = craters(normalize(p + t2*ee), body < 1.5 ? 5.0 : 3.5) - h;
      vec3 en = normalize(p - (t1*hx + t2*hy)/ee*(body < 1.5 ? 2.2 : 1.2));
      vec3 nn = en*uRot;
      float big = fbm3d(p*1.6); float fine = fbm3d(p*9.0); float mid = fbm3d(p*4.0 + 2.0);
      vec3 alb;
      if(body < 1.5){
        // bright highlands, dark basalt seas (maria), and fine regolith grain
        alb = mix(vec3(0.66, 0.65, 0.62), vec3(0.24, 0.24, 0.26), smoothstep(0.5, 0.4, big + (mid - 0.5)*0.15));
        alb *= 0.82 + 0.28*fine + 0.12*(mid - 0.5);
      } else {
        // rust plains, dark volcanic regions, dusty bright basins and polar ice
        float darkr = smoothstep(0.56, 0.4, big + (mid - 0.5)*0.35);
        alb = mix(vec3(0.76, 0.40, 0.20), vec3(0.30, 0.14, 0.08), darkr*0.85);
        alb = mix(alb, vec3(0.86, 0.58, 0.38), smoothstep(0.6, 0.78, mid)*0.45);
        alb *= 0.9 + 0.2*fine;
        alb = mix(alb, vec3(0.95, 0.93, 0.92), smoothstep(0.86, 0.93, abs(p.y))*(0.7 + 0.3*fine));
      }
      float dif = max(dot(nn, uLight), 0.0);
      col = alb*(dif*1.55 + (body < 1.5 ? 0.012 : 0.0));
      if(body > 1.5) col += vec3(0.9, 0.5, 0.35)*pow(1.0 - n.z, 3.0)*clamp(dot(n, uLight) + 0.3, 0.0, 1.0)*0.35;
    }
  }
  gl_FragColor = vec4(finish(col*1.1, fc), 1.0);
}
`;

export const SHADERS = { silk: SILK, glass: GLASS, chrome: CHROME, dunes: DUNES, aurora: AURORA, clay: CLAY, dots: DOTS, neon: NEON, gradient: GRADIENT, planet: PLANET };

// share of device pixels each scene renders at (the engine adapts it to the GPU)
export const RES = { silk: 0.75, glass: 0.55, chrome: 0.55, dunes: 0.45, aurora: 0.55, clay: 0.65, dots: 0.7, neon: 0.55, gradient: 0.5, planet: 0.75 };

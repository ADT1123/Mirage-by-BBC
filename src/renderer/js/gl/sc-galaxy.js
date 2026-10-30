// A slowly turning spiral galaxy for the Astronomy pack.
// Palette: uA = young blue arms, uB = pink star-forming knots / nebula, uC = warm core.

// COMMON's float hash is chaotic enough that the GPU compiler re-ordering its maths gives two
// neighbouring noise cells different values (visible seams). This scene uses an exact-integer
// permutation hash instead: every intermediate stays a whole number below 2^24, so any re-ordering
// gives the same answer.
const PRE = `
float pm(float x){ return mod((34.0*x + 1.0)*x, 289.0); }
float H(vec2 c){ c = mod(floor(c), 289.0); return pm(pm(c.x) + c.y)/289.0; }
float H(vec2 c, float k){ c = mod(floor(c), 289.0); return pm(pm(pm(c.x) + c.y) + k)/289.0; }
float N(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(H(i), H(i + vec2(1.0, 0.0)), u.x), mix(H(i + vec2(0.0, 1.0)), H(i + vec2(1.0, 1.0)), u.x), u.y); }
float F(vec2 p){ float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for(int i = 0; i < 5; i++){ v += a*N(p); p = m*p + 17.0; a *= 0.5; } return v; }
float F3(vec2 p){ float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for(int i = 0; i < 3; i++){ v += a*N(p); p = m*p + 17.0; a *= 0.5; } return v; }
`;

const GALAXY = PRE + `
// one soft star per jittered cell: scale = cells per unit, dens = share of lit cells, px = radius in pixels
vec3 starField(vec2 p, float scale, float dens, float px){
  vec2 s = p*scale; vec2 c = floor(s); vec2 f = fract(s);
  float h = H(c);
  if(h > dens) return vec3(0.0);
  vec2 o = 0.2 + 0.6*vec2(H(c, 32.0), H(c, 78.0));
  float b = H(c, 20.0);
  float mag = 0.08 + 2.2*b*b*b*b*b;
  float r = px*(0.75 + 0.8*b*b)*scale/uRes.y;
  vec2 d = (f - o)/r;
  float tw = 0.85 + 0.15*sin(uTime*(0.5 + 1.5*H(c, 92.0)) + h*60.0);
  vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.8, 0.6), H(c, 54.0));
  // the brightest few get faint diffraction spikes
  float spike = step(0.96, b)*(exp(-abs(d.x)*0.6 - d.y*d.y*4.0) + exp(-abs(d.y)*0.6 - d.x*d.x*4.0))*0.1;
  return tint*mag*tw*(exp(-dot(d, d)) + spike);
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - 0.5*uRes)/uRes.y;
  float t = uTime;
  bool hi = uQ > 0.5;
  // deep sky with three depths of stars (least parallax far away)
  vec3 col = mix(vec3(0.002, 0.003, 0.007), vec3(0.005, 0.004, 0.011), smoothstep(-0.6, 0.6, p.y));
  vec2 ps = p + uMouse*0.012;
  col += starField(ps, 75.0, 0.10, 0.75)*0.5;
  col += starField(ps + 17.0, 30.0, 0.10, 0.9);
  if(hi) col += starField(ps + 41.0, 150.0, 0.12, 0.6)*0.35;

  // galaxy frame: major axis tilted, disk inclined, whole pattern turning slowly
  vec2 g = p - vec2(0.0, 0.01) + uMouse*0.035;
  g = rot(0.38)*g;
  float near = g.y;                       // < 0: the near half of the disk
  vec2 gd = vec2(g.x, g.y/0.40)/0.6;     // face-on disk coords, visible edge ~ r = 1
  gd = rot(t*0.008)*gd;
  float r = length(gd);
  float ang = atan(gd.y, gd.x);
  // two logarithmic arms, frayed by a low-frequency warp
  float warp = F3(gd*1.6 + 5.0);
  float ph = 2.0*ang + 6.5*log(r + 0.06) + warp*2.2;
  float arm = 0.5 + 0.5*cos(ph);
  float armS = arm*arm*arm*arm;
  float clump = hi ? F(gd*5.5 + 11.0) : F3(gd*5.5 + 11.0);
  float grain = 0.8 + 0.4*N(gd*55.0);
  float disk = exp(-r*3.0)*smoothstep(1.3, 0.45, r);
  float em = disk*(0.1 + 2.8*armS*smoothstep(0.3, 0.75, clump)*grain + 0.35*arm*clump);
  // dust: lanes on the inner edge of each arm plus mottled filaments
  float dl = pow(0.5 + 0.5*cos(ph + 1.1), 6.0);
  float fil = smoothstep(0.5, 0.75, F3(gd*7.0 + 3.0));
  float fil2 = smoothstep(0.55, 0.8, F3(gd*15.0 + 1.0));
  float dust = (dl*(0.5 + 1.4*fil) + 0.7*fil*arm + 0.6*fil2*arm)*smoothstep(0.04, 0.22, r)*smoothstep(1.15, 0.4, r);
  // star-forming knots (pink) and young clusters (blue-white) gathered in patches along the arms
  float patchy = smoothstep(0.4, 0.7, N(gd*4.0 + 2.0));
  float kmask = armS*patchy*smoothstep(0.12, 0.3, r)*smoothstep(1.0, 0.5, r);
  vec2 ks = gd*26.0;
  vec2 kc = floor(ks); vec2 kf = fract(ks) - 0.5 - (vec2(H(kc), H(kc, 18.0)) - 0.5)*0.7;
  float kh = H(kc, 43.0);
  kf = rot(-t*0.008)*kf; kf.y *= 0.4;   // measure in screen space so knots stay round
  float kd = dot(kf, kf)*1.6;
  float knot = step(0.72, kh)*exp(-kd*(35.0 + 60.0*H(kc, 7.0)))*kmask;
  float young = step(0.5, kh)*step(kh, 0.72)*exp(-kd*160.0)*kmask;
  vec3 diskCol = mix(uC, uA*vec3(0.85, 0.95, 1.1), smoothstep(0.05, 0.4, r)*(0.3 + 0.7*arm));
  vec3 gal = diskCol*em*exp(-dust*1.8);
  gal += (uB*knot*4.5 + mix(uA, vec3(1.0), 0.3)*young*2.2)*exp(-dust*0.7)*disk*4.0;
  // bulge: rounder than the disk, with the near-side dust lane crossing in front of it
  vec2 gb = vec2(g.x, g.y/0.7);
  float rb = length(gb);
  float bulge = exp(-rb*20.0)*1.9 + exp(-rb*7.5)*0.4 + exp(-rb*rb*4000.0)*4.0;
  float veil = smoothstep(0.01, -0.03, near)*(dust*1.5 + 0.6*smoothstep(0.04, 0.1, r)*smoothstep(0.3, 0.13, r)*F3(gd*12.0));
  gal += mix(uC, vec3(1.0, 0.95, 0.85), 0.3)*bulge*exp(-veil*2.4);
  // faint outer halo
  gal += mix(uA, uC, 0.5)*0.04*exp(-length(vec2(g.x, g.y/0.55))*3.0);

  // nebula clouds drifting in front with the most parallax, lit from the galaxy core
  vec2 pn = p*1.1 + uMouse*0.07 + vec2(t*0.003, 0.0);
  vec2 w = vec2(F3(pn*1.1 + 1.3), F3(pn*1.1 + 8.7 - t*0.002));
  vec2 nq = pn*1.7 + w*1.8;
  float n = hi ? F(nq) : F3(nq);
  vec2 toCore = normalize(-p + 0.0001);
  float n2 = hi ? F(nq + toCore*0.1) : F3(nq + toCore*0.1);
  float band = smoothstep(0.7, 0.1, abs(p.y + 0.3*p.x + 0.08*sin(p.x*2.3 + 1.0)));
  float sideQuiet = mix(0.5, 1.0, smoothstep(0.95, 0.3, abs(p.x)));
  float dens = smoothstep(0.45, 0.8, n)*band*sideQuiet*0.8;
  float lit = clamp((n - n2)*6.0 + 0.4, 0.0, 1.0);
  vec3 neb = mix(uB*0.5, mix(uA, vec3(0.2, 0.7, 0.75), 0.6)*0.5, smoothstep(0.35, 0.7, w.x));
  col += gal;
  col = col*exp(-dens*1.1*(1.0 - lit)) + neb*dens*(0.03 + 0.2*lit*lit);
  col *= mix(1.1, 1.0, uNight);
  gl_FragColor = vec4(finish(col*1.1, fc), 1.0);
}
`;

export const SCENES = { galaxy: GALAXY };
export const META = { galaxy: { fps: 30, res: 0.7 } };

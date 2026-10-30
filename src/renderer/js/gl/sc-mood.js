// Lava lamp (Clay pack). The string is appended after COMMON (see shaders.js), so it can use
// the shared uniforms and helpers.

// Lava lamp: big soft blobs of wax rise from a pool, merge, split and sink. Matte clay shading
// with light glowing through the thin parts. uA = wax, uB = liquid behind, uC = accent / glow.
const LAVA = `
float gTint;
// smooth metaball field (1 at a blob's heart, 0 far away); the wax surface is where it reaches 0.35
float field(vec2 p, float t, float n){
  float f = pow(1.0 - clamp((p.y + 0.5 - 0.03*sin(p.x*2.6 + t*0.21) - 0.02*sin(p.x*5.1 - t*0.17))/0.26, 0.0, 1.0), 3.0);
  // the pool counts as plain wax, so accent blobs only tint themselves
  float acc = 0.0; float wsum = f;
  for(int i = 0; i < 9; i++){
    if(float(i) >= n) break;
    float fi = float(i);
    float h1 = hash(vec2(fi, 1.7)); float h2 = hash(vec2(fi, 3.1)); float h3 = hash(vec2(fi, 5.9)); float h4 = hash(vec2(fi, 9.4));
    // rise from the pool, drift near the top, sink back
    float ph = fract(t/(50.0 + 40.0*h1) + h2);
    float s = sin(ph*6.2832);
    float y = -0.6 + 0.9*(0.5 - 0.5*cos(ph*6.2832));
    float x = (fract(fi*0.618 + 0.31) - 0.5)*1.6 + (h3 - 0.5)*0.12 + 0.07*sin(t*0.05 + h4*6.3);
    float R = 2.0*(0.075 + 0.075*h4);
    // moving blobs stretch along their path
    float e = 1.0 + 0.35*abs(s);
    vec2 q = (p - vec2(x, y))*vec2(1.0 + 0.12*abs(s), 1.0/e)/R;
    float w = pow(max(1.0 - dot(q, q), 0.0), 3.0);
    f += w;
    acc += w*step(0.72, h1); wsum += w;
  }
  gTint = acc/max(wsum, 1e-4);
  return f;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - 0.5*uRes)/uRes.y;
  float t = uTime + 40.0;
  float n = uQ < 0.5 ? 7.0 : 9.0;
  float px = 1.5/uRes.y;
  vec2 q = p + uMouse*0.02;
  float f = field(q, t, n);
  float tint = gTint;
  vec2 e = vec2(0.003, 0.0);
  vec2 gf = vec2(field(q + e.xy, t, n) - f, field(q + e.yx, t, n) - f)/e.x;
  float fs = field(q + vec2(-0.03, 0.045), t, n);
  vec3 wax = pow(uA, vec3(2.2));
  vec3 acc = pow(uC, vec3(2.2));
  vec3 liq = pow(uB, vec3(2.2));
  const float T = 0.35;
  // back: the liquid, lit warmly from the lamp below, with the wax's soft shadow and glow on it
  vec3 bg = liq*(0.86 + 0.22*smoothstep(0.6, -0.6, p.y)) + acc*0.1*exp(-length(p - vec2(0.0, -0.75))*1.6);
  bg *= 1.0 - 0.25*smoothstep(0.05, T, fs);
  bg += wax*0.1*smoothstep(0.0, T, f);
  // night: the room goes dark; the liquid only catches the lamp's glow from below and the wax
  float lamp = exp(-length((p - vec2(0.0, -0.75))*vec2(0.7, 1.0))*1.8);
  vec3 bgN = liq*0.04 + mix(acc, wax, 0.4)*0.14*lamp + wax*0.08*smoothstep(0.0, T, f);
  bg = mix(bg, bgN, uNight);
  vec3 col = bg;
  // edge from the field, antialiased with its gradient
  float gl = length(gf) + 1e-4;
  float inside = clamp((f - T)/(gl*px*1.5) + 0.5, 0.0, 1.0);
  if(inside > 0.0){
    // a soft pillow profile: steep round edges, flat-ish tops, thin necks stay thin
    float x = max(f - T, 0.0)/0.5;
    float dz = min(0.5/sqrt(x + 1e-4), 30.0)*exp(-x*1.6)/0.5;
    vec3 nn = normalize(vec3(-gf*dz*0.12, 1.0));
    vec3 L = normalize(vec3(-0.45, 0.65, 0.6));
    vec3 alb = mix(wax, acc, tint*0.75);
    float dif = pow(clamp(dot(nn, L)*0.5 + 0.5, 0.0, 1.0), 1.7);
    float up = 0.5 + 0.5*nn.y;
    float thin = exp(-x*5.0);
    vec3 c = alb*(dif*1.05 + 0.16*up) + alb*alb*0.35*(1.0 - up)*vec3(1.0, 0.85, 0.75);
    // light scattering through the thin rims (subsurface-ish)
    c += mix(alb, acc, 0.35)*thin*0.3*(0.5 + 0.5*dif);
    c += vec3(1.0, 0.95, 0.9)*pow(max(dot(nn, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 10.0)*0.05;
    c = mix(c, bg, pow(1.0 - nn.z, 4.0)*0.2);
    // at night the wax glows: lit from the lamp below, brightest where it is thin
    vec3 cn = alb*(0.22 + 0.5*lamp + 0.35*(1.0 - up)*(0.4 + 0.6*lamp)) + mix(alb, acc, 0.3)*thin*0.5;
    cn *= 0.6 + 0.45*dif;
    col = mix(col, mix(c, cn, uNight), inside);
  }
  gl_FragColor = vec4(finish(col*1.1, fc), 1.0);
}
`;

export const SCENES = { lava: LAVA };

// fps cap and share of device pixels rendered (the engine adapts it to the GPU)
export const META = { lava: { fps: 24, res: 0.6 } };

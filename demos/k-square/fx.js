// Square animation: one small fragment shader with three looks.
//   smear — long-exposure pan; every ~13s focus catches the form for a moment
//   halo  — dark silhouette with light bleeding round its edges (photogram)
//   grain — the form built from living stochastic grain
export const MODES = ['smear', 'halo', 'grain'];

const PALETTE = {
  off: { base: [0.16, 0.03, 0.012], tone: [0.55, 0.16, 0.07], hi: [0.96, 0.82, 0.64] },
  on: { base: [0.07, 0.09, 0.025], tone: [0.37, 0.43, 0.14], hi: [0.92, 0.94, 0.74] },
  maybe: { base: [0.14, 0.1, 0.012], tone: [0.6, 0.44, 0.08], hi: [0.97, 0.89, 0.64] },
  unknown: { base: [0.08, 0.075, 0.07], tone: [0.3, 0.28, 0.26], hi: [0.85, 0.83, 0.8] },
};

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime, uMode, uLight, uFlicker;
uniform vec3 uBase, uTone, uHi;

float hash(vec2 p){ p = mod(p, 1024.0); vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Petal: a vesica pointing up from the origin.
float petal(vec2 p, float len, float wid){
  p.y -= len * 0.5;
  float d = (len * len * 0.25 + wid * wid) / (2.0 * wid);
  float r = d; float off = d - wid;
  p = abs(p);
  float b = sqrt(r * r - off * off);
  return ((p.y - b) * off > p.x * b) ? length(p - vec2(0.0, b)) : length(p - vec2(-off, 0.0)) - r;
}

// The shared form: a loose cluster of petals that drifts and sways.
float form(vec2 p, float t){
  p -= vec2(0.03 * sin(t * 0.21), 0.02 * cos(t * 0.17));
  p = rot(0.18 * sin(t * 0.13)) * p;
  float d = 1e3;
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float a = fi * 1.62 + 0.35 + 0.06 * sin(t * 0.5 + fi * 1.7);
    float len = 0.30 + 0.06 * sin(fi * 2.3);
    d = min(d, petal(rot(a) * p, len, 0.085 + 0.015 * cos(fi * 1.3)));
  }
  return d;
}

// Drifting light blobs behind everything.
float lights(vec2 p, float t){
  float v = 0.0;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    vec2 c = vec2(sin(t * (0.11 + fi * 0.03) + fi * 2.1) * 0.55, cos(t * (0.07 + fi * 0.02) + fi * 1.3) * 0.38);
    vec2 q = (p - c) * vec2(1.0, 2.2);
    v += exp(-dot(q, q) * (5.0 + fi));
  }
  return v;
}

vec3 grade(float i){
  vec3 c = mix(uBase, uTone, smoothstep(0.0, 0.42, i));
  return mix(c, uHi, smoothstep(0.42, 0.85, i));
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime;
  // Gate weave: the whole frame drifts a hair, like film in a projector.
  vec2 weave = (vec2(noise(vec2(t * 0.8, 1.0)), noise(vec2(t * 0.7, 9.0))) - 0.5) * 0.008;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y + weave;
  float light = uLight * uFlicker;
  float I;

  if (uMode < 0.5){
    // Long exposure: average the scene along a horizontal pan; the pan length breathes to zero now and then.
    float ph = fract(t / 13.0);
    float focus = smoothstep(0.70, 0.78, ph) * (1.0 - smoothstep(0.88, 0.97, ph));
    float len = mix(0.55, 0.015, focus);
    float acc = 0.0;
    float jit = hash(gl_FragCoord.xy + fract(t) * 91.0) / 27.0;
    for (int k = 0; k < 28; k++){
      float s = (float(k) + jit * 27.0) / 27.0 - 0.5;
      vec2 q = p + vec2(s * len, s * len * 0.06);
      float tk = t - s * 0.6;
      float rough = (noise(q * vec2(3.0, 9.0) + tk * 0.15) - 0.5) * 0.09;
      float f = 1.0 - smoothstep(-0.03, 0.04, form(q, tk) + rough);
      float w = 1.0 - 0.6 * (s + 0.5);
      acc += (f * 1.2 + lights(q * 1.1, tk) * 0.55) * w;
    }
    I = acc / 28.0 * 1.35;
    I += 0.06 * noise(p * 3.0 + t * 0.2);
  } else if (uMode < 1.5){
    // Photogram: the form blocks a light behind it; light leaks round a soft, uneven edge.
    vec2 src = vec2(0.35 * sin(t * 0.19), 0.3 * cos(t * 0.23));
    float tt = t * 0.5;
    float wob = (noise(p * 7.0 + tt * 0.3) - 0.5) * 0.05 + (noise(p * 23.0) - 0.5) * 0.012;
    float d = form(p, tt) + wob;
    float e = 0.004;
    vec2 n = vec2(form(p + vec2(e, 0.0), tt) - form(p - vec2(e, 0.0), tt), form(p + vec2(0.0, e), tt) - form(p - vec2(0.0, e), tt));
    float facing = 0.5 + 0.5 * dot(normalize(n + 1e-5), normalize(src - p));
    float breathe = 0.5 + 0.5 * sin(t * 0.6);
    float glow = exp(-max(d, 0.0) * mix(20.0, 11.0, breathe)) * (0.45 + 0.75 * facing);
    float grain = 0.65 + 0.35 * hash(gl_FragCoord.xy + floor(t * 10.0) * 7.0);
    float spill = 0.18 * exp(-dot(p - src, p - src) * 2.5);
    float inside = smoothstep(0.02, -0.012, d);
    float speck = step(0.997, hash(floor(gl_FragCoord.xy / 1.5) + floor(t * 4.0) * 13.0)) * glow;
    I = mix(glow * grain + spill + speck * 0.6, 0.04 + 0.06 * noise(p * 11.0), inside);
  } else {
    // Grain: luminance becomes the chance that a grain of light lands here; grains reshuffle 12 times a second.
    vec2 q = p;
    q.x *= 1.0 + 0.05 * sin(t * 0.6);
    float d = form(q, t * 0.7);
    float lum = (1.0 - smoothstep(-0.06, 0.05, d)) * (0.55 + 0.45 * noise(q * 6.0 + 3.0));
    lum = max(lum, exp(-max(d, 0.0) * 9.0) * 0.35);
    lum += 0.08 * lights(p, t);
    // Two grain fields crossfade ~2 times a second, so the sand settles instead of boiling.
    vec2 cell = floor(gl_FragCoord.xy / 1.3);
    float ph = t * 2.0;
    float g = mix(hash(cell + mod(floor(ph), 97.0) * 37.0), hash(cell + mod(floor(ph) + 1.0, 97.0) * 37.0), smoothstep(0.0, 1.0, fract(ph)));
    float lv = pow(lum, 1.2);
    I = smoothstep(g - 0.18, g + 0.18, lv) * mix(0.8, 1.0, hash(cell + 3.1)) * 0.85 + lv * 0.25;
  }

  I *= mix(0.25, 1.0, light);
  I *= 1.0 + 0.04 * (noise(vec2(t * 3.0, 4.0)) - 0.5);
  I = 1.0 - exp(-I * 1.25);
  float film = hash(floor(gl_FragCoord.xy) + mod(floor(t * 8.0), 61.0) * 11.0) - 0.5;
  I += film * 0.035;
  vec3 col = grade(I);
  float vig = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(1.0, 1.08)) * 1.4);
  col = mix(uBase * 0.6, col, vig);
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// Returns a controller, or null when WebGL is unavailable (the CSS glow stays as fallback).
export function createFx(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  if (!gl) return null;
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.warn('fx disabled:', e.message);
    return null;
  }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uRes', 'uTime', 'uMode', 'uLight', 'uFlicker', 'uBase', 'uTone', 'uHi']) U[n] = gl.getUniformLocation(prog, n);

  const target = { mode: 0, light: 1, state: 'unknown' };
  const cur = { light: 1, base: [...PALETTE.unknown.base], tone: [...PALETTE.unknown.tone], hi: [...PALETTE.unknown.hi] };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  let last = 0;

  function resize() {
    // The smear is blurry anyway, so it renders at reduced resolution to spare phones.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * (target.mode === 0 ? 0.5 : 1);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < 33) return; // ~30fps is plenty for slow light
    last = now;
    resize();
    const pal = PALETTE[target.state] || PALETTE.unknown;
    const k = 0.03; // eases state colour changes over a couple of seconds
    for (const key of ['base', 'tone', 'hi']) cur[key] = cur[key].map((v, i) => v + (pal[key][i] - v) * k);
    cur.light += (target.light - cur.light) * k;
    const t = reduced ? 20 : (now - t0) / 1000;
    const flicker = target.state === 'maybe' ? (Math.sin(t * 9.0) > 0.85 || Math.sin(t * 2.3) > 0.97 ? 0.4 : 1) : 1;
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uMode, target.mode);
    gl.uniform1f(U.uLight, cur.light);
    gl.uniform1f(U.uFlicker, flicker);
    gl.uniform3fv(U.uBase, cur.base);
    gl.uniform3fv(U.uTone, cur.tone);
    gl.uniform3fv(U.uHi, cur.hi);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);

  return {
    set({ mode, light, state }) {
      if (mode != null) target.mode = MODES.indexOf(mode);
      if (light != null) target.light = light;
      if (state) target.state = state;
    },
  };
}

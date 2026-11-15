// Yüzeye oturan küresel başlık (cap) shader'ları: şok dalgası, lav/köz, kasırga, su, buz, pus, hedef halkası
// vLocal: başlığın merkezine göre -1..1 düzlem koordinatı

import { NOISE_GLSL } from "./particleShaders.js";

export const CAP_VERTEX = /* glsl */ `
  uniform float uCapRadius;
  varying vec2 vLocal;
  varying vec3 vNormalW;
  void main() {
    vLocal = position.xz / uCapRadius;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CAP_HEADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uColorAlt;
  uniform float uIntensity;
  uniform vec3 uSunDir;
  varying vec2 vLocal;
  varying vec3 vNormalW;
  ${NOISE_GLSL}
  float edgeFade(float r) { return 1.0 - smoothstep(0.82, 1.0, r); }
`;

export const SHOCKWAVE_FRAGMENT = /* glsl */ `
  ${CAP_HEADER}
  void main() {
    vec2 p = vLocal;
    float r = length(p) + (vnoise(p * 9.0 + uTime * 0.7) - 0.5) * 0.035;
    float rings = 0.0;
    for (int i = 0; i < 4; i++) {
      float phase = fract(uTime * 0.26 + float(i) * 0.25);
      float width = 0.012 + 0.05 * phase;
      rings += smoothstep(width, 0.0, abs(r - phase * 0.95)) * pow(1.0 - phase, 1.4);
    }
    float core = exp(-r * r * 70.0) * (0.75 + 0.25 * sin(uTime * 7.0));
    float faults = smoothstep(0.03, 0.0, abs(fbm(p * 5.0) - 0.5)) * smoothstep(0.6, 0.0, r) * 0.5;
    float alpha = clamp(rings + core + faults, 0.0, 1.0) * edgeFade(r);
    vec3 color = mix(uColor, uColorAlt, core + faults * 0.5);
    gl_FragColor = vec4(color * uIntensity, alpha);
  }
`;

export const HEAT_FRAGMENT = /* glsl */ `
  ${CAP_HEADER}
  void main() {
    vec2 p = vLocal;
    float r = length(p);
    float flow = fbm(p * 3.5 + vec2(uTime * 0.12, -uTime * 0.08));
    float detail = fbm(p * 11.0 - uTime * 0.35);
    float mask = smoothstep(0.95, 0.15, r + (flow - 0.5) * 0.55);
    float heat = pow(mask, 1.4) * (0.5 + 0.5 * detail);
    float veins = smoothstep(0.05, 0.0, abs(flow - 0.52)) * mask;
    float flicker = 0.85 + 0.15 * sin(uTime * 5.0 + detail * 6.0);
    vec3 color = mix(uColorAlt, uColor, heat) + vec3(1.0, 0.85, 0.5) * veins * 0.9;
    float alpha = clamp(heat * 1.3 + veins * 0.7, 0.0, 1.0) * edgeFade(r);
    gl_FragColor = vec4(color * uIntensity * flicker, alpha);
  }
`;

// İç kısım dışa göre hızlı döner, logaritmik büküm sarmal kolları oluşturur
export const VORTEX_FRAGMENT = /* glsl */ `
  ${CAP_HEADER}
  uniform float uSpin;
  void main() {
    vec2 p = vLocal;
    float r = length(p);
    float a = atan(p.y, p.x);
    // Sabit logaritmik sarmal + bütün olarak dönüş. Yarıçapa göre farklı hız verilirse desen zamanla
    // sarılıp halkalara dönüşür; iç hareketi gürültünün zamanla kayması verir
    float twist = 2.6 * log(r + 0.06) - uTime * uSpin * 0.35;
    vec2 q = r * vec2(cos(a - twist), sin(a - twist));
    float n1 = fbm(q * 3.2 + vec2(4.0, uTime * 0.04));
    float n2 = fbm(q * 8.0 - vec2(2.0, uTime * 0.07));
    float arms = 0.5 + 0.5 * sin(2.0 * (a - twist) + n1 * 5.0);
    float ragged = r + (n2 - 0.5) * 0.28;
    float density = smoothstep(0.42, 0.78, n1 * 0.6 + arms * 0.28 + n2 * 0.22);
    density = max(density, smoothstep(0.42, 0.12, ragged) * (0.75 + 0.25 * n2));
    density *= smoothstep(1.0, 0.55, ragged);
    float eye = smoothstep(0.035, 0.085, r);
    float wall = exp(-pow((r - 0.1) / 0.035, 2.0)) * 0.5;
    float d = clamp(density * eye + wall * eye, 0.0, 1.0);
    float light = 0.25 + 0.85 * smoothstep(-0.25, 0.45, dot(normalize(vNormalW), uSunDir));
    vec3 color = mix(uColorAlt, uColor, clamp(d * 0.55 + n2 * 0.6, 0.0, 1.0)) * light;
    float flashSlot = floor(uTime * 6.0);
    float flash = step(0.93, hash12(vec2(flashSlot, 3.7)));
    vec2 flashPos = vec2(hash12(vec2(flashSlot, 1.1)), hash12(vec2(flashSlot, 2.3))) - 0.5;
    float bolt = flash * exp(-length(p - flashPos * 0.9) * 9.0) * d;
    color += vec3(0.75, 0.85, 1.0) * bolt * 3.0;
    gl_FragColor = vec4(color * uIntensity, d * 0.94);
  }
`;

export const RIPPLE_FRAGMENT = /* glsl */ `
  ${CAP_HEADER}
  void main() {
    vec2 p = vLocal;
    float r = length(p);
    float spread = fbm(p * 2.8 + uTime * 0.05);
    float mask = smoothstep(0.92, 0.25, r + (spread - 0.5) * 0.5);
    float waves = 0.5 + 0.5 * sin(r * 38.0 - uTime * 3.2 + spread * 6.0);
    float caustic = pow(fbm(p * 9.0 + vec2(uTime * 0.3, uTime * 0.2)), 3.0) * 2.5;
    vec3 color = mix(uColorAlt, uColor, waves * 0.55 + caustic * 0.45);
    float alpha = mask * (0.45 + 0.35 * waves) * edgeFade(r);
    gl_FragColor = vec4(color * uIntensity, alpha);
  }
`;

export const FROST_FRAGMENT = /* glsl */ `
  ${CAP_HEADER}
  void main() {
    // Alan gürültüyle bükülür ki hücreler düzgün petek değil kırık buz kütlesi gibi dursun
    vec2 p = vLocal * 9.0 + vec2(fbm(vLocal * 3.0), fbm(vLocal * 3.0 + 9.0)) * 1.6;
    vec2 cell = floor(p);
    vec2 frac = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    vec2 nearest = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(hash12(cell + g), hash12(cell + g + 17.0));
        float d = length(g + o - frac);
        if (d < f1) { f2 = f1; f1 = d; nearest = cell + g; } else if (d < f2) { f2 = d; }
      }
    }
    float r = length(vLocal);
    float gap = f2 - f1;
    float floe = smoothstep(0.03, 0.09, gap);
    float rim = smoothstep(0.09, 0.03, gap) * floe;
    float shade = 0.7 + 0.3 * hash12(nearest + 3.0) + (fbm(p * 2.0) - 0.5) * 0.25;
    float sparkle = pow(hash12(nearest + floor(uTime * 2.0)), 30.0) * 2.0 * floe;
    float drift = 0.5 + 0.5 * sin(uTime * 0.6 + hash12(nearest) * 6.28);
    float mask = smoothstep(0.95, 0.3, r + (fbm(vLocal * 2.5) - 0.5) * 0.5);
    float light = 0.2 + 0.8 * smoothstep(-0.2, 0.4, dot(normalize(vNormalW), uSunDir));
    vec3 color = mix(uColorAlt, uColor, shade) * light + uColor * rim * 0.5 + vec3(1.0) * sparkle;
    float alpha = mask * floe * (0.55 + 0.25 * drift * (1.0 - shade));
    gl_FragColor = vec4(color * uIntensity, clamp(alpha, 0.0, 1.0));
  }
`;

export const HAZE_FRAGMENT = /* glsl */ `
  ${CAP_HEADER}
  void main() {
    vec2 p = vLocal;
    float r = length(p);
    float n = fbm(p * 3.0 + vec2(uTime * 0.07, uTime * 0.04));
    float n2 = fbm(p * 7.0 - vec2(uTime * 0.12, 0.0));
    float mask = smoothstep(0.95, 0.1, r + (n - 0.5) * 0.6);
    vec3 color = mix(uColorAlt, uColor, n2);
    gl_FragColor = vec4(color * uIntensity, mask * (0.35 + 0.4 * n2));
  }
`;

export const TARGET_RING_FRAGMENT = /* glsl */ `
  ${CAP_HEADER}
  void main() {
    vec2 p = vLocal;
    float r = length(p);
    float a = atan(p.y, p.x) / 6.2831853 + 0.5;
    float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
    float ring = smoothstep(0.018, 0.0, abs(r - 0.8));
    float dashes = step(0.45, fract(a * 36.0 - uTime * 0.4));
    float outer = smoothstep(0.012, 0.0, abs(r - 0.93)) * dashes;
    float sweep = pow(fract(a - uTime * 0.25), 6.0) * smoothstep(0.8, 0.0, r) * 0.45;
    float ticks = step(0.985, fract(a * 4.0 + 0.0075)) * smoothstep(0.68, 0.74, r) * smoothstep(0.88, 0.82, r);
    float alpha = clamp((ring + outer + ticks) * pulse + sweep, 0.0, 1.0);
    gl_FragColor = vec4(uColor * uIntensity, alpha);
  }
`;

export const BEAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying float vCameraDistance;
  void main() {
    vUv = uv;
    vNormalV = normalize(normalMatrix * normal);
    vCameraDistance = length(cameraPosition - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const BEAM_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying float vCameraDistance;
  void main() {
    // Uzaktan olayı bulmak için var; yakın odakta efektin önüne geçmesin diye söner
    float fade = pow(1.0 - vUv.y, 1.7) * smoothstep(0.7, 1.7, vCameraDistance);
    float pulse = smoothstep(0.12, 0.0, abs(fract(vUv.y - uTime * 0.45) - 0.5) - 0.38);
    float facing = abs(vNormalV.z);
    float alpha = fade * (0.35 + 0.65 * pulse) * (0.35 + 0.65 * facing);
    gl_FragColor = vec4(uColor * uIntensity, alpha);
  }
`;

export const MARKER_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uSize;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vColor = aColor;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPixelRatio;
  }
`;

export const MARKER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.13, 0.08, d);
    float halo = pow(smoothstep(0.5, 0.0, d), 3.0) * 0.6;
    float phase = fract(uTime * 0.7 + vSeed);
    float ring = smoothstep(0.03, 0.0, abs(d - (0.12 + 0.34 * phase))) * (1.0 - phase);
    float alpha = clamp(core + halo + ring, 0.0, 1.0);
    vec3 color = mix(vColor, vec3(1.0), core * 0.6) * 1.6;
    gl_FragColor = vec4(color, alpha);
  }
`;

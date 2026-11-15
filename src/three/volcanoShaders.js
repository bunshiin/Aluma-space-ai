// Volkan dağı shader'ları: bazalt kaya, eteklerde bitki örtüsü, kraterde ve yamaç olukları boyunca akan lav

import { NOISE_GLSL } from "./particleShaders.js";

export const VOLCANO_VERTEX = /* glsl */ `
  attribute vec3 aParams; // x: yarıçap oranı, y: açı, z: normalize yükseklik
  uniform float uRise;    // 0: yer altında, 1: tam yükseldi
  varying vec3 vParams;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  void main() {
    vParams = aParams;
    vLocal = position;
    // Sadece yükseklik ölçeklenir; taban küre eğriliğini izlemeye devam eder
    float curve = -0.5 * dot(position.xz, position.xz);
    vec3 p = position;
    p.y = curve + (position.y - curve) * uRise;
    // Yükseklik s ile ölçeklenince normalin y bileşeni 1/s ile büyür
    vec3 n = normal;
    n.y /= max(uRise, 0.05);
    vNormalW = normalize(mat3(modelMatrix) * normalize(n));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const VOLCANO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRise;
  uniform vec3 uSunDir;
  uniform float uSeed;
  uniform float uBaseRadius;
  varying vec3 vParams;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  ${NOISE_GLSL}

  void main() {
    float t = vParams.x;
    float angle = vParams.y;
    float h = clamp(vParams.z, 0.0, 1.0);
    vec3 n = normalize(vNormalW);
    vec2 uv = vLocal.xz / uBaseRadius * 7.0 + uSeed;

    float grain = fbm(uv * 3.0);
    float slope = 1.0 - clamp(n.y, 0.0, 1.0);

    // Kaya: koyu bazalt, dik yüzeylerde açık kül tonu; alçakta bitki örtüsü, tepede kül
    vec3 basalt = mix(vec3(0.022, 0.02, 0.019), vec3(0.075, 0.066, 0.058), grain);
    vec3 scoria = vec3(0.09, 0.034, 0.018);
    vec3 rock = mix(basalt, scoria, smoothstep(0.55, 0.9, grain) * 0.5);
    rock = mix(rock, vec3(0.11, 0.1, 0.095), smoothstep(0.35, 0.8, slope + grain * 0.25) * 0.5);
    float forest = (1.0 - smoothstep(0.08, 0.34, h)) * (1.0 - smoothstep(0.3, 0.6, slope));
    vec3 green = mix(vec3(0.016, 0.034, 0.014), vec3(0.04, 0.06, 0.025), fbm(uv * 6.0));
    vec3 color = mix(rock, green, forest);
    color = mix(color, vec3(0.05, 0.047, 0.045), smoothstep(0.82, 1.0, h) * 0.6);

    float sun = dot(n, uSunDir);
    float lit = 0.05 + 0.95 * smoothstep(-0.12, 0.55, sun);
    color *= lit;

    // Lav: yamaç oluklarında akar, kraterden uzaklaştıkça soğur; zamanla titreşir
    float channel = fbm(vec2(cos(angle), sin(angle)) * 3.2 + vec2(uSeed, 0.0));
    // fbm 0.5 çevresinde toplanır; dar eşik sadece birkaç ayrı akıntı bırakır
    float flowLine = smoothstep(0.02, 0.003, abs(channel - 0.5) - 0.01 * (1.0 - t));
    float tongue = smoothstep(0.62, 0.12, t + fbm(vec2(angle * 4.0, uSeed)) * 0.22);
    float pulse = 0.55 + 0.45 * fbm(vec2(angle * 6.0, t * 9.0 - uTime * 0.35));
    // Lav dağ yükselirken yavaş yavaş belirir
    float lava = flowLine * tongue * pulse * smoothstep(0.45, 1.0, uRise);
    float crater = smoothstep(0.12, 0.0, t);
    float molten = crater * (0.7 + 0.3 * sin(uTime * 2.4 + grain * 9.0)) * smoothstep(0.3, 1.0, uRise);

    vec3 lavaColor = mix(vec3(1.5, 0.28, 0.03), vec3(2.0, 0.75, 0.12), pulse);
    color += lavaColor * (lava * 0.8 + molten * 0.7);
    // Soğuyan lav kenarı koyu kabuk bırakır
    color = mix(color, color * 0.55, flowLine * (1.0 - tongue) * 0.3);

    // Taban küre dokusuna karışır: kenarda saydamlaşır
    float alpha = smoothstep(1.0, 0.82, t + (grain - 0.5) * 0.08);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

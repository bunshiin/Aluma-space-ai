// Güneş patlaması ve sahne atmosferi için GLSL kaynakları. Sadece shader metni burada durur,
// mesh kurulumu solarFlareMeshes.js ve sceneEnhancements.js içinde.

// Renkler sRGB gibi ayarlandı; bloom hattının çıkış geçişi sRGB kodladığı için önce doğrusala çevrilir
const LINEAR_GLSL = `
  vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
`;

// Dikişsiz değer gürültüsü + fbm; plazma akışı, korona şeritleri ve dalga dokusu ortak kullanır
const NOISE_GLSL = `
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float valueNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int k = 0; k < 4; k++) { v += a * valueNoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

export const CLAW_VERTEX_SHADER = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalW, vViewW;
  void main() {
    vUv = uv;
    // Plazma kolunun yüzeyi yol boyunca kıpırdar, kol katı bir boru gibi durmasın
    vec3 p = position + normal * 0.035 * sin(uv.x * 22.0 - uTime * 6.0);
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const CLAW_FRAGMENT_SHADER = `
  ${LINEAR_GLSL}
  uniform vec3 uTint;
  uniform float uTime, uGrow, uOpacity, uHeat;
  varying vec2 vUv;
  varying vec3 vNormalW, vViewW;
  ${NOISE_GLSL}
  void main() {
    if (vUv.x > uGrow) discard;
    float a = vUv.y * 6.2831853;
    float flow = fbm(vec2(vUv.x * 9.0 - uTime * 2.4 + cos(a) * 0.7, sin(a) * 1.4 + uTime * 0.3));
    float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
    float core = pow(facing, 1.6);
    // Büyüyen uç kesik boru gibi değil, sönerek ilerlesin
    float frontFade = 1.0 - smoothstep(uGrow - 0.12, uGrow, vUv.x);
    float tipFade = 1.0 - smoothstep(0.82, 1.0, vUv.x);
    float strands = smoothstep(0.32, 0.78, flow);
    vec3 deep = mix(vec3(0.95, 0.16, 0.02), uTint, 0.18);
    vec3 plasma = vec3(1.0, 0.52, 0.12);
    vec3 hot = vec3(1.0, 0.9, 0.7);
    float heat = clamp(core * 0.55 * uHeat + flow * 0.35, 0.0, 1.0);
    vec3 col = mix(deep, plasma, heat);
    col = mix(col, hot, pow(core, 3.0) * 0.6 * uHeat);
    float alpha = (0.1 + core * 0.55) * (0.35 + strands * 0.9) * frontFade * tipFade * uOpacity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    gl_FragColor.rgb = toLinear(gl_FragColor.rgb);
  }
`;

// Kameraya dönük kare (billboard): kamera nesnesine ihtiyaç duymadan view uzayında açılır
export const BILLBOARD_VERTEX_SHADER = `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vec4 mvPos = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mvPos.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const FLASH_FRAGMENT_SHADER = `
  ${LINEAR_GLSL}
  uniform vec3 uColor, uCoreColor;
  uniform float uIntensity, uTime;
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float core = exp(-r * 9.0);
    float halo = exp(-r * 3.2) * 0.55;
    float angle = atan(vUv.y, vUv.x + 1e-5);
    // Teleskop kırınım ışınları (SDO görüntülerindeki gibi), çok hafif döner
    float rays = pow(abs(cos(angle * 3.0 + uTime * 0.15)), 40.0) * exp(-r * 2.6) * 0.8;
    vec3 col = mix(uColor, uCoreColor, clamp(core * 1.6 + rays, 0.0, 1.0));
    float edge = 1.0 - smoothstep(0.85, 1.0, r);
    gl_FragColor = vec4(col, clamp(core + halo + rays, 0.0, 1.0) * uIntensity * edge);
    gl_FragColor.rgb = toLinear(gl_FragColor.rgb);
  }
`;

export const CORONA_FRAGMENT_SHADER = `
  ${LINEAR_GLSL}
  uniform float uTime, uDiskRatio, uIntensity;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float angle = atan(vUv.y, vUv.x + 1e-5);
    float outside = max(r - uDiskRatio, 0.0);
    float glow = exp(-outside * 9.0) * 0.85 + exp(-outside * 3.0) * 0.25;
    float streamers = fbm(vec2(cos(angle) * 2.5 + 3.0, sin(angle) * 2.5 + r * 1.5 - uTime * 0.04));
    float mask = smoothstep(uDiskRatio * 0.92, uDiskRatio * 1.02, r) * (1.0 - smoothstep(0.7, 1.0, r));
    vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.86, 0.6), exp(-outside * 6.0));
    gl_FragColor = vec4(col, glow * (0.6 + 0.6 * streamers) * mask * uIntensity);
    gl_FragColor.rgb = toLinear(gl_FragColor.rgb);
  }
`;

export const WAVE_VERTEX_SHADER = `
  uniform float uTime, uBandFreq;
  varying vec3 vLocal, vNormalW, vViewW;
  void main() {
    vLocal = position;
    float theta = acos(clamp(position.y, -1.0, 1.0));
    // Dalga cephesi hafifçe dalgalanır; düz bir kabuk yerine titreşen alan hissi verir
    vec3 p = position * (1.0 + 0.012 * sin(theta * uBandFreq * 0.5 - uTime * 7.0));
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const WAVE_FRAGMENT_SHADER = `
  ${LINEAR_GLSL}
  uniform vec3 uColor;
  uniform float uTime, uOpacity, uCone, uBandFreq;
  varying vec3 vLocal, vNormalW, vViewW;
  ${NOISE_GLSL}
  void main() {
    float theta = acos(clamp(vLocal.y, -1.0, 1.0));
    float edge = 1.0 - smoothstep(uCone * 0.55, uCone, theta);
    // Yuvarlama dot'u 1'in üstüne taşırsa pow negatif tabanda NaN verir; bloom onu tüm ekrana yayar
    float rim = pow(clamp(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 0.0, 1.0), 5.0);
    // İnce, ilerleyen alan çizgileri: dolu bir duvar değil, şeffaf bir titreşim cephesi
    float bands = pow(clamp(0.5 + 0.5 * sin(theta * uBandFreq - uTime * 5.0), 0.0, 1.0), 10.0);
    float phi = atan(vLocal.z, vLocal.x + 1e-5);
    float grain = fbm(vec2(cos(phi) * 3.0 + theta * 4.0, sin(phi) * 3.0 - uTime * 0.6));
    float alpha = (0.01 + rim * 0.45 + bands * 0.3 * (0.5 + 0.5 * grain)) * edge * uOpacity;
    vec3 col = mix(uColor, vec3(1.0), rim * 0.45 + bands * 0.35);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    gl_FragColor.rgb = toLinear(gl_FragColor.rgb);
  }
`;

export const PARTICLE_VERTEX_SHADER = `
  attribute float aScale, aHeat;
  uniform float uSize;
  varying float vHeat;
  void main() {
    vHeat = aHeat;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * aScale * (140.0 / max(-mvPos.z, 1.0));
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const PARTICLE_FRAGMENT_SHADER = `
  ${LINEAR_GLSL}
  uniform vec3 uColor, uCoreColor;
  uniform float uOpacity;
  varying float vHeat;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    float glow = exp(-r2 * 3.2);
    gl_FragColor = vec4(mix(uColor, uCoreColor, clamp(vHeat * 0.75 + glow * 0.45, 0.0, 1.0)), glow * uOpacity);
    gl_FragColor.rgb = toLinear(gl_FragColor.rgb);
  }
`;

export const STAR_VERTEX_SHADER = `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const STAR_FRAGMENT_SHADER = `
  ${LINEAR_GLSL}
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vColor, exp(-r2 * 4.0));
    gl_FragColor.rgb = toLinear(gl_FragColor.rgb);
  }
`;

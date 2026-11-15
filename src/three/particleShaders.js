// GPU parçacık shader'ı: her parçacığın yaşı ve yolu shader'da hesaplanır, CPU her karede dizi güncellemez
// Yumuşak yuvarlak sprite + gürültü ile kare/piksel görünümü engellenir

export const NOISE_GLSL = /* glsl */ `
  float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
    return v;
  }
`;

// Modlar: PLUME (kül sütunu), SPARKS (lav balistiği), FLAMES (alev), SMOKE (duman), SNOW (kar)
export const PARTICLE_VERTEX = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uLife;
  uniform float uSize;
  uniform float uHeight;
  uniform float uSpread;
  uniform float uPixelRatio;
  uniform float uViewScale;
  uniform vec2 uWind;
  uniform vec3 uSunDir;
  varying float vAge;
  varying float vSeed;
  varying float vLight;
  ${NOISE_GLSL}

  void main() {
    float cycle = uTime / uLife + aSeed.x;
    float age = fract(cycle);
    float cycleId = floor(cycle);
    float r1 = hash11(aSeed.y * 91.7 + cycleId * 13.1);
    float r2 = hash11(aSeed.z * 47.3 + cycleId * 7.9);
    float angle = r1 * 6.2831853;
    vec3 p = vec3(0.0);
    float size = uSize;

    #if defined(MODE_PLUME)
      float rise = 1.0 - pow(1.0 - age, 2.2);
      float radius = uSpread * (0.12 * sqrt(r2) + age * age * (0.55 + aSeed.w * 0.6));
      angle += age * 1.8;
      p = vec3(cos(angle) * radius, uHeight * rise, sin(angle) * radius);
      p.xz += uWind * age * age * uHeight;
      size *= 0.35 + 1.7 * age;
    #elif defined(MODE_SPARKS)
      float reach = uSpread * (0.25 + 0.75 * r2);
      float lift = uHeight * (0.45 + 0.55 * aSeed.w);
      p = vec3(cos(angle) * reach * age, lift * 4.0 * age * (1.0 - age), sin(angle) * reach * age);
      size *= 1.0 - 0.65 * age;
    #elif defined(MODE_FLAMES)
      float baseR = uSpread * sqrt(r2);
      vec2 base = vec2(cos(angle), sin(angle)) * baseR;
      float flicker = sin(uTime * 9.0 + aSeed.y * 30.0) * 0.12 * uSpread * age;
      p = vec3(base.x + flicker, uHeight * age * (0.55 + 0.45 * aSeed.w), base.y);
      size *= pow(1.0 - age, 0.6) * (0.7 + 0.6 * aSeed.w);
    #elif defined(MODE_SMOKE)
      float baseR = uSpread * sqrt(r2) * 0.8;
      vec2 base = vec2(cos(angle), sin(angle)) * baseR;
      p = vec3(base.x, uHeight * age, base.y);
      p.xz += uWind * age * uHeight * 1.4;
      p.x += (vnoise(vec2(age * 3.0, aSeed.y * 10.0)) - 0.5) * uSpread * 0.6;
      size *= 0.5 + 1.6 * age;
    #elif defined(MODE_SNOW)
      vec2 base = vec2(cos(angle), sin(angle)) * uSpread * sqrt(r2);
      base += vec2(sin(uTime * 0.8 + aSeed.y * 20.0), cos(uTime * 0.6 + aSeed.z * 20.0)) * uSpread * 0.06;
      p = vec3(base.x, uHeight * (1.0 - age), base.y);
      size *= 0.6 + 0.4 * aSeed.w;
    #endif

    vAge = age;
    vSeed = aSeed.y;
    // Duman/kül gece tarafında karanlık kalır; küre merkezli konum yüzey normali yerine geçer
    vec3 worldPos = (modelMatrix * vec4(p, 1.0)).xyz;
    vLight = 0.08 + 0.92 * smoothstep(-0.2, 0.35, dot(normalize(worldPos), uSunDir));
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = size * uPixelRatio * uViewScale / max(-mvPosition.z, 0.05);
  }
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uColorStart;
  uniform vec3 uColorMid;
  uniform vec3 uColorEnd;
  uniform float uOpacity;
  uniform float uIntensity;
  uniform float uFadeIn;
  varying float vAge;
  varying float vSeed;
  varying float vLight;
  ${NOISE_GLSL}

  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float d = length(pc);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    #if defined(PUFFY)
      float puff = vnoise(pc * 5.0 + vSeed * 17.0 + vAge * 2.0);
      soft *= 0.55 + 0.45 * puff;
    #else
      soft = pow(soft, 1.6);
    #endif
    vec3 color = vAge < 0.5
      ? mix(uColorStart, uColorMid, vAge * 2.0)
      : mix(uColorMid, uColorEnd, (vAge - 0.5) * 2.0);
    float fade = smoothstep(0.0, uFadeIn, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
    float alpha = soft * fade * uOpacity;
    #if defined(SUN_LIT)
      // Gece dumanın alt kısmı alttaki ateşin turuncusunu alır
      color = color * vLight + vec3(0.42, 0.14, 0.03) * pow(1.0 - vAge, 2.0) * (1.0 - vLight);
    #endif
    gl_FragColor = vec4(color * uIntensity, alpha);
  }
`;

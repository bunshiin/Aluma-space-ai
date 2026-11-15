// Dünya küresi shader'ları: gündüz/gece, okyanus parlaması, bulut katmanı, atmosfer, yıldızlar

export const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPosW = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// Doku kanalları (three.js örneği): R kabartma, G pürüzlülük (okyanus düşük), B bulut
export const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uSurfaceMap;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float sunDot = dot(n, uSunDir);
    float dayMix = smoothstep(-0.18, 0.28, sunDot);

    vec3 dayColor = texture2D(uDayMap, vUv).rgb;
    vec3 nightColor = texture2D(uNightMap, vUv).rgb;
    float roughness = texture2D(uSurfaceMap, vUv).g;

    float diffuse = clamp(sunDot * 0.9 + 0.12, 0.0, 1.0);
    vec3 lit = dayColor * (0.05 + 1.15 * diffuse);

    vec3 halfDir = normalize(uSunDir + viewDir);
    float oceanMask = 1.0 - smoothstep(0.25, 0.55, roughness);
    float specular = pow(max(dot(n, halfDir), 0.0), 55.0) * oceanMask * dayMix;
    lit += vec3(1.0, 0.92, 0.78) * specular * 0.75;

    vec3 cityLights = pow(nightColor, vec3(1.4)) * vec3(1.6, 1.25, 0.85) * 1.4;
    vec3 color = mix(cityLights, lit, dayMix);

    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    vec3 skyTint = mix(vec3(1.0, 0.45, 0.2), vec3(0.35, 0.62, 1.0), smoothstep(-0.05, 0.35, sunDot));
    color += skyTint * rim * (0.08 + 0.55 * smoothstep(-0.25, 0.4, sunDot));

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const CLOUD_FRAGMENT = /* glsl */ `
  uniform sampler2D uSurfaceMap;
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec2 drift = vec2(uTime * 0.0012, 0.0);
    float cloud = texture2D(uSurfaceMap, vUv + drift).b;
    float alpha = smoothstep(0.12, 0.85, cloud);
    vec3 n = normalize(vNormalW);
    float sunDot = dot(n, uSunDir);
    float light = smoothstep(-0.2, 0.45, sunDot);
    vec3 color = mix(vec3(0.02, 0.03, 0.06), vec3(1.0, 0.99, 0.97), light);
    color = mix(color, vec3(1.0, 0.6, 0.4), smoothstep(0.35, 0.0, abs(sunDot - 0.02)) * 0.35);
    gl_FragColor = vec4(color, alpha * (0.25 + 0.65 * light));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Arka yüz çizilir: Dünya kenarında parlak, uzaya doğru sönen hale
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    float glow = pow(clamp(0.66 - dot(vNormalV, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 4.5);
    float sunDot = dot(normalize(vNormalW), uSunDir);
    float day = smoothstep(-0.15, 0.5, sunDot);
    // Turuncu sadece gece/gündüz sınırında ince bir şerit; gece tarafı karanlık kalır
    float twilight = exp(-pow((sunDot + 0.05) / 0.16, 2.0));
    vec3 color = vec3(0.3, 0.6, 1.0) * day * 1.6 + vec3(1.0, 0.45, 0.18) * twilight * 0.55;
    gl_FragColor = vec4(color * glow, 1.0);
  }
`;

export const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    vTwinkle = 0.65 + 0.35 * sin(uTime * (0.6 + aSeed * 2.0) + aSeed * 40.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
  }
`;

export const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * vTwinkle, core * core);
  }
`;

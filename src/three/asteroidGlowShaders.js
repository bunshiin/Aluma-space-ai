// NEO_SWARM sahnesinin shader'ları: asteroit tehlike çerçevesi ve Dünya atmosferi.

// Tehlike çerçevesi: modelin kendi geometrisi normal yönünde şişirilir ve sadece arka yüzü
// çizilir (inverted hull). Böylece çerçeve kürenin değil, asteroidin gerçek şeklinin kalıbını izler.
export const ASTEROID_GLOW_VERTEX_SHADER = /* glsl */ `
uniform float uThickness;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  vec3 displaced = position + normal * uThickness;
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

// Kenara yaklaştıkça parlar; bloom bu parlak bandı yumuşak bir hale çevirir
export const ASTEROID_GLOW_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uOpacity;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  float facing = abs(dot(normalize(vNormalV), normalize(vViewDir)));
  float rim = pow(1.0 - facing, 1.4);
  float strength = (0.45 + 0.55 * rim) * uOpacity;
  gl_FragColor = vec4(uColor * uIntensity * strength, strength);
}
`;

// Dünya atmosferi: Dünya'dan biraz büyük bir kürenin sadece arka yüzü çizilir. Hale Dünya'nın
// kenarında en parlak, dışa doğru sönümlenir; Güneş'e bakan tarafta daha belirgin olur.
export const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vWorldNormal;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSunDirection;
uniform float uLimbDot;
uniform float uIntensity;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vWorldNormal;
void main() {
  float d = dot(normalize(vNormalV), normalize(vViewDir));
  float falloff = pow(clamp(-d / uLimbDot, 0.0, 1.0), 2.2);
  float day = clamp(dot(normalize(vWorldNormal), uSunDirection) * 0.6 + 0.55, 0.12, 1.0);
  float strength = falloff * day * uIntensity;
  gl_FragColor = vec4(uColor * strength, strength);
}
`;

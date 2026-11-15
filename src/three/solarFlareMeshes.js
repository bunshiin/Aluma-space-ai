// Güneş patlamasının görsel parçalarını kurar: pençe kolları, patlama sonrası kemerler,
// yüzey flaşı, enerjik parçacıklar ve elektromanyetik dalga kabukları.
import {
  calculateArcadePaths,
  calculateClawPaths,
  calculateStreamPosition,
  createTaperedTubeGeometry,
} from './flareGeometry.js';
import { calculateSeededRandom } from './flareMath.js';
import {
  BILLBOARD_VERTEX_SHADER,
  CLAW_FRAGMENT_SHADER,
  CLAW_VERTEX_SHADER,
  FLASH_FRAGMENT_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
  WAVE_FRAGMENT_SHADER,
  WAVE_VERTEX_SHADER,
} from './solarFlareShaders.js';

export function createAdditiveShaderMaterial(threeLib, uniforms, vertexShader, fragmentShader) {
  return new threeLib.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: threeLib.DoubleSide,
    blending: threeLib.AdditiveBlending,
  });
}

function createTubeBundle(threeLib, paths, uniforms, name) {
  const material = createAdditiveShaderMaterial(threeLib, uniforms, CLAW_VERTEX_SHADER, CLAW_FRAGMENT_SHADER);
  const group = new threeLib.Group();
  group.name = name;
  paths.forEach((path) => {
    group.add(new threeLib.Mesh(createTaperedTubeGeometry(threeLib, path), material));
  });
  return { group, material, uniforms, paths };
}

/**
 * Pençe biçimli plazma kolları. uGrow 0→1 kolları tabandan uca doğru açar.
 */
export function createFlareClaws(threeLib, profile, basis, sun_radius_units) {
  const uniforms = {
    uTint: { value: new threeLib.Color(profile.color_hex) },
    uTime: { value: 0 },
    uGrow: { value: 0 },
    uOpacity: { value: 1 },
    uHeat: { value: 1 },
  };
  return createTubeBundle(threeLib, calculateClawPaths(profile, basis, sun_radius_units), uniforms, 'FLARE_CLAWS');
}

export function createPostFlareArcade(threeLib, profile, basis, sun_radius_units) {
  const uniforms = {
    uTint: { value: new threeLib.Color(profile.core_color_hex) },
    uTime: { value: 0 },
    uGrow: { value: 1 },
    uOpacity: { value: 0 },
    uHeat: { value: 1.4 },
  };
  return createTubeBundle(threeLib, calculateArcadePaths(profile, basis, sun_radius_units), uniforms, 'FLARE_ARCADE');
}

export function createFlareFlash(threeLib, profile, flashOrigin) {
  const uniforms = {
    uColor: { value: new threeLib.Color(0xffb35c) },
    uCoreColor: { value: new threeLib.Color(profile.core_color_hex) },
    uIntensity: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: 1.5 + profile.claw_height_units * 0.7 },
  };
  const material = createAdditiveShaderMaterial(threeLib, uniforms, BILLBOARD_VERTEX_SHADER, FLASH_FRAGMENT_SHADER);
  const mesh = new threeLib.Mesh(new threeLib.PlaneGeometry(1, 1), material);
  mesh.name = 'FLARE_FLASH';
  mesh.position.set(flashOrigin.x, flashOrigin.y, flashOrigin.z);
  // Billboard köşeleri shader'da açıldığı için sınır kutusu yanıltıcı; kırpılmasın
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/**
 * Elektromanyetik dalga: patlama noktasından açılan şeffaf kubbe kabukları.
 * Kabuk sayısı, açısı ve rengi tehlike seviyesine göre profilden gelir.
 */
export function createEmWave(threeLib, profile, basis, surfaceOrigin) {
  const group = new threeLib.Group();
  group.name = 'FLARE_EM_WAVE';
  group.position.set(surfaceOrigin.x, surfaceOrigin.y, surfaceOrigin.z);
  // lookAt dünya koordinatı bekler ama grup Güneş'in dönen gövdesinin çocuğu; yerel yönü doğrudan kur
  group.quaternion.setFromUnitVectors(
    new threeLib.Vector3(0, 1, 0),
    new threeLib.Vector3(basis.dir.x, basis.dir.y, basis.dir.z)
  );

  const geometry = new threeLib.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, profile.wave_cone_rad);
  const shells = [];
  for (let k = 0; k < profile.wave_pulse_count; k += 1) {
    const uniforms = {
      uColor: { value: new threeLib.Color(profile.color_hex) },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uCone: { value: profile.wave_cone_rad },
      uBandFreq: { value: 18 + profile.intensity_level * 8 },
    };
    const mesh = new threeLib.Mesh(
      geometry,
      createAdditiveShaderMaterial(threeLib, uniforms, WAVE_VERTEX_SHADER, WAVE_FRAGMENT_SHADER)
    );
    // Kubbe +Y etrafında açılır; grubun +Y'si patlama yönüne çevrildi
    mesh.visible = false;
    group.add(mesh);
    shells.push({ mesh, uniforms });
  }
  return { group, shells };
}

/**
 * Pençe kemerleri boyunca akan plazma parçacıkları. Her parçacık bir ana kolun yolunu ayağından
 * ucuna kadar döner ve başa sarar; sahne kapanana kadar sürer.
 */
export function createFlareParticles(threeLib, profile, clawPaths) {
  const paths = clawPaths.filter((path) => path.is_main);
  const count = profile.particle_count;
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const heats = new Float32Array(count);
  const streams = [];
  const jitter_units = profile.claw_height_units * 0.04;

  for (let i = 0; i < count; i += 1) {
    const stream = {
      path_index: i % paths.length,
      progress: calculateSeededRandom(i * 1.7 + 3.1),
      speed_s: 0.1 + 0.18 * calculateSeededRandom(i * 4.3 + 0.7),
      jitter: {
        x: (calculateSeededRandom(i * 2.9 + 1.1) - 0.5) * jitter_units,
        y: (calculateSeededRandom(i * 3.7 + 5.3) - 0.5) * jitter_units,
        z: (calculateSeededRandom(i * 6.1 + 9.9) - 0.5) * jitter_units,
      },
    };
    const p = calculateStreamPosition(paths[stream.path_index].points, stream.progress);
    positions[i * 3] = p.x + stream.jitter.x;
    positions[i * 3 + 1] = p.y + stream.jitter.y;
    positions[i * 3 + 2] = p.z + stream.jitter.z;
    scales[i] = 0.5 + 0.9 * Math.pow(calculateSeededRandom(i * 8.3 + 2.2), 2);
    heats[i] = calculateSeededRandom(i * 5.1 + 6.6);
    streams.push(stream);
  }

  const geometry = new threeLib.BufferGeometry();
  geometry.setAttribute('position', new threeLib.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new threeLib.BufferAttribute(scales, 1));
  geometry.setAttribute('aHeat', new threeLib.BufferAttribute(heats, 1));

  const uniforms = {
    uColor: { value: new threeLib.Color(profile.color_hex) },
    uCoreColor: { value: new threeLib.Color(profile.core_color_hex) },
    uOpacity: { value: 0 },
    uSize: { value: 0.3 + profile.intensity_level * 0.08 },
  };
  const material = createAdditiveShaderMaterial(threeLib, uniforms, PARTICLE_VERTEX_SHADER, PARTICLE_FRAGMENT_SHADER);
  const mesh = new threeLib.Points(geometry, material);
  mesh.name = 'FLARE_PARTICLES';
  mesh.frustumCulled = false;
  return { mesh, uniforms, positions, streams, paths };
}

// Three.js ve onaylı eklentilerini CDN'den yükler. Testler kendi sahte bağımlılıklarını verir.
const THREE_CDN_BASE = 'https://esm.sh/three@0.170.0';
const JSM_BASE = `${THREE_CDN_BASE}/examples/jsm`;
export const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export async function getThreeDependencies(deps) {
  if (deps?.THREE) {
    return deps;
  }
  const [threeMod, gltfMod, dracoMod, orbitMod, composerMod, renderPassMod, bloomMod, outputMod] =
    await Promise.all([
      import(THREE_CDN_BASE),
      import(`${JSM_BASE}/loaders/GLTFLoader.js`),
      import(`${JSM_BASE}/loaders/DRACOLoader.js`),
      import(`${JSM_BASE}/controls/OrbitControls.js`),
      import(`${JSM_BASE}/postprocessing/EffectComposer.js`),
      import(`${JSM_BASE}/postprocessing/RenderPass.js`),
      import(`${JSM_BASE}/postprocessing/UnrealBloomPass.js`),
      import(`${JSM_BASE}/postprocessing/OutputPass.js`),
    ]);
  return {
    THREE: threeMod,
    GLTFLoader: gltfMod.GLTFLoader,
    DRACOLoader: dracoMod.DRACOLoader,
    OrbitControls: orbitMod.OrbitControls,
    EffectComposer: composerMod.EffectComposer,
    RenderPass: renderPassMod.RenderPass,
    UnrealBloomPass: bloomMod.UnrealBloomPass,
    OutputPass: outputMod.OutputPass,
  };
}

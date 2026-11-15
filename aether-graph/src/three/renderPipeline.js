// Render hattı: sahne → bloom (parlak alanlar ışık saçar) → ton eşleme ve sRGB çıkış.
// Eklentiler yüklenemezse (ör. testte sahte bağımlılık) doğrudan renderer.render'a düşer.

const BLOOM_STRENGTH = 0.55;
const BLOOM_RADIUS = 0.55;
// Sadece Güneş, patlama ve dalga kenarı gibi çok parlak yerler parlasın; gezegenler keskin kalsın
const BLOOM_THRESHOLD = 0.82;
const MSAA_SAMPLES = 4;
const LARGE_VIEWPORT_SAMPLES = 2;
const LARGE_VIEWPORT_AREA_PX = 1280 * 720;
const BLOOM_RESOLUTION_SCALE = 0.5;

export function createRenderPipeline(deps, renderer, scene, camera, width_px, height_px) {
  const { THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = deps;
  // Mars yüzeyine inişte aynı renderer ve bloom hattı başka sahne/kamerayı çizer
  const view = { scene, camera };
  if (!EffectComposer || !RenderPass || !UnrealBloomPass || !OutputPass) {
    return {
      handleRenderFrame: () => renderer.render(view.scene, view.camera),
      handleRenderView(nextScene, nextCamera) {
        view.scene = nextScene;
        view.camera = nextCamera;
      },
      handleRenderResize() {},
      destroyRenderPipeline() {},
    };
  }

  // Composer kendi hedefine çizdiği için canvas'ın antialias'ı işlemez; MSAA hedefte açılır.
  // Büyük ekranlarda 4x HalfFloat MSAA yerine 2x kullanılarak GPU bant genişliği darboğazı önlenir.
  const pixelRatio = typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : 1;
  const samples = width_px * height_px > LARGE_VIEWPORT_AREA_PX ? LARGE_VIEWPORT_SAMPLES : MSAA_SAMPLES;
  const renderTarget = new THREE.WebGLRenderTarget(width_px * pixelRatio, height_px * pixelRatio, {
    type: THREE.HalfFloatType,
    samples,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloomW_px = Math.max(1, Math.round(width_px * BLOOM_RESOLUTION_SCALE));
  const bloomH_px = Math.max(1, Math.round(height_px * BLOOM_RESOLUTION_SCALE));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(bloomW_px, bloomH_px),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  return {
    handleRenderFrame: () => composer.render(),
    handleRenderView(nextScene, nextCamera) {
      renderPass.scene = nextScene;
      renderPass.camera = nextCamera;
    },
    handleRenderResize(nextW_px, nextH_px) {
      composer.setSize(nextW_px, nextH_px);
      // composer.setSize bloom hedefini tam DPR boyutuna büyüttüğü için yarı ölçeğe geri çekilir
      const scaledW_px = Math.max(1, Math.round(nextW_px * BLOOM_RESOLUTION_SCALE));
      const scaledH_px = Math.max(1, Math.round(nextH_px * BLOOM_RESOLUTION_SCALE));
      if (typeof bloomPass.setSize === 'function') {
        bloomPass.setSize(scaledW_px, scaledH_px);
      } else if (bloomPass.resolution && typeof bloomPass.resolution.set === 'function') {
        bloomPass.resolution.set(scaledW_px, scaledH_px);
      }
    },
    destroyRenderPipeline() {
      bloomPass.dispose();
      composer.dispose();
      renderTarget.dispose();
    },
  };
}

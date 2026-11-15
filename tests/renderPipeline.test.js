import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderPipeline } from '../src/three/renderPipeline.js';

function createPipelineMocks(counters) {
  const renderer = {
    getPixelRatio: () => 2,
    render() { counters.directRender += 1; },
  };
  class MockPass {
    dispose() { counters.passDispose += 1; }
  }
  return {
    renderer,
    deps: {
      THREE: {
        Vector2: class { constructor(x, y) { this.x = x; this.y = y; } },
        WebGLRenderTarget: class {
          constructor(w, h, opts) { counters.targetSize = [w, h, opts.samples]; }
          dispose() { counters.targetDispose += 1; }
        },
        HalfFloatType: 1016,
      },
      EffectComposer: class {
        constructor() { this.passes = []; }
        addPass(pass) { this.passes.push(pass); counters.passes += 1; }
        render() { counters.composerRender += 1; }
        setSize(w, h) { counters.lastSize = [w, h]; }
        dispose() { counters.composerDispose += 1; }
      },
      RenderPass: MockPass,
      UnrealBloomPass: MockPass,
      OutputPass: MockPass,
    },
  };
}

function createZeroPipelineCounters() {
  return { directRender: 0, composerRender: 0, composerDispose: 0, passDispose: 0, targetDispose: 0, passes: 0 };
}

test('Bloom hatti: sahne + bloom + cikis gecisi kurulur, MSAA hedef piksel oranina gore boyutlanir', () => {
  const counters = createZeroPipelineCounters();
  const { deps, renderer } = createPipelineMocks(counters);
  const pipeline = createRenderPipeline(deps, renderer, {}, {}, 800, 600);

  assert.equal(counters.passes, 3);
  assert.deepEqual(counters.targetSize, [1600, 1200, 4]);
  pipeline.handleRenderFrame();
  assert.equal(counters.composerRender, 1);
  assert.equal(counters.directRender, 0);
  pipeline.handleRenderResize(1024, 768);
  assert.deepEqual(counters.lastSize, [1024, 768]);
});

test('Bloom hatti 10 kez ac-kapa: composer, bloom ve hedef her seferinde temizlenir', () => {
  const counters = createZeroPipelineCounters();
  for (let i = 0; i < 10; i += 1) {
    const { deps, renderer } = createPipelineMocks(counters);
    createRenderPipeline(deps, renderer, {}, {}, 800, 600).destroyRenderPipeline();
  }
  assert.equal(counters.composerDispose, 10);
  assert.equal(counters.passDispose, 10);
  assert.equal(counters.targetDispose, 10);
});

test('Eklentiler yoksa dogrudan renderer.render kullanilir, hata firlatmaz', () => {
  const counters = createZeroPipelineCounters();
  const { renderer } = createPipelineMocks(counters);
  const pipeline = createRenderPipeline({ THREE: {} }, renderer, {}, {}, 800, 600);
  assert.doesNotThrow(() => {
    pipeline.handleRenderFrame();
    pipeline.handleRenderResize(10, 10);
    pipeline.destroyRenderPipeline();
  });
  assert.equal(counters.directRender, 1);
});

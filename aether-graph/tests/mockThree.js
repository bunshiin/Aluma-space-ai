// Testlerde gerçek WebGL yerine kullanılan sahte Three.js bağımlılıkları; dispose sayaçlarını tutar.

export function createMockThreeDeps(counters) {
  class MockVector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v) {
      return this.set(v.x, v.y, v.z);
    }
    lerp(v, t) {
      return this.set(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t, this.z + (v.z - this.z) * t);
    }
    multiplyScalar(s) {
      return this.set(this.x * s, this.y * s, this.z * s);
    }
    add(v) {
      return this.set(this.x + v.x, this.y + v.y, this.z + v.z);
    }
    sub(v) {
      return this.set(this.x - v.x, this.y - v.y, this.z - v.z);
    }
    clone() {
      return new MockVector3(this.x, this.y, this.z);
    }
    length() {
      return Math.hypot(this.x, this.y, this.z);
    }
    normalize() {
      return this.multiplyScalar(1 / (this.length() || 1));
    }
    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    crossVectors(a, b) {
      return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    }
    // Ekran izdüşümü mock kamerada anlamsız; etiket testleri sadece çağrının hata vermemesine bakar
    project() {
      return this.set(0, 0, 0);
    }
    // Mock nesneler dönmediği için kuaterniyon ve matris uygulaması birim dönüşümdür
    applyQuaternion() {
      return this;
    }
    applyMatrix4() {
      return this;
    }
  }

  class MockQuaternion {
    constructor() {
      this.axis = null;
      this.angle_rad = 0;
    }
    clone() {
      return new MockQuaternion();
    }
    copy(q) {
      this.axis = q.axis;
      this.angle_rad = q.angle_rad;
      return this;
    }
    setFromAxisAngle(axis, angle_rad) {
      this.axis = axis;
      this.angle_rad = angle_rad;
      return this;
    }
    setFromEuler() { return this; }
    setFromUnitVectors() { return this; }
    multiply() { return this; }
    premultiply() { return this; }
    invert() { return this; }
    identity() { return this; }
  }

  class MockMatrix4 {
    copy() { return this; }
    invert() { return this; }
    multiply() { return this; }
    multiplyMatrices() { return this; }
    makeTranslation() { return this; }
    compose() { return this; }
  }

  class MockObject3D {
    constructor() {
      this.name = '';
      this.children = [];
      this.parent = null;
      this.position = new MockVector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = new MockVector3(1, 1, 1);
      this.quaternion = new MockQuaternion();
      this.visible = true;
    }
    add(...children) {
      children.forEach((child) => {
        if (!child) return;
        if (child.parent) child.parent.remove(child);
        child.parent = this;
        this.children.push(child);
      });
      return this;
    }
    remove(child) {
      this.children = this.children.filter((c) => c !== child);
      if (child && child.parent === this) child.parent = null;
    }
    clone() {
      const cloned = new this.constructor();
      cloned.name = this.name;
      cloned.visible = this.visible;
      cloned.position.copy(this.position);
      cloned.rotation = { ...this.rotation };
      cloned.scale.copy(this.scale);
      if (this.isMesh) cloned.isMesh = true;
      if (this.geometry) cloned.geometry = this.geometry;
      if (this.material) cloned.material = this.material;
      this.children.forEach((child) => cloned.add(child.clone()));
      return cloned;
    }
    clear() {
      [...this.children].forEach((c) => this.remove(c));
    }
    updateMatrixWorld() {}
    updateWorldMatrix() {}
    lookAt() {}
    getObjectByName(name) {
      if (this.name === name) return this;
      for (const child of this.children) {
        const found = child.getObjectByName(name);
        if (found) return found;
      }
      return null;
    }
    getWorldPosition(target) {
      return target.copy(this.position);
    }
    getWorldQuaternion(target) {
      return target.identity();
    }
    localToWorld(v) {
      return v.add(this.position);
    }
    worldToLocal(v) {
      return v.sub(this.position);
    }
    traverse(cb) {
      cb(this);
      this.children.forEach((c) => c.traverse(cb));
    }
  }

  class MockGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
    }
    dispose() { counters.geometryDispose += 1; }
    setFromPoints() { return this; }
    setAttribute(name, attribute) {
      this.attributes[name] = attribute;
      return this;
    }
    setIndex(indices) {
      this.index = indices;
      return this;
    }
  }

  class MockBufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.needsUpdate = false;
    }
  }

  class MockTexture {
    constructor() {
      this.isTexture = true;
      this.repeat = new MockVector3();
    }
    dispose() { counters.textureDispose += 1; }
  }

  class MockMaterial {
    constructor(params = {}) {
      this.map = { dispose() { counters.textureDispose += 1; } };
      Object.assign(this, params);
    }
    dispose() { counters.materialDispose += 1; }
  }

  class MockMesh extends MockObject3D {
    constructor(geometry = new MockGeometry(), material = new MockMaterial()) {
      super();
      this.isMesh = true;
      this.geometry = geometry;
      this.material = material;
    }
  }

  class MockInstancedMesh extends MockMesh {
    constructor(geometry, material) {
      super(geometry, material);
      this.isInstancedMesh = true;
    }
    setMatrixAt() {}
    dispose() { counters.instancedDispose += 1; }
  }

  class MockDirectionalLight extends MockObject3D {
    constructor() {
      super();
      this.target = new MockObject3D();
      this.shadow = {
        mapSize: new MockVector3(),
        camera: {},
        dispose() { counters.shadowDispose += 1; },
      };
    }
  }

  class MockBox3 {
    setFromObject() { return this; }
    getSize(v) { return v.set(2, 2, 2); }
    getCenter(v) { return v.set(0, 0, 0); }
  }

  class MockColor {
    constructor(r = 1, g = 1, b = 1) {
      this.r = r;
      this.g = g;
      this.b = b;
    }
    setRGB(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
      return this;
    }
  }

  const THREE = {
    Scene: class extends MockObject3D {},
    Group: class extends MockObject3D {},
    Color: MockColor,
    PerspectiveCamera: class extends MockObject3D {
      constructor(fov = 45, aspect = 1, near = 0.1, far = 2000) {
        super();
        Object.assign(this, { fov, aspect, near, far });
      }
      updateProjectionMatrix() {}
      lookAt() {}
    },
    WebGLRenderer: class {
      constructor() {
        this.domElement = { parentNode: null };
        this.shadowMap = { enabled: false, type: 0 };
      }
      setSize() {}
      setPixelRatio() {}
      render() {}
      dispose() {
        counters.rendererDispose += 1;
      }
    },
    AmbientLight: class extends MockObject3D {},
    HemisphereLight: class extends MockObject3D {},
    DirectionalLight: MockDirectionalLight,
    PointLight: class extends MockObject3D {},
    Fog: class {
      constructor(color, near, far) {
        Object.assign(this, { color, near, far });
      }
    },
    Euler: class {
      set() { return this; }
    },
    Quaternion: MockQuaternion,
    Matrix4: MockMatrix4,
    DataTexture: MockTexture,
    SphereGeometry: MockGeometry,
    BufferGeometry: MockGeometry,
    PlaneGeometry: MockGeometry,
    RingGeometry: MockGeometry,
    DodecahedronGeometry: MockGeometry,
    OctahedronGeometry: MockGeometry,
    CylinderGeometry: MockGeometry,
    BoxGeometry: MockGeometry,
    ConeGeometry: MockGeometry,
    BufferAttribute: MockBufferAttribute,
    MeshBasicMaterial: MockMaterial,
    MeshStandardMaterial: MockMaterial,
    LineBasicMaterial: MockMaterial,
    PointsMaterial: MockMaterial,
    SpriteMaterial: MockMaterial,
    ShaderMaterial: MockMaterial,
    Mesh: MockMesh,
    Sprite: class extends MockMesh {
      constructor(material = new MockMaterial()) {
        super(new MockGeometry(), material);
        this.isSprite = true;
      }
    },
    InstancedMesh: MockInstancedMesh,
    Points: MockMesh,
    LineLoop: MockMesh,
    Line: MockMesh,
    Vector3: MockVector3,
    Box3: MockBox3,
    DoubleSide: 2,
    BackSide: 1,
    AdditiveBlending: 2,
    RepeatWrapping: 1000,
    LinearFilter: 1006,
    LinearMipmapLinearFilter: 1008,
    RGBAFormat: 1023,
    PCFSoftShadowMap: 2,
    SRGBColorSpace: 'srgb',
    ACESFilmicToneMapping: 4,
    PropertyBinding: {
      sanitizeNodeName(name) {
        return name.replace(/\./g, '');
      },
    },
  };

  // Rover testleri counters.createRoverModel verirse perseverance.glb isteği o modeli döner
  class MockGLTFLoader {
    setDRACOLoader() {}
    async loadAsync(url) {
      if (String(url).endsWith('perseverance.glb') && typeof counters.createRoverModel === 'function') {
        return { scene: counters.createRoverModel(THREE) };
      }
      return { scene: new MockMesh() };
    }
  }

  class MockDRACOLoader {
    setDecoderPath() {}
    dispose() {
      counters.dracoDispose += 1;
    }
  }

  class MockOrbitControls {
    constructor() {
      this.target = new MockVector3();
      this.enabled = true;
      this.maxDistance = Infinity;
    }
    getDistance() {
      return 0;
    }
    update() {}
    dispose() {
      counters.controlsDispose += 1;
    }
  }

  let nextRafId = 1;
  return {
    THREE,
    GLTFLoader: MockGLTFLoader,
    DRACOLoader: MockDRACOLoader,
    OrbitControls: MockOrbitControls,
    requestAnimationFrame: () => nextRafId++,
    cancelAnimationFrame: () => {
      counters.cancelAnimationFrame += 1;
    },
  };
}

export function createZeroCounters() {
  return {
    rendererDispose: 0,
    cancelAnimationFrame: 0,
    controlsDispose: 0,
    dracoDispose: 0,
    geometryDispose: 0,
    materialDispose: 0,
    textureDispose: 0,
    instancedDispose: 0,
    shadowDispose: 0,
  };
}

// Perseverance node ağacının rig'in aradığı kısmı (sanitize edilmiş isimlerle, glTF'teki gibi iç içe)
export function createMockRover(THREE, wheelGeometrySpy) {
  const named = (name, Ctor = THREE.Group) => {
    const node = new Ctor();
    node.name = name;
    return node;
  };
  const root = named('Scene');
  const wheels = named('Wheels_objs');
  const wheelMesh = new THREE.Mesh();
  wheelMesh.geometry.attributes.position = { count: 0 };
  if (wheelGeometrySpy) wheelMesh.geometry.dispose = () => { wheelGeometrySpy.disposed += 1; };
  wheels.add(wheelMesh);
  const azimuth = named('arm003');
  const shoulder = named('arm002');
  const elbow = named('arm');
  const wrist = named('arm004');
  const turret = named('turret_obj');
  turret.add(named('corring_drill'));
  wrist.add(turret);
  elbow.add(wrist);
  shoulder.add(elbow);
  azimuth.add(shoulder);
  root.add(wheels, azimuth, named('head'), named('antenna_hg'));
  return root;
}

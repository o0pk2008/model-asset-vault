import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Same neutral studio HDR as the asset library's 3D preview, so metallic and reflective
// materials look the same in both. Falls back to a procedural room when it is unavailable
// (e.g. running MeshPilot on its own).
const ENVIRONMENT_URL = '/static/env/studio.hdr';

async function applyEnvironment(views) {
  let equirect = null;
  try {
    equirect = await new HDRLoader().loadAsync(ENVIRONMENT_URL);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
  } catch (error) {
    console.warn('Studio HDR unavailable, using a procedural environment.', error);
  }
  for (const view of views) view.setEnvironment(equirect);
  equirect?.dispose();
}

const direction = new THREE.Vector3(0.25, 0.48, 1).normalize();

export function createViews(...stages) {
  const views = [];
  try {
    for (const stage of stages) views.push(createView(stage));
  } catch (error) {
    for (const view of views) view.dispose();
    throw error;
  }
  let syncing = false;
  for (const view of views) {
    view.controls.addEventListener('change', () => {
      if (syncing) return;
      syncing = true;
      for (const other of views) {
        if (other !== view) {
          other.camera.position.copy(view.camera.position);
          other.controls.target.copy(view.controls.target);
          other.controls.update();
        }
        other.draw();
      }
      syncing = false;
    });
  }

  function fit() {
    const aspect = Math.min(1, ...views.map((view) => view.camera.aspect));
    const halfAngle = Math.atan(Math.tan(THREE.MathUtils.degToRad(19)) * aspect);
    for (const view of views) {
      view.camera.position.copy(direction).multiplyScalar(1.02 / Math.sin(halfAngle));
      view.controls.target.set(0, 0, 0);
      view.controls.update();
      view.draw();
    }
  }
  fit();
  applyEnvironment(views);
  return { before: views[0], after: views[1], fit };
}

function createView(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.015, 180);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 0.15;
  controls.maxDistance = 24;
  const hemisphere = new THREE.HemisphereLight(0xe6f8ff, 0x89988d, 2.25);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xfff4dc, 2.9);
  key.position.set(-3, 6, 4);
  const rim = new THREE.DirectionalLight(0x8df9e8, 1.4);
  rim.position.set(4, 1.5, -4);
  scene.add(key, rim);

  const grid = new THREE.GridHelper(8, 28, 0x829f9e, 0x587278);
  grid.position.y = -0.94;
  grid.material.transparent = true;
  grid.material.opacity = 0.23;
  scene.add(grid);

  const frame = new THREE.Group();
  const compareFrame = new THREE.Group();
  scene.add(frame, compareFrame);
  let split = null; // 0..1: left of the line shows `frame`, right shows `compareFrame`
  let materials = new Map();
  const geometryMaterial = new THREE.MeshStandardMaterial({ color: 0xa5b7b2, roughness: 0.82, flatShading: true, side: THREE.DoubleSide });
  let geometryOnly = false;
  let wired = false;
  function draw() {
    if (split === null || !compareFrame.children.length) {
      compareFrame.visible = false;
      frame.visible = true;
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
      return;
    }
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const cut = Math.round(width * split);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, cut, height);
    frame.visible = true;
    compareFrame.visible = false;
    renderer.render(scene, camera);
    renderer.setScissor(cut, 0, width - cut, height);
    frame.visible = false;
    compareFrame.visible = true;
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    frame.visible = true;
  }

  function resize() {
    const { clientWidth, clientHeight } = stage;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    draw();
  }

  function addPreview(target, display) {
    const preview = display.clone();
      preview.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const cloneMaterial = (material) => {
          if (!materials.has(material)) {
            const copy = material.clone();
            copy.wireframe = wired;
            materials.set(material, copy);
          }
          return materials.get(material);
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
        mesh.userData.previewMaterial = mesh.material;
        if (geometryOnly) showGeometry(mesh);
      });
    target.add(preview);
  }

  // `compare` (optional) is drawn right of the split line, e.g. the same mesh with compressed textures.
  function setModel(display, model, compare = null) {
    frame.clear();
    compareFrame.clear();
    for (const material of materials.values()) material.dispose();
    materials = new Map();
    if (display) {
      addPreview(frame, display);
      if (compare) addPreview(compareFrame, compare);
      for (const group of [frame, compareFrame]) {
        group.scale.setScalar(1 / model.radius);
        group.position.copy(model.center).multiplyScalar(-1 / model.radius);
      }
      const bounds = new THREE.Box3().setFromObject(model.display);
      grid.position.y = (bounds.min.y - model.center.y) / model.radius - 0.12;
    }
    draw();
  }

  // Image-based lighting: reflections need an environment, otherwise metals render black.
  function setEnvironment(equirect) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = equirect ? pmrem.fromEquirectangular(equirect).texture : pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment?.dispose();
    scene.environment = environment;
    // The environment now provides most of the light; keep the lamps as soft fill and highlights.
    renderer.toneMappingExposure = 1;
    hemisphere.intensity = 0.55;
    key.intensity = 1.6;
    rim.intensity = 0.5;
    draw();
  }

  function setSplit(value) {
    split = value === null ? null : Math.min(1, Math.max(0, value));
    draw();
  }

  function setWireframe(value) {
    wired = value;
    for (const material of materials.values()) {
      material.wireframe = value;
      material.needsUpdate = true;
    }
    geometryMaterial.wireframe = value;
    geometryMaterial.needsUpdate = true;
    draw();
  }

  function showGeometry(mesh) {
    const material = mesh.userData.previewMaterial;
    mesh.material = Array.isArray(material) ? material.map(() => geometryMaterial) : geometryMaterial;
  }

  function setGeometryOnly(value) {
    geometryOnly = value;
    scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (value) showGeometry(mesh);
      else mesh.material = mesh.userData.previewMaterial;
    });
    draw();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  return { camera, controls, draw, setModel, setSplit, setEnvironment, setWireframe, setGeometryOnly, dispose() {
    observer.disconnect();
    controls.dispose();
    scene.environment?.dispose();
    geometryMaterial.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  } };
}

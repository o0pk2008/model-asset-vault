import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
  scene.add(new THREE.HemisphereLight(0xe6f8ff, 0x89988d, 2.25));
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
  scene.add(frame);
  let materials = new Map();
  const geometryMaterial = new THREE.MeshStandardMaterial({ color: 0xa5b7b2, roughness: 0.82, flatShading: true, side: THREE.DoubleSide });
  let geometryOnly = false;
  let wired = false;
  const draw = () => renderer.render(scene, camera);

  function resize() {
    const { clientWidth, clientHeight } = stage;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    draw();
  }

  function setModel(display, model) {
    frame.clear();
    for (const material of materials.values()) material.dispose();
    materials = new Map();
    if (display) {
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
      frame.scale.setScalar(1 / model.radius);
      frame.position.copy(model.center).multiplyScalar(-1 / model.radius);
      const bounds = new THREE.Box3().setFromObject(model.display);
      grid.position.y = (bounds.min.y - model.center.y) / model.radius - 0.12;
      frame.add(preview);
    }
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
    frame.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (value) showGeometry(mesh);
      else mesh.material = mesh.userData.previewMaterial;
    });
    draw();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  return { camera, controls, draw, setModel, setWireframe, setGeometryOnly, dispose() {
    observer.disconnect();
    controls.dispose();
    geometryMaterial.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  } };
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { rememberGLBImages } from './textures.js';

function matte(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.52, side: THREE.DoubleSide });
}

export function sampleModel() {
  const sample = new THREE.Mesh(new THREE.TorusKnotGeometry(1.0, 0.29, 280, 40), matte(0x78b9ac));
  sample.rotation.set(0.23, 0.21, -0.18);
  sample.name = 'Torus Knot';
  return sample;
}

export async function loadModel(file, format) {
  switch (format) {
    case 'glb': {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (/^(blob:|data:)/i.test(url)) return url;
        throw new Error('请选择纹理和缓冲区已嵌入的 GLB。');
      });
      const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
      await rememberGLBImages(gltf.parser);
      return gltf.scene;
    }
    case 'obj': {
      const root = new OBJLoader().parse(await file.text());
      root.traverse((object) => {
        if (!object.isMesh) return;
        object.material = matte(0x78b9ac);
        object.geometry = mergeVertices(object.geometry);
      });
      return root;
    }
    case 'stl': {
      const original = new STLLoader().parse(await file.arrayBuffer());
      original.deleteAttribute('normal');
      const geometry = mergeVertices(original);
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, matte(0x78b9ac));
    }
    default:
      throw new Error('请选择 GLB、OBJ 或 STL 文件。');
  }
}

export function disposeModel(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat()) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  const images = new Set([...textures].map((texture) => texture.source.data));
  for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
  for (const image of images) image?.close?.();
}

export function prepareModel(root, name) {
  const display = new THREE.Group();
  display.name = name;
  const parts = [];
  root.updateMatrixWorld(true);
  root.traverseVisible((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    if (object.isSkinnedMesh || object.isInstancedMesh || Object.keys(geometry.morphAttributes).length) {
      throw new Error('请选择没有骨骼蒙皮、形变目标或 GPU 实例的静态网格。');
    }
    const position = geometry.getAttribute('position');
    if (!position?.count) return;
    const positions = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      positions[i * 3] = position.getX(i);
      positions[i * 3 + 1] = position.getY(i);
      positions[i * 3 + 2] = position.getZ(i);
    }
    if (!positions.every(Number.isFinite)) throw new Error('模型包含无效的顶点坐标。');
    const indexCount = geometry.index?.count ?? position.count;
    const sourceGroups = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: indexCount, materialIndex: 0 }];
    const groups = sourceGroups.flatMap((group) => {
      const start = Math.max(group.start, geometry.drawRange.start);
      const end = Math.min(group.start + group.count, geometry.drawRange.start + geometry.drawRange.count, indexCount);
      if (end <= start) return [];
      if ((end - start) % 3 !== 0) throw new Error('模型包含无效的三角面索引。');
      const indices = new Uint32Array(end - start);
      for (let i = 0; i < indices.length; i++) {
        indices[i] = geometry.index ? geometry.index.getX(start + i) : start + i;
        if (indices[i] >= position.count) throw new Error('模型索引超出顶点范围。');
      }
      return [{ indices, materialIndex: group.materialIndex }];
    });
    if (!groups.length) return;
    display.add(copyMesh(object, geometry, object.matrixWorld));
    parts.push({ geometry, material: object.material, positions, groups });
  });
  if (!parts.length) throw new Error('文件中没有可简化的三角面。');
  const bounds = new THREE.Box3().setFromObject(display, true);
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 1e-6);
  const triangles = parts.reduce((total, part) => total + part.groups.reduce((sum, group) => sum + group.indices.length / 3, 0), 0);
  const vertices = parts.reduce((total, part) => total + part.positions.length / 3, 0);
  return { source: root, display, parts, center, radius, triangles, vertices, name };
}

export function getAppearanceAttributes({ geometry, material, positions }) {
  const materials = Array.isArray(material) ? material : [material];
  const uvChannels = new Set();
  for (const entry of materials) {
    for (const value of Object.values(entry)) {
      if (value?.isTexture && value !== entry.envMap) uvChannels.add(value.channel);
    }
  }

  const streams = [];
  const vertexCount = positions.length / 3;
  let stride = 0;
  const add = (name, weight) => {
    const attribute = geometry.getAttribute(name);
    if (attribute?.count !== vertexCount) return undefined;
    const offset = stride;
    streams.push({ attribute, weight });
    stride += attribute.itemSize;
    return offset;
  };
  const normalOffset = add('normal', 1);
  if (materials.some((entry) => entry.normalMap || entry.clearcoatNormalMap || entry.anisotropy > 0)) add('tangent', 0.5);
  if (materials.some((entry) => entry.vertexColors)) add('color', 1);
  const uvOffsets = [...uvChannels].map((channel) => add(channel === 0 ? 'uv' : `uv${channel}`, 12)).filter((offset) => offset !== undefined);

  if (!streams.length) return undefined;
  const weights = streams.flatMap(({ attribute, weight }) => Array(attribute.itemSize).fill(weight));
  const values = new Float32Array(vertexCount * weights.length);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    let offset = vertex * weights.length;
    for (const { attribute } of streams) {
      for (let component = 0; component < attribute.itemSize; component++) {
        values[offset++] = attribute.getComponent(vertex, component);
      }
    }
  }
  if (!values.every(Number.isFinite)) throw new Error('模型的法线、纹理坐标或顶点颜色包含无效数据。');
  return { values, weights, normalOffset, uvOffsets };
}

function copyMesh(source, geometry, matrix) {
  const mesh = new THREE.Mesh(geometry, source.material);
  mesh.name = source.name;
  mesh.matrix.copy(matrix);
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldNeedsUpdate = true;
  return mesh;
}

export function makeResult(model, results) {
  const display = new THREE.Group();
  display.name = `${model.name} simplified`;
  for (const [partIndex, result] of results.entries()) {
    const source = model.display.children[partIndex];
    const geometry = new THREE.BufferGeometry();
    const Index = result.vertexCount > 65535 ? Uint32Array : Uint16Array;
    geometry.setIndex(new THREE.BufferAttribute(new Index(result.indices), 1));
    for (const group of result.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    for (const [key, attribute] of Object.entries(source.geometry.attributes)) {
      const array = new attribute.array.constructor(result.vertexCount * attribute.itemSize);
      const stride = attribute.isInterleavedBufferAttribute ? attribute.data.stride : attribute.itemSize;
      const offset = attribute.isInterleavedBufferAttribute ? attribute.offset : 0;
      result.remap.forEach((destination, original) => {
        if (destination >= result.vertexCount) return;
        for (let component = 0; component < attribute.itemSize; component++) {
          array[destination * attribute.itemSize + component] = attribute.array[original * stride + offset + component];
        }
      });
      const compact = new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
      compact.name = attribute.name;
      if (attribute.gpuType !== undefined) compact.gpuType = attribute.gpuType;
      geometry.setAttribute(key, compact);
    }
    display.add(copyMesh(source, geometry, source.matrix));
  }
  return display;
}

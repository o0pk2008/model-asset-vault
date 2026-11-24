import { Source } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const encodedImages = new WeakMap();
const colorMaps = new Set(['map', 'emissiveMap', 'specularColorMap', 'sheenColorMap']);
const mapLabels = {
  map: '基础颜色', normalMap: '法线', roughnessMap: '粗糙度', metalnessMap: '金属度',
  aoMap: '环境光遮蔽', emissiveMap: '自发光', alphaMap: '透明度',
};
const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function rememberGLBImages(parser) {
  // The loader cache identifies the actual image selected, including extension fallbacks.
  await Promise.allSettled(Object.entries(parser.sourceCache).map(async ([index, pending]) => {
    const texture = await pending;
    const definition = parser.json.images[index];
    const { mimeType } = texture.userData;
    if (!supportedTypes.has(mimeType) || !texture.image) return;
    const blob = definition.bufferView !== undefined
      ? new Blob([await parser.getDependency('bufferView', definition.bufferView)], { type: mimeType })
      : definition.uri?.startsWith('data:') ? await fetch(definition.uri).then((response) => response.blob()) : null;
    if (blob?.type === mimeType) encodedImages.set(texture.image, blob);
  }));
}

export function textureEntries(root) {
  const entries = new Map();
  const materials = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of [node.material].flat()) materials.add(material);
  });
  for (const material of materials) {
    for (const [slot, texture] of Object.entries(material)) {
      const image = texture?.image;
      if (slot === 'envMap' || !texture?.isTexture || texture.isDataTexture || texture.isCompressedTexture || !image?.width || !image.height) continue;
      if (!entries.has(image)) {
        entries.set(image, { image, original: encodedImages.get(image), slots: new Set(), colorOnly: true });
      }
      const entry = entries.get(image);
      entry.slots.add(slot);
      entry.colorOnly &&= colorMaps.has(slot);
    }
  }
  return [...entries.values()].map(({ slots, ...entry }) => ({
    ...entry,
    label: [...slots].map((slot) => mapLabels[slot] ?? slot).join(' / '),
  }));
}

function encode(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('浏览器无法编码这张贴图。'));
    }, type, quality);
  });
}

function isOpaque(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 255) return false;
  }
  return true;
}

async function compressImage(entry, limit, quality) {
  const { image, original, colorOnly } = entry;
  const scale = Math.min(1, limit / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  if (scale === 1 && !colorOnly && original) return { ...entry, bitmap: image, blob: original };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: colorOnly });
    if (!context) throw new Error('浏览器无法创建贴图预览。');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const type = colorOnly && isOpaque(context, width, height) ? 'image/jpeg' : 'image/png';
    const blob = await encode(canvas, type, quality);
    if (scale === 1 && original && original.size <= blob.size) return { ...entry, bitmap: image, blob: original };
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    encodedImages.set(bitmap, blob);
    return { ...entry, bitmap, blob };
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function compressTextures(entries, limit, quality) {
  const images = new Map();
  const textures = new Map();
  const materials = new Map();

  function dispose() {
    for (const texture of textures.values()) texture.dispose();
    for (const material of materials.values()) material.dispose();
    for (const { image, bitmap } of images.values()) {
      if (bitmap !== image) bitmap.close();
    }
  }

  try {
    for (const entry of entries) images.set(entry.image, await compressImage(entry, limit, quality));
  } catch (error) {
    dispose();
    throw error;
  }

  function replaceMaterial(material) {
    if (!materials.has(material)) {
      const copy = material.clone();
      for (const [slot, texture] of Object.entries(material)) {
        if (!texture?.isTexture) continue;
        const replacement = images.get(texture.image);
        if (slot === 'envMap' || !replacement || replacement.bitmap === replacement.image) continue;
        if (!textures.has(texture)) {
          const compressed = texture.clone();
          compressed.source = new Source(replacement.bitmap);
          compressed.userData.mimeType = replacement.blob.type;
          compressed.needsUpdate = true;
          textures.set(texture, compressed);
        }
        copy[slot] = textures.get(texture);
      }
      materials.set(material, copy);
    }
    return materials.get(material);
  }

  function apply(result) {
    const copy = result.clone();
    copy.traverse((node) => {
      if (!node.isMesh) return;
      node.material = Array.isArray(node.material) ? node.material.map(replaceMaterial) : replaceMaterial(node.material);
    });
    return copy;
  }

  return { images: [...images.values()], apply, dispose };
}

export function exportGLB(display) {
  // Three's writer handles material extensions and the GLB container. Feed it the same
  // image bytes used by the preview instead of letting it encode the bitmaps again.
  const exporter = new GLTFExporter().register((writer) => ({
    beforeParse() {
      const encodeImage = writer.processImage.bind(writer);
      const embedded = new WeakMap();
      writer.processImage = (image, format, flipY, mimeType = 'image/png') => {
        const blob = encodedImages.get(image);
        if (flipY || blob?.type !== mimeType) return encodeImage(image, format, flipY, mimeType);
        if (embedded.has(image)) return embedded.get(image);
        writer.json.images ??= [];
        const definition = { mimeType };
        const index = writer.json.images.push(definition) - 1;
        embedded.set(image, index);
        writer.pending.push(writer.processBufferViewImage(blob).then((view) => {
          definition.bufferView = view;
          writer.json.bufferViews[view].byteLength = blob.size;
        }));
        return index;
      };
    },
  }));
  return exporter.parseAsync(display, { binary: true });
}

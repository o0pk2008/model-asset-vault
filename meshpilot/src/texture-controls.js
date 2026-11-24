import { compressTextures, textureEntries } from './textures.js';

function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function setupTextureControls({ isBusy, setBusy, onChange, onApplied }) {
  const ids = ['status', 'size', 'quality', 'quality-value', 'preview', 'compare', 'details', 'map', 'original', 'compressed', 'original-info', 'compressed-info'];
  const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(`texture-${id}`)]));
  let entries = [];
  let applied;
  let compare = false;
  let urls = [];
  const selectedSize = () => Number(ui.size.value);

  function refresh() {
    const busy = isBusy();
    ui.size.disabled = busy || !entries.length;
    ui.quality.disabled = busy || !selectedSize() || !entries.some((entry) => entry.colorOnly);
    ui.preview.disabled = busy || !entries.length || !selectedSize() || Boolean(applied);
    ui.compare.disabled = busy || !applied;
    ui.compare.setAttribute('aria-pressed', compare);
  }

  function showDetails() {
    ui.original.removeAttribute('src');
    ui.compressed.removeAttribute('src');
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
    if (!ui.details.open || !applied) return;
    const entry = applied.images[Number(ui.map.value)];
    if (!entry) return;
    for (const [side, label, image, blob] of [
      ['original', '原始', entry.image, entry.original],
      ['compressed', '应用后', entry.bitmap, entry.blob],
    ]) {
      ui[`${side}-info`].textContent = `${label} ${image.width} × ${image.height}${blob ? ` · ${formatBytes(blob.size)}` : ''}`;
      if (blob) {
        const url = URL.createObjectURL(blob);
        urls.push(url);
        ui[side].src = url;
      }
    }
  }

  function clearApplied() {
    const previous = applied;
    applied = undefined;
    compare = false;
    ui.details.open = false;
    ui.details.hidden = true;
    ui.map.replaceChildren();
    showDetails();
    return previous;
  }

  function showSelectionStatus() {
    ui.status.textContent = !entries.length ? '导入带贴图的 GLB 后可用。'
      : selectedSize() ? '正在应用所选贴图尺寸…'
        : `已载入 ${entries.length} 张贴图，导出时保留可直接封装的原图。`;
  }

  function setModel(display) {
    entries = textureEntries(display);
    ui.size.value = '0';
    clearApplied()?.dispose();
    showSelectionStatus();
    refresh();
  }

  function selectionChanged() {
    const previous = clearApplied();
    showSelectionStatus();
    onChange();
    previous?.dispose();
    // Choosing a size applies it right away; the result window then shows a before/after split.
    if (selectedSize() && entries.length) applyTextures();
  }

  ui.size.addEventListener('change', selectionChanged);
  ui.quality.addEventListener('input', () => { ui['quality-value'].value = `${ui.quality.value}%`; });
  ui.quality.addEventListener('change', selectionChanged);
  ui.map.addEventListener('change', showDetails);
  ui.details.addEventListener('toggle', showDetails);
  ui.compare.addEventListener('click', () => {
    compare = !compare;
    onChange();
  });

  async function applyTextures() {
    if (isBusy() || !selectedSize() || !entries.length || applied) return;
    setBusy(true);
    ui.status.textContent = '正在调整尺寸并压缩贴图…';
    try {
      applied = await compressTextures(entries, selectedSize(), Number(ui.quality.value) / 100);
      compare = true;
      ui.details.hidden = false;
      applied.images.forEach(({ label }, index) => ui.map.add(new Option(label, index)));
      const before = entries.every(({ original }) => original) ? entries.reduce((sum, { original }) => sum + original.size, 0) : 0;
      const after = applied.images.reduce((sum, { blob }) => sum + blob.size, 0);
      ui.status.textContent = `${before ? `${formatBytes(before)} → ` : ''}${formatBytes(after)} · 已用于导出`;
      onApplied();
    } catch (error) {
      const previous = clearApplied();
      ui.status.textContent = `贴图压缩失败。${error.message}`;
      onChange();
      previous?.dispose();
    } finally {
      setBusy(false);
    }
  }

  ui.preview.addEventListener('click', applyTextures);

  return {
    setModel,
    refresh,
    canExport: () => !selectedSize() || Boolean(applied),
    hasApplied: () => Boolean(applied),
    comparing: () => compare,
    display: (result) => applied && result ? applied.apply(result) : result,
  };
}

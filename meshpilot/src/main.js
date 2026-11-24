import { createViews } from './view.js';
import { disposeModel, getAppearanceAttributes, loadModel, makeResult, prepareModel, sampleModel } from './model.js';
import { exportGLB } from './textures.js';
import { setupTextureControls } from './texture-controls.js';
import { embedded, setupEmbed } from './embed.js';
import './style.css';

const ids = [
  'sample', 'model-name', 'model-kind', 'wire', 'geometry', 'fit',
  'before', 'after', 'before-count', 'after-count', 'before-vertices', 'after-vertices', 'before-label', 'after-label',
  'drop', 'file', 'ratio', 'ratio-value', 'error', 'error-value', 'appearance', 'surface', 'border', 'run',
  'reduction', 'error-label', 'actual-error', 'elapsed', 'export', 'status',
];
const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const number = new Intl.NumberFormat('zh-CN');
const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
let views;
let model;
let result;
let resultCounts;
let busy = false;
let worker;
const resultListeners = [];
const modeUi = {
  ratioButton: document.getElementById('mode-ratio'),
  countButton: document.getElementById('mode-count'),
  ratioGroup: document.getElementById('ratio-group'),
  countGroup: document.getElementById('count-group'),
  count: document.getElementById('target-count'),
  countRatio: document.getElementById('count-ratio'),
  countHelp: document.getElementById('count-help'),
};
let reduceMode = 'ratio'; // 'ratio' | 'count'
const splitUi = { box: document.getElementById('texture-split'), line: document.getElementById('texture-split-line') };
let splitValue = 0.5;
const busyListeners = [];
const texturePanel = setupTextureControls({
  isBusy: () => busy,
  setBusy,
  onChange: renderResult,
  onApplied() {
    if (ui.geometry.getAttribute('aria-pressed') === 'true') ui.geometry.click();
    renderResult();
  },
});

try {
  views = createViews(ui.before, ui.after);
} catch (error) {
  console.error(error);
  for (const stage of [ui.before, ui.after]) {
    const message = document.createElement('p');
    message.className = 'stage-unavailable';
    message.textContent = '浏览器无法启用 WebGL 2';
    stage.append(message);
  }
  ui.wire.disabled = ui.geometry.disabled = ui.fit.disabled = true;
}

function status(message, isError = false) {
  ui.status.textContent = message;
  ui.status.dataset.error = isError;
}

function setBusy(value) {
  busy = value;
  busyListeners.forEach((listener) => listener(value));
  ui.sample.disabled = ui.file.disabled = value;
  ui.run.disabled = value || !model;
  ui.export.disabled = value || !result || !texturePanel.canExport();
  texturePanel.refresh();
}

function showCounts(side, triangles, vertices) {
  ui[`${side}-count`].textContent = triangles === undefined ? '—' : number.format(triangles);
  ui[`${side}-vertices`].textContent = vertices === undefined ? '' : `${number.format(vertices)} 顶点`;
}

function clearResult() {
  views?.after.setModel(null);
  views?.after.setSplit(null);
  splitUi.box.hidden = true;
  if (model) views?.before.setModel(model.display, model);
  result?.children.forEach((mesh) => mesh.geometry.dispose());
  result = undefined;
  resultCounts = undefined;
  showCounts('after');
  ui['error-label'].textContent = '实际误差';
  ui.reduction.textContent = ui['actual-error'].textContent = ui.elapsed.textContent = '—';
}

function renderResult() {
  // Texture comparison happens inside the result window (split line), never in the original-mesh window.
  const compare = Boolean(result && texturePanel.hasApplied() && texturePanel.comparing());
  if (model) views?.before.setModel(model.display, model);
  views?.after.setModel(compare ? result : texturePanel.display(result), model, compare ? texturePanel.display(result) : null);
  views?.after.setSplit(compare ? splitValue : null);
  splitUi.box.hidden = !compare;
  splitUi.line.style.left = `${splitValue * 100}%`;
  ui['before-label'].textContent = '原始网格';
  ui['after-label'].textContent = compare ? '简化结果 · 贴图对比' : texturePanel.hasApplied() ? '简化结果 · 压缩贴图' : '简化结果';
  const left = model;
  showCounts('before', left?.triangles, left?.vertices);
  showCounts('after', resultCounts?.triangles, resultCounts?.vertices);
  setBusy(busy);
}

function setModel(source, name, kind) {
  let next;
  try {
    next = prepareModel(source, name);
  } catch (error) {
    disposeModel(source);
    throw error;
  }
  clearResult();
  const previous = model;
  model = next;
  texturePanel.setModel(next.display);
  renderResult();
  if (previous) disposeModel(previous.source);
  ui['model-name'].textContent = name;
  ui['model-name'].title = name;
  modeUi.count.max = model.triangles;
  modeUi.count.value = Math.max(1, Math.round(model.triangles * Number(ui.ratio.value) / 100));
  updateCountInfo();
  ui['model-kind'].textContent = kind;
  views?.fit();
}

function simplifyInWorker(options) {
  return new Promise((resolve, reject) => {
    worker ??= new Worker(new URL('./simplify.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
    worker.onerror = () => {
      worker.terminate();
      worker = undefined;
      reject(new Error('无法启动简化线程，请刷新页面后重试。'));
    };
    const transfer = options.parts.flatMap(({ appearance }) => appearance ? [appearance.values.buffer] : []);
    worker.postMessage(options, transfer);
  });
}

async function run() {
  if (!model || busy) return;
  setBusy(true);
  const ratio = currentRatio();
  if (!ratio) {
    status('请输入有效的目标面数。', true);
    setBusy(false);
    return;
  }
  const protectAppearance = ui.appearance.checked && ratio < 1;
  status('正在简化网格…');
  try {
    const parts = model.parts.map((part) => ({
      positions: part.positions,
      groups: part.groups,
      appearance: protectAppearance ? getAppearanceAttributes(part) : undefined,
    }));
    const hasAppearanceAttributes = parts.some(({ appearance }) => appearance);
    const data = await simplifyInWorker({
      ratio,
      error: Number(ui.error.value) / 100,
      lockBorder: ui.border.checked,
      protectSurface: ui.surface.checked,
      parts,
    });
    const next = makeResult(model, data.results);
    clearResult();
    result = next;
    resultCounts = { triangles: data.triangles, vertices: data.vertices };
    renderResult();
    ui.reduction.textContent = formatPercent(1 - data.triangles / model.triangles);
    ui['error-label'].textContent = hasAppearanceAttributes ? '实际综合误差' : '实际相对几何误差';
    ui['actual-error'].textContent = `${(data.maxError * 100).toFixed(3)}%`;
    ui.elapsed.textContent = `${data.elapsed.toFixed(1)} ms`;
    resultListeners.forEach((listener) => listener(counts()));
    const actual = data.triangles / model.triangles;
    const targetMessage = data.triangles > Math.max(1, Math.floor(model.triangles * ratio))
      ? '已受误差上限、网格结构或保护设置限制。'
      : '可切换线框检查拓扑，或下载简化结果。';
    const message = data.surfaceRisks ? `仍有 ${number.format(data.surfaceRisks)} 个三角面存在表面风险，可降低误差上限后重试。` : targetMessage;
    status(`简化完成，实际保留 ${formatPercent(actual)}。${message}`, data.surfaceRisks > 0);
  } catch (error) {
    console.error(error);
    status(`简化失败。${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function importFile(file) {
  if (busy || !file) return;
  const format = file.name.split('.').pop().toLowerCase();
  setBusy(true);
  status(`正在读取 ${file.name}…`);
  try {
    const source = await loadModel(file, format);
    setModel(source, file.name, format.toUpperCase());
  } catch (error) {
    console.error(error);
    status(`导入失败。${error.message}`, true);
    return false;
  } finally {
    setBusy(false);
  }
  await run();
  return true;
}

function counts() {
  return {
    before: model?.triangles ?? 0,
    after: resultCounts?.triangles ?? 0,
    verticesBefore: model?.vertices ?? 0,
    verticesAfter: resultCounts?.vertices ?? 0,
    ratio: Number(ui.ratio.value),
  };
}

function currentRatio() {
  if (reduceMode === 'ratio') return Number(ui.ratio.value) / 100;
  const target = Math.floor(Number(modeUi.count.value));
  if (!model || !Number.isFinite(target) || target < 1) return 0;
  return Math.min(1, target / model.triangles);
}

function updateCountInfo() {
  if (!model) {
    modeUi.countRatio.value = '—';
    return;
  }
  const ratio = currentRatio();
  modeUi.countRatio.value = ratio ? formatPercent(ratio) : '—';
  modeUi.countHelp.textContent = `当前模型 ${number.format(model.triangles)} 个三角面`;
}

function setMode(mode) {
  reduceMode = mode === 'count' ? 'count' : 'ratio';
  modeUi.ratioButton.setAttribute('aria-pressed', reduceMode === 'ratio');
  modeUi.countButton.setAttribute('aria-pressed', reduceMode === 'count');
  modeUi.ratioGroup.hidden = reduceMode !== 'ratio';
  modeUi.countGroup.hidden = reduceMode !== 'count';
  if (reduceMode === 'count' && model) {
    modeUi.count.value = Math.max(1, Math.round(model.triangles * Number(ui.ratio.value) / 100));
  }
  updateCountInfo();
}

function setRatio(percent, rerun, errorPercent) {
  setMode('ratio');
  const value = Math.min(100, Math.max(1, Math.round(Number(percent) || 50)));
  ui.ratio.value = value;
  ui['ratio-value'].value = `${value}%`;
  if (errorPercent !== undefined && errorPercent !== null) {
    ui.error.value = Math.min(20, Math.max(0, Number(errorPercent)));
    ui['error-value'].value = formatPercent(Number(ui.error.value) / 100);
  }
  if (rerun && model) return run();
}

async function buildGLB() {
  if (!result) throw new Error('请先运行简化。');
  if (!texturePanel.canExport()) throw new Error('请先点击「预览并应用」贴图，或把最长边改回「原始贴图」。');
  setBusy(true);
  status('正在生成 GLB…');
  try {
    const binary = await exportGLB(texturePanel.display(result));
    status(`已生成 GLB（${(binary.byteLength / 1_000_000).toFixed(2)} MB）。`);
    return binary;
  } finally {
    setBusy(false);
  }
}

function showSample() {
  if (busy) return;
  setModel(sampleModel(), '扭结环', '内置示例');
  return run();
}

ui.sample.addEventListener('click', showSample);
ui.run.addEventListener('click', run);
ui.fit.addEventListener('click', () => views?.fit());
ui.wire.addEventListener('click', () => {
  const value = ui.wire.getAttribute('aria-pressed') !== 'true';
  ui.wire.setAttribute('aria-pressed', value);
  views?.before.setWireframe(value);
  views?.after.setWireframe(value);
});
ui.geometry.addEventListener('click', () => {
  const value = ui.geometry.getAttribute('aria-pressed') !== 'true';
  ui.geometry.setAttribute('aria-pressed', value);
  views?.before.setGeometryOnly(value);
  views?.after.setGeometryOnly(value);
});
ui.ratio.addEventListener('input', () => { ui['ratio-value'].value = `${ui.ratio.value}%`; });
modeUi.ratioButton.addEventListener('click', () => setMode('ratio'));
modeUi.countButton.addEventListener('click', () => setMode('count'));
modeUi.count.addEventListener('input', updateCountInfo);
modeUi.count.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') run();
});

function moveSplit(clientX) {
  const rect = ui.after.getBoundingClientRect();
  if (!rect.width) return;
  splitValue = Math.min(0.98, Math.max(0.02, (clientX - rect.left) / rect.width));
  splitUi.line.style.left = `${splitValue * 100}%`;
  views?.after.setSplit(splitValue);
}
let splitDragging = false;
splitUi.line.addEventListener('pointerdown', (event) => {
  splitDragging = true;
  splitUi.line.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
});
splitUi.line.addEventListener('pointermove', (event) => {
  if (splitDragging) moveSplit(event.clientX);
});
const stopSplit = (event) => {
  splitDragging = false;
  if (splitUi.line.hasPointerCapture?.(event.pointerId)) splitUi.line.releasePointerCapture(event.pointerId);
};
splitUi.line.addEventListener('pointerup', stopSplit);
splitUi.line.addEventListener('pointercancel', stopSplit);
splitUi.line.addEventListener('keydown', (event) => {
  const step = event.key === 'ArrowLeft' ? -0.04 : event.key === 'ArrowRight' ? 0.04 : 0;
  if (!step) return;
  event.preventDefault();
  const rect = ui.after.getBoundingClientRect();
  moveSplit(rect.left + rect.width * (splitValue + step));
});
ui.error.addEventListener('input', () => { ui['error-value'].value = formatPercent(Number(ui.error.value) / 100); });
ui.file.addEventListener('change', () => {
  importFile(ui.file.files[0]);
  ui.file.value = '';
});
ui.drop.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!busy) ui.drop.classList.add('dragging');
});
ui.drop.addEventListener('dragleave', () => ui.drop.classList.remove('dragging'));
ui.drop.addEventListener('drop', (event) => {
  event.preventDefault();
  ui.drop.classList.remove('dragging');
  importFile(event.dataTransfer.files[0]);
});
ui.export.addEventListener('click', async () => {
  if (!result || busy || !texturePanel.canExport()) return;
  setBusy(true);
  status('正在生成 GLB…');
  try {
    const binary = await exportGLB(texturePanel.display(result));
    const url = URL.createObjectURL(new Blob([binary], { type: 'model/gltf-binary' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${model.name.replace(/\.(glb|obj|stl)$/i, '')}-simplified.glb`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status(`已生成 GLB 下载（${(binary.byteLength / 1_000_000).toFixed(2)} MB）。`);
  } catch (error) {
    console.error(error);
    status(`导出失败。${error.message}`, true);
  } finally {
    setBusy(false);
  }
});

setupEmbed({
  importFile,
  buildGLB,
  counts,
  setRatio,
  status,
  statusText: () => ui.status.textContent,
  onResult: (listener) => resultListeners.push(listener),
  onBusy: (listener) => busyListeners.push(listener),
});
if (embedded) status('正在加载平台模型…');
else showSample();

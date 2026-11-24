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
  if (model) views?.before.setModel(model.display, model);
  result?.children.forEach((mesh) => mesh.geometry.dispose());
  result = undefined;
  resultCounts = undefined;
  showCounts('after');
  ui['error-label'].textContent = '实际误差';
  ui.reduction.textContent = ui['actual-error'].textContent = ui.elapsed.textContent = '—';
}

function renderResult() {
  const compare = Boolean(result && texturePanel.comparing());
  if (model) views?.before.setModel(compare ? result : model.display, model);
  views?.after.setModel(texturePanel.display(result), model);
  ui['before-label'].textContent = compare ? '简化网格 · 原始贴图' : '原始网格';
  ui['after-label'].textContent = texturePanel.hasApplied() ? '简化结果 · 压缩贴图' : '简化结果';
  const left = compare ? resultCounts : model;
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
  const ratio = Number(ui.ratio.value) / 100;
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

function setRatio(percent, rerun, errorPercent) {
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

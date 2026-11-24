// Embed mode for POLYMODEL-Vault: the asset library opens MeshPilot in an iframe
// (/meshpilot/index.html?embed=1&lang=zh|en), sends it a model to load, applies
// presets and asks for the simplified GLB back. Messages are only exchanged with
// the parent window on the same origin.

const params = new URLSearchParams(location.search);
export const embedded = params.has('embed');
const lang = params.get('lang') === 'en' ? 'en' : 'zh';

// ------------------------------------------------------------------ English UI
const EXACT = {
  'MeshPilot 网格实验台': 'MeshPilot mesh workbench',
  '网格实验台': 'Mesh workbench',
  '网格简化与对比': 'Mesh simplification & comparison',
  '减面、压缩贴图，并在同步视角下检查导出效果。': 'Reduce triangles, compress textures and check the result side by side.',
  '加载示例': 'Load sample',
  '模型对比': 'Model comparison',
  '扭结环': 'Torus knot',
  '内置示例': 'Built-in sample',
  '线框': 'Wireframe',
  '仅看几何': 'Geometry only',
  '重置视角': 'Reset view',
  '原始网格': 'Original mesh',
  '简化结果': 'Simplified',
  '简化网格 · 原始贴图': 'Simplified mesh · original textures',
  '简化结果 · 压缩贴图': 'Simplified · compressed textures',
  '三角面': 'triangles',
  '拖动旋转 · 滚轮缩放 · 右键平移': 'Drag to rotate · scroll to zoom · right-drag to pan',
  '视角同步': 'Views synced',
  '贴图压缩': 'Texture compression',
  '导入带贴图的 GLB 后可用。': 'Available after loading a GLB with textures.',
  '预览后可下载包含这组贴图的 GLB。': 'Preview to use these textures in the exported GLB.',
  '最长边': 'Longest edge',
  '原始贴图': 'Original textures',
  '颜色质量': 'Color quality',
  '预览并应用': 'Preview & apply',
  '对比贴图效果': 'Compare textures',
  '查看贴图细节': 'Texture details',
  '贴图': 'Texture',
  '压缩后的贴图': 'Compressed texture',
  '简化设置': 'Simplification',
  '导入模型': 'Import model',
  '点击或拖入 GLB、OBJ、STL': 'Click or drop GLB, OBJ, STL',
  '目标保留比例': 'Target ratio',
  '误差上限': 'Error limit',
  '保护材质外观': 'Protect appearance',
  '将法线、纹理坐标等纳入减面误差。': 'Include normals, UVs etc. in the simplification error.',
  '保护网格表面': 'Protect surface',
  '保留 UV 接缝拐点，在检测到异常的区域多留面。': 'Keep UV seam corners and more triangles where issues are detected.',
  '保持开放边界': 'Keep open borders',
  '运行简化': 'Simplify',
  '运行结果': 'Result',
  '三角面减少': 'Triangles removed',
  '实际误差': 'Actual error',
  '实际综合误差': 'Actual combined error',
  '实际相对几何误差': 'Actual relative geometric error',
  '简化耗时': 'Time',
  '下载 GLB': 'Download GLB',
  '正在初始化 WebAssembly…': 'Initializing WebAssembly…',
  '正在简化网格…': 'Simplifying mesh…',
  '正在生成 GLB…': 'Building GLB…',
  '正在调整尺寸并压缩贴图…': 'Resizing and compressing textures…',
  '浏览器无法启用 WebGL 2': 'WebGL 2 is not available in this browser',
  '基础颜色': 'Base color', '法线': 'Normal', '粗糙度': 'Roughness', '金属度': 'Metalness',
  '环境光遮蔽': 'Ambient occlusion', '自发光': 'Emissive', '透明度': 'Alpha',
  '正在加载平台模型…': 'Loading model from the library…',
  'meshoptimizer 1.3.0 · 本地处理': 'meshoptimizer 1.3.0 · runs locally',
};
const PATTERNS = [
  [/^简化完成，实际保留 (.+?)。已受误差上限、网格结构或保护设置限制。$/, 'Done, kept $1. Limited by the error limit, mesh structure or protection settings.'],
  [/^简化完成，实际保留 (.+?)。可切换线框检查拓扑，或下载简化结果。$/, 'Done, kept $1. Switch to wireframe to check the topology.'],
  [/^简化完成，实际保留 (.+?)。仍有 (.+?) 个三角面存在表面风险，可降低误差上限后重试。$/, 'Done, kept $1. $2 triangles still have surface risks; try a lower error limit.'],
  [/^简化失败。(.*)$/, 'Simplification failed. $1'],
  [/^导入失败。(.*)$/, 'Import failed. $1'],
  [/^导出失败。(.*)$/, 'Export failed. $1'],
  [/^贴图压缩失败。(.*)$/, 'Texture compression failed. $1'],
  [/^正在读取 (.+?)…$/, 'Reading $1…'],
  [/^已载入 (\d+) 张贴图，导出时保留可直接封装的原图。$/, '$1 texture(s) loaded; compatible originals are kept on export.'],
  [/^(.*) · 已用于导出$/, '$1 · used for export'],
  [/^(.+?) 顶点$/, '$1 vertices'],
  [/^原始 (.*)$/, 'Original $1'],
  [/^应用后 (.*)$/, 'Applied $1'],
];

export function tr(text) {
  if (lang !== 'en' || !text) return text;
  const trimmed = text.trim();
  if (EXACT[trimmed]) return text.replace(trimmed, EXACT[trimmed]);
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(trimmed)) return text.replace(trimmed, trimmed.replace(pattern, replacement));
  }
  return text;
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const next = tr(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  for (const attribute of ['title', 'alt', 'aria-label']) {
    const value = node.getAttribute(attribute);
    if (value) {
      const next = tr(value);
      if (next !== value) node.setAttribute(attribute, next);
    }
  }
  node.childNodes.forEach(translateNode);
}

function setupTranslation() {
  if (lang !== 'en') return;
  document.documentElement.lang = 'en';
  document.title = tr(document.title);
  translateNode(document.body);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateNode(mutation.target);
      mutation.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
}

// ------------------------------------------------------------------ bridge
export function setupEmbed(app) {
  setupTranslation();
  if (!embedded) return;
  document.documentElement.classList.add('embedded');

  const send = (message, transfer = []) => {
    if (window.parent !== window) window.parent.postMessage({ source: 'meshpilot', ...message }, location.origin, transfer);
  };
  app.onResult((stats) => send({ type: 'result', ...stats }));
  app.onBusy((busy) => send({ type: 'busy', busy }));

  window.addEventListener('message', async ({ data, origin }) => {
    if (origin !== location.origin || !data || data.target !== 'meshpilot') return;
    try {
      if (data.type === 'load') {
        app.status('正在加载平台模型…');
        const response = await fetch(data.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (data.ratio) app.setRatio(data.ratio, false, data.error);
        const ok = await app.importFile(new File([blob], data.name || 'model.glb', { type: 'model/gltf-binary' }));
        if (!ok) throw new Error(app.statusText());
        send({ type: 'loaded', ...app.counts() });
      } else if (data.type === 'preset') {
        app.setRatio(data.ratio, true, data.error);
      } else if (data.type === 'export') {
        const binary = await app.buildGLB();
        send({ type: 'exported', buffer: binary, bytes: binary.byteLength, ...app.counts() }, [binary]);
      }
    } catch (error) {
      console.error(error);
      send({ type: 'error', message: tr(error.message || String(error)) });
    }
  });
  send({ type: 'ready' });
}

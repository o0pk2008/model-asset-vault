import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { surfaceCheck } from './surface.js';
import { lockUVSeams } from './uv-seams.js';

function simplifyGroup(indices, positions, appearance, target, error, flags, positionRemap) {
  if (target === indices.length) return [indices, 0, 0];
  const { values = new Float32Array(), weights = [] } = appearance ?? {};
  if (!positionRemap && !appearance) return [...MeshoptSimplifier.simplify(indices, positions, 3, target, error, flags), 0];
  const run = (locks, limit) => MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, values, weights.length, weights, locks, target, limit, flags);
  if (!positionRemap) return [...run(null, error), 0];

  const locks = new Uint8Array(positionRemap.length);
  lockUVSeams(indices, positions, appearance, positionRemap, MeshoptSimplifier.getScale(positions, 3) * 0.00125, locks);
  const check = surfaceCheck(indices, positions, appearance, positionRemap, flags.includes('LockBorder'));
  let best;
  for (let attempt = 0; attempt < 12; attempt++) {
    const limit = error * 0.6 ** Math.max(0, attempt - 9);
    const [output, measuredError] = run(locks, limit);
    const risks = check(output, locks, attempt < 4 ? 1 : 2);
    if (risks === 0) return [output, measuredError, 0];
    if (!best || risks < best[2] || (risks === best[2] && output.length < best[0].length)) {
      best = [output, measuredError, risks];
    }
  }
  return best;
}

self.onmessage = async ({ data }) => {
  try {
    if (!MeshoptSimplifier.supported) throw new Error('当前浏览器无法运行 meshoptimizer WebAssembly。');
    await MeshoptSimplifier.ready;
    const start = performance.now();
    const flags = data.lockBorder ? ['LockBorder'] : [];
    if (data.protectSurface) flags.push('PreserveFolds');
    let maxError = 0;
    let triangles = 0;
    let vertices = 0;
    let surfaceRisks = 0;
    const transfer = [];
    const results = data.parts.map(({ positions, groups, appearance }) => {
      let offset = 0;
      const positionRemap = data.protectSurface && data.ratio < 1 ? MeshoptSimplifier.generatePositionRemap(positions, 3) : null;
      const reduced = groups.map(({ indices, materialIndex }) => {
        const target = Math.max(3, Math.floor(indices.length / 3 * data.ratio) * 3);
        const [output, error, risks] = simplifyGroup(indices, positions, appearance, target, data.error, flags, positionRemap);
        surfaceRisks += risks;
        maxError = Math.max(maxError, error);
        const group = { start: offset, count: output.length, materialIndex };
        offset += output.length;
        return { group, output };
      });
      const indices = new Uint32Array(offset);
      for (const { group, output } of reduced) indices.set(output, group.start);
      const [remap, vertexCount] = MeshoptSimplifier.compactMesh(indices);
      triangles += indices.length / 3;
      vertices += vertexCount;
      transfer.push(indices.buffer, remap.buffer);
      return { indices, remap, vertexCount, groups: reduced.map(({ group }) => group) };
    });
    self.postMessage({ results, triangles, vertices, maxError, surfaceRisks, elapsed: performance.now() - start }, transfer);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

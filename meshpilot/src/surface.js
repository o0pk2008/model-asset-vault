function faceKey(a, b, c) {
  if (a <= b && a <= c) return `${a}/${b}/${c}`;
  if (b <= c) return `${b}/${c}/${a}`;
  return `${c}/${a}/${b}`;
}

export function surfaceCheck(indices, positions, appearance, positionRemap, lockBorder) {
  const vertexCount = positions.length / 3;
  const { values, weights, normalOffset, uvOffsets } = appearance ?? { uvOffsets: [] };
  const stride = weights?.length ?? 0;
  const uvSigns = uvOffsets.map(() => new Uint8Array(vertexCount));
  const originalFlatUVs = uvOffsets.map(() => new Set());
  const originalFacesWithFlips = new Set();
  const originalEdges = new Map();
  const incident = new Int32Array(vertexCount).fill(-1);
  const nextIncident = new Int32Array(indices.length);

  function edgeKey(a, b) {
    const u = positionRemap[a];
    const v = positionRemap[b];
    return Math.min(u, v) * vertexCount + Math.max(u, v);
  }

  function uvSign(a, b, c, offset) {
    const i = a * stride + offset;
    const j = b * stride + offset;
    const k = c * stride + offset;
    const u = values[j] - values[i];
    const v = values[j + 1] - values[i + 1];
    const x = values[k] - values[i];
    const y = values[k + 1] - values[i + 1];
    const area = u * y - v * x;
    const threshold = 1e-6 * Math.max(u * u + v * v, x * x + y * y);
    return area > threshold ? 1 : area < -threshold ? 2 : 0;
  }

  function reversedFace(a, b, c) {
    const i = a * 3, j = b * 3, k = c * 3;
    const ux = positions[j] - positions[i], vx = positions[k] - positions[i];
    const uy = positions[j + 1] - positions[i + 1], vy = positions[k + 1] - positions[i + 1];
    const uz = positions[j + 2] - positions[i + 2], vz = positions[k + 2] - positions[i + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const area = Math.hypot(x, y, z);
    if (area === 0) return true;
    if (normalOffset === undefined) return false;
    const n = a * stride + normalOffset, m = b * stride + normalOffset, p = c * stride + normalOffset;
    const nx = values[n] + values[m] + values[p];
    const ny = values[n + 1] + values[m + 1] + values[p + 1];
    const nz = values[n + 2] + values[m + 2] + values[p + 2];
    return x * nx + y * ny + z * nz < -0.05 * area;
  }

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    for (let corner = i; corner < i + 3; corner++) {
      const vertex = positionRemap[indices[corner]];
      nextIncident[corner] = incident[vertex];
      incident[vertex] = corner;
    }
    if (reversedFace(a, b, c)) originalFacesWithFlips.add(faceKey(a, b, c));
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      originalEdges.set(key, (originalEdges.get(key) ?? 0) + 1);
    }
    uvOffsets.forEach((offset, channel) => {
      const sign = uvSign(a, b, c, offset);
      if (!sign) originalFlatUVs[channel].add(faceKey(a, b, c));
      for (const vertex of [a, b, c]) uvSigns[channel][vertex] |= sign;
    });
  }

  return (candidate, locks, rings) => {
    const suspect = new Set();
    const edges = new Map();
    for (let i = 0; i < candidate.length; i += 3) {
      const a = candidate[i], b = candidate[i + 1], c = candidate[i + 2];
      if (reversedFace(a, b, c) && !originalFacesWithFlips.has(faceKey(a, b, c))) suspect.add(i);
      if (uvOffsets.some((offset, channel) => {
        const signs = uvSigns[channel];
        const sign = signs[a];
        if ((sign !== 1 && sign !== 2) || sign !== signs[b] || sign !== signs[c]) return false;
        const next = uvSign(a, b, c, offset);
        return next !== sign && (next !== 0 || !originalFlatUVs[channel].has(faceKey(a, b, c)));
      })) suspect.add(i);
      for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
        const faces = edges.get(key);
        if (faces) faces.push(i);
        else edges.set(key, [i]);
      }
    }
    for (const [key, faces] of edges) {
      const original = originalEdges.get(key);
      if (faces.length > Math.max(2, original ?? 0) || (lockBorder && faces.length === 1 && original !== 1)) {
        for (const face of faces) suspect.add(face);
      }
    }
    let affectedVertices = new Set();
    for (const face of suspect) {
      for (let corner = 0; corner < 3; corner++) {
        affectedVertices.add(positionRemap[candidate[face + corner]]);
      }
    }
    // Lock nearby source vertices as well as the vertices that survived the collapse.
    for (let ring = 0; ring < rings; ring++) {
      const neighbors = new Set();
      for (const vertex of affectedVertices) {
        for (let corner = incident[vertex]; corner !== -1; corner = nextIncident[corner]) {
          const face = corner - corner % 3;
          for (let index = face; index < face + 3; index++) {
            const source = indices[index];
            const point = positionRemap[source];
            neighbors.add(point);
            locks[source] = locks[point] = 1;
          }
        }
      }
      affectedVertices = neighbors;
    }
    return suspect.size;
  };
}

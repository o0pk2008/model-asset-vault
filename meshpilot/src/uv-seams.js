function distanceToSegmentSquared(positions, vertex, start, end) {
  const i = vertex * 3, j = start * 3, k = end * 3;
  const x = positions[i] - positions[j], y = positions[i + 1] - positions[j + 1], z = positions[i + 2] - positions[j + 2];
  const u = positions[k] - positions[j], v = positions[k + 1] - positions[j + 1], w = positions[k + 2] - positions[j + 2];
  const length = u * u + v * v + w * w;
  const t = length ? Math.min(1, Math.max(0, (x * u + y * v + z * w) / length)) : 0;
  return (x - u * t) ** 2 + (y - v * t) ** 2 + (z - w * t) ** 2;
}

export function lockUVSeams(indices, positions, appearance, positionRemap, tolerance, locks) {
  if (!appearance?.uvOffsets.length) return;
  const { values, weights, uvOffsets } = appearance;
  const stride = weights.length;
  const vertexCount = positionRemap.length;
  const edgeKey = (a, b) => Math.min(a, b) * vertexCount + Math.max(a, b);
  const halfEdges = new Map();
  for (let i = 0; i < indices.length; i++) {
    const a = indices[i], b = indices[i % 3 === 2 ? i - 2 : i + 1];
    const u = positionRemap[a], v = positionRemap[b];
    if (u === v) continue;
    const key = edgeKey(u, v);
    const endpoints = u < v ? [a, b] : [b, a];
    const previous = halfEdges.get(key);
    if (previous) previous.push(...endpoints);
    else halfEdges.set(key, endpoints);
  }

  const graph = new Map();
  function addNeighbor(a, b) {
    if (!graph.has(a)) graph.set(a, []);
    graph.get(a).push(b);
  }
  function differentUV(a, b) {
    return uvOffsets.some((offset) => {
      const i = a * stride + offset, j = b * stride + offset;
      return values[i] !== values[j] || values[i + 1] !== values[j + 1];
    });
  }
  for (const endpoints of halfEdges.values()) {
    if (endpoints.length !== 4) continue;
    const [a, b, c, d] = endpoints;
    if (!differentUV(a, c) && !differentUV(b, d)) continue;
    const u = positionRemap[a], v = positionRemap[b];
    addNeighbor(u, v);
    addNeighbor(v, u);
  }

  const traversed = new Set();
  const maxDistanceSquared = tolerance ** 2;
  function lockPath(start, next) {
    if (traversed.has(edgeKey(start, next))) return;
    const path = [start, next];
    traversed.add(edgeKey(start, next));
    let previous = start;
    while (next !== start && graph.get(next).length === 2) {
      const neighbor = graph.get(next).find((vertex) => vertex !== previous);
      traversed.add(edgeKey(next, neighbor));
      path.push(neighbor);
      previous = next;
      next = neighbor;
    }

    locks[start] = locks[next] = 1;
    const spans = [[0, path.length - 1]];
    while (spans.length) {
      const [first, last] = spans.pop();
      let farthest = -1, distance = maxDistanceSquared;
      for (let i = first + 1; i < last; i++) {
        const deviation = distanceToSegmentSquared(positions, path[i], path[first], path[last]);
        if (deviation <= distance) continue;
        distance = deviation;
        farthest = i;
      }
      if (farthest === -1) continue;
      locks[path[farthest]] = 1;
      spans.push([first, farthest], [farthest, last]);
    }
  }

  // Visit junctions before tracing closed loops, which have no junctions.
  for (const [vertex, neighbors] of graph) {
    if (neighbors.length !== 2) for (const neighbor of neighbors) lockPath(vertex, neighbor);
  }
  for (const [vertex, neighbors] of graph) {
    for (const neighbor of neighbors) lockPath(vertex, neighbor);
  }
  for (let i = 0; i < vertexCount; i++) locks[i] = locks[positionRemap[i]];
}

/**
 * 「三角網のどの三角形も制約辺を跨がない」を**幾何で数える**純関数（m3 T11b・要件書 §6）。
 *
 *   import { findCrossingTriangles, countCrossingTriangles } from './lib/constraint-check.mjs';
 *   const report = findCrossingTriangles(data);   // data = loadCompiled(...) の戻り値
 *   report.crossing;                               // 制約辺を跨ぐ三角形の数（naramachi は 0）
 *   report.constraintEdges;                        // 制約辺の本数（827）
 *
 * **何を「跨ぐ」と呼ぶか**: 制約辺の折れ線（端点＋中間ノード。`tinview.mjs` が赤で描く線と同じ）の
 * 線分が三角形の**内部**を正の長さで通るとき。三角形の辺を**共有する**（線分が三角形の辺と重なる）
 * 場合は内部を通らない ∴ 数えない。頂点だけで接する場合も数えない。
 *
 * **許容差 `eps`（座標単位。絵図なら px）**: 三角形の内部判定は「辺までの符号付き距離 > eps」で行う。
 * `eps` が無い（0）と、制約辺の上に載っている中間ノード（`edgeNodes` は線形補間で作られる）の
 * 浮動小数の丸め誤差だけで「跨いだ」と誤判定する（奈良町絵図で 1030 三角形）。`tinview.mjs` が
 * 「折れ線の上」を判定するのと同じ 1e-6 を使う。**実際の跨ぎは三角形の内接円に近い桁（px 以上）**
 * ∴ この許容差で本物の跨ぎを落とすことはない。**検査を緩めるための値ではない**（テストで
 * 0.01 px でも内側に入った線分を跨ぎとして数えることを確かめる）。
 *
 * **三角網と制約辺の解釈**: `TinView`（描画層）をそのまま使う。画面に赤で出る線と、ここで数える
 * 線が同じ配列になるようにするため。canvas には触らない（Node で動く）。
 */
import {
  cross,
  isPoint,
  pointInTriangle,
  segmentsIntersect,
} from './geom.mjs';
import { TinView } from './tinview.mjs';

/**
 * 内部判定の許容差（座標単位）。`tinview.mjs` の `ON_PATH_EPS` と同じ値。
 * 中間ノードが制約辺の上に載っていることによる丸め誤差だけを吸収する。
 */
export const CROSSING_EPS = 1e-6;

/** 2 点の外接矩形（`[minX, minY, maxX, maxY]`）。`geom.boundingBox` より軽い（点が 2 つと分かっている） */
function segmentBox(a, b) {
  return [
    a[0] < b[0] ? a[0] : b[0],
    a[1] < b[1] ? a[1] : b[1],
    a[0] > b[0] ? a[0] : b[0],
    a[1] > b[1] ? a[1] : b[1],
  ];
}

/** 点列の外接矩形（`[minX, minY, maxX, maxY]`） */
function pointsBox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point[0] < minX) minX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] > maxY) maxY = point[1];
  }
  return [minX, minY, maxX, maxY];
}

/** 2 つの矩形が重なるか（`eps` は境界の余裕） */
function boxesOverlap(a, b, eps) {
  return !(b[2] < a[0] - eps || b[0] > a[2] + eps || b[3] < a[1] - eps || b[1] > a[3] + eps);
}

/**
 * 線分 `start→end` が三角形の**内部**を正の長さで通るか（`eps` は内部判定の許容差）。
 *
 * 三角形の 3 辺について「辺までの符号付き距離 ≥ −eps」で線分をクリップし、残った区間の
 * 中点が 3 辺から `eps` より内側にあることを確かめる。辺上をなぞる線分（辺の共有）は
 * 中点の距離が 0 になる ∴ `false`。退化した三角形（面積 0）も `false`。
 *
 * @param {Array<[number, number]>} triangle 3 点（順序は問わない）
 * @param {[number, number]} start
 * @param {[number, number]} end
 * @param {number} [eps=CROSSING_EPS]
 * @returns {boolean}
 */
export function triangleCrossesSegment(triangle, start, end, eps = CROSSING_EPS) {
  if (!Array.isArray(triangle) || triangle.length < 3) {
    throw new TypeError('triangleCrossesSegment には 3 点の配列を渡す');
  }
  if (!isPoint(start) || !isPoint(end)) {
    throw new TypeError(`線分が有限の [x, y] でない: ${JSON.stringify([start, end])}`);
  }
  if (!Number.isFinite(eps) || eps < 0) {
    throw new RangeError(`eps は 0 以上の有限数: ${String(eps)}`);
  }

  const [p0, p1, p2] = triangle;
  if (!isPoint(p0) || !isPoint(p1) || !isPoint(p2) || cross(p0, p1, p2) === 0) {
    return false; // 退化した三角形は面積を持たない
  }
  // 反時計回りにそろえる（内部が「辺の左」= 符号付き距離 ≥ 0 になるように）
  const ordered = cross(p0, p1, p2) > 0 ? [p0, p1, p2] : [p0, p2, p1];
  const sides = [
    [ordered[0], ordered[1]],
    [ordered[1], ordered[2]],
    [ordered[2], ordered[0]],
  ];

  const lengths = sides.map(([u, v]) => Math.hypot(v[0] - u[0], v[1] - u[1]));
  if (lengths.some((length) => length === 0)) return false;

  // 各辺について、線分の両端の符号付き距離（+ が内側）
  const dStart = [];
  const dEnd = [];
  for (let i = 0; i < 3; i += 1) {
    const [u, v] = sides[i];
    dStart[i] = cross(u, v, start) / lengths[i];
    dEnd[i] = cross(u, v, end) / lengths[i];
    if (dStart[i] < -eps && dEnd[i] < -eps) return false; // この辺の外側に丸ごとある
  }

  // 線分のパラメータ t∈[0,1] を「各辺の内側」に切り詰める。
  // 境界 d = −eps を通る t は、どちらの端が外でも `(dStart + eps) / (dStart − dEnd)`（一次式の解）
  let lower = 0;
  let upper = 1;
  for (let i = 0; i < 3; i += 1) {
    if (dStart[i] < -eps) {
      const t = (dStart[i] + eps) / (dStart[i] - dEnd[i]);
      if (t > lower) lower = t;
    }
    if (dEnd[i] < -eps) {
      const t = (dStart[i] + eps) / (dStart[i] - dEnd[i]);
      if (t < upper) upper = t;
    }
  }
  if (!(upper > lower)) return false;

  // 残った区間の中点が、3 辺のどれからも eps より内側か（辺の上をなぞる線分を除く）
  const midpoint = [
    start[0] + (end[0] - start[0]) * ((lower + upper) / 2),
    start[1] + (end[1] - start[1]) * ((lower + upper) / 2),
  ];
  let depth = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const [u, v] = sides[i];
    const signed = cross(u, v, midpoint) / lengths[i];
    if (signed < depth) depth = signed;
  }
  return depth > eps;
}

/**
 * 制約辺を跨ぐ三角形をすべて数える。
 *
 * 三角網（`compiled.tins_points[0]`）と制約辺（`compiled.edges`）は `TinView` で解決する。
 * **1 つの三角形が複数の制約辺を跨いでも 1 と数える**（要件書 §6 の「跨ぐ三角形の数」）。
 *
 * @param {object} data `loadCompiled()` の戻り値
 * @param {{ side?: 'hist'|'modern', eps?: number }} [options]
 * @returns {{
 *   side: 'hist'|'modern', eps: number,
 *   constraintEdges: number, triangles: number, pathSegments: number,
 *   crossing: number, triangleIndices: number[], edgeIndices: number[],
 * }}
 */
export function findCrossingTriangles(data, { side = 'hist', eps = CROSSING_EPS } = {}) {
  if (side !== 'hist' && side !== 'modern') {
    throw new TypeError(`side は 'hist' か 'modern': ${String(side)}`);
  }
  if (!Number.isFinite(eps) || eps < 0) {
    throw new RangeError(`eps は 0 以上の有限数: ${String(eps)}`);
  }

  const tin = new TinView(data, { side });

  // 制約辺の折れ線を線分へ割り、外接矩形を持たせる（825 本 × 中間ノードでも総当たりは重い）
  const segments = [];
  for (const edge of tin.edges) {
    for (let i = 0; i + 1 < edge.path.length; i += 1) {
      const start = edge.path[i];
      const end = edge.path[i + 1];
      if (start[0] === end[0] && start[1] === end[1]) continue; // 長さ 0 の線分は跨がない
      segments.push({ edgeIndex: edge.index, start, end, box: segmentBox(start, end) });
    }
  }

  const crossingTriangles = new Set();
  const crossingEdges = new Set();
  for (const triangle of tin.triangles) {
    const [a, b, c] = triangle.points;
    const box = pointsBox(triangle.points);
    for (const segment of segments) {
      if (!boxesOverlap(box, segment.box, eps)) continue;
      // 線分と三角形が触れるか（geom の線分交差。端点接触も拾う）＋ 線分が丸ごと内側のとき
      let touched = pointInTriangle(segment.start, a, b, c)
        || pointInTriangle(segment.end, a, b, c);
      if (!touched) {
        touched = segmentsIntersect(a, b, segment.start, segment.end)
          || segmentsIntersect(b, c, segment.start, segment.end)
          || segmentsIntersect(c, a, segment.start, segment.end);
      }
      if (!touched) continue;
      if (!triangleCrossesSegment(triangle.points, segment.start, segment.end, eps)) continue;
      crossingTriangles.add(triangle.index);
      crossingEdges.add(segment.edgeIndex);
    }
  }

  return {
    side,
    eps,
    constraintEdges: tin.edges.length,
    triangles: tin.triangles.length,
    pathSegments: segments.length,
    crossing: crossingTriangles.size,
    triangleIndices: [...crossingTriangles].sort((x, y) => x - y),
    edgeIndices: [...crossingEdges].sort((x, y) => x - y),
  };
}

/**
 * `findCrossingTriangles` の数だけを返す（収録ページの `state().crossing` 用）。
 *
 * @param {object} data
 * @param {{ side?: 'hist'|'modern', eps?: number }} [options]
 * @returns {number}
 */
export function countCrossingTriangles(data, options = {}) {
  return findCrossingTriangles(data, options).crossing;
}

/** 数値を決定的な文言にする（`reason` の生成。丸めはここだけで行う） */
function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

/**
 * 収録に使う制約辺を 1 本、**決定的に**選ぶ（T11b の 4）。
 *
 * 規則（この順）:
 *   1. 辺の両端の**現代地図側**座標の距離（弦長）が全辺の**上位 20%**
 *      （降順に並べた `floor(n × edgeRatio)` 番目の値以上）
 *   2. 辺の中点（絵図側）が、絵図の中央 `centralFraction`（既定 25%）の矩形に入る
 *   3. 残った中で**最長**。同点なら `edgeIndex` の小さい方
 *
 * @param {object} data `loadCompiled()` の戻り値
 * @param {{ edgeRatio?: number, centralFraction?: number }} [options]
 * @returns {{
 *   edgeIndex: number, reason: string,
 *   lengthMerc: number, thresholdMerc: number, illstChord: number,
 *   midpoint: [number, number], centerBox: { minX: number, minY: number, maxX: number, maxY: number },
 *   candidates: number,
 * }}
 */
export function selectCentralLongEdge(data, {
  edgeRatio = 0.2,
  centralFraction = 0.25,
} = {}) {
  if (!(edgeRatio > 0 && edgeRatio <= 1)) {
    throw new RangeError(`edgeRatio は (0, 1]: ${String(edgeRatio)}`);
  }
  if (!(centralFraction > 0 && centralFraction <= 1)) {
    throw new RangeError(`centralFraction は (0, 1]: ${String(centralFraction)}`);
  }
  const width = data?.width;
  const height = data?.height;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('selectCentralLongEdge には width / height を持つデータが要る');
  }
  // 中点・弦長は絵図側で測る（画面中央は絵図の中央）。長さだけ現代地図側の端点を使う
  const hist = new TinView(data, { side: 'hist' });
  if (hist.edges.length === 0) throw new Error('制約辺が 1 本も無い');

  // 現代地図側の弦長（要件どおり端点の座標から測る。中間ノードは使わない）
  const lengths = hist.edges.map((edge) => {
    const startMerc = data.points[edge.start]?.[1];
    const endMerc = data.points[edge.end]?.[1];
    if (!isPoint(startMerc) || !isPoint(endMerc)) {
      throw new TypeError(`edges[${edge.index}] の現代地図側の端点が無い`);
    }
    return Math.hypot(endMerc[0] - startMerc[0], endMerc[1] - startMerc[1]);
  });

  const sorted = [...lengths].sort((a, b) => b - a);
  const cutoffRank = Math.floor(lengths.length * edgeRatio);
  const thresholdMerc = sorted[cutoffRank];
  const centerBox = {
    minX: width * (0.5 - centralFraction / 2),
    minY: height * (0.5 - centralFraction / 2),
    maxX: width * (0.5 + centralFraction / 2),
    maxY: height * (0.5 + centralFraction / 2),
  };

  let best = null;
  let candidates = 0;
  for (const edge of hist.edges) {
    const lengthMerc = lengths[edge.index];
    if (lengthMerc < thresholdMerc) continue; // 1. 上位 20%
    const start = edge.path[0];
    const end = edge.path[edge.path.length - 1];
    const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    if (midpoint[0] < centerBox.minX || midpoint[0] > centerBox.maxX
      || midpoint[1] < centerBox.minY || midpoint[1] > centerBox.maxY) continue; // 2. 中央
    candidates += 1;
    const illstChord = Math.hypot(end[0] - start[0], end[1] - start[1]);
    // 3. 最長。同点は edgeIndex の小さい方
    if (!best || lengthMerc > best.lengthMerc
      || (lengthMerc === best.lengthMerc && edge.index < best.edgeIndex)) {
      best = { edgeIndex: edge.index, lengthMerc, illstChord, midpoint };
    }
  }
  if (!best) throw new Error('条件（上位 20%・中央）を満たす制約辺が無い');

  const reason = `現代地図側の端点間距離 ${fmt(best.lengthMerc)} m が全 ${lengths.length} 本の上位 `
    + `${Math.round(edgeRatio * 100)}%（降順 index ${cutoffRank} = ${cutoffRank + 1} 番目で `
    + `${fmt(thresholdMerc)} m 以上）に入り、`
    + `中点 (${fmt(best.midpoint[0])}, ${fmt(best.midpoint[1])}) px が絵図中央 ${Math.round(centralFraction * 100)}% の矩形`
    + `（x ${fmt(centerBox.minX)}–${fmt(centerBox.maxX)} / y ${fmt(centerBox.minY)}–${fmt(centerBox.maxY)} px）に`
    + `収まる ${candidates} 本のうち最長（絵図側の弦長 ${fmt(best.illstChord)} px）。`
    + `同点は edgeIndex の小さい方を採る（決定的）∴ edgeIndex ${best.edgeIndex}。`;

  return {
    edgeIndex: best.edgeIndex,
    reason,
    lengthMerc: best.lengthMerc,
    thresholdMerc,
    illstChord: best.illstChord,
    midpoint: best.midpoint,
    centerBox,
    candidates,
  };
}

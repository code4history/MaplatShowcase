/**
 * DEMO-C の「折れ点」— 直線の区間が三角網の辺をまたぐ点（資料 #12 `constrainedEdges` の白丸）。純関数・DOM 無し。
 *
 * 区分アフィン変換は三角形の内側で直線を直線に写し、辺の上では両側が同じ値を与える。
 * ∴ 区間 a→b の像は「a→b が三角形の辺をまたぐ点を順に写して結んだ連続な折れ線」になり、
 * 写した後の両端 T(a)→T(b) を結ぶ直線（#12 の破線 A′B′）から、またいだ点で外れる。
 * 区間そのものが三角網の辺なら、またぐ辺は無く、像は T(a)→T(b) の直線そのものになる。
 *
 *   const seq = lineVertices(path, vertices);            // 線の上に乗る三角網の頂点（区間の区切り）
 *   const hits = crossingsAlong(seq, tin.tinEdges);       // 区間ごとの折れ点（絵図座標）
 *   const img = mapPolyline(seq, hits, (p) => T(p));      // 像（折れ線）・各区間の両端・折れ点の像
 */
import { pointOnSegment } from './geom.mjs';

/** 2 線分 p1-p2 / q1-q2 の交点の比（p 上の s・q 上の t）。平行なら null */
function intersectParams(p1, p2, q1, q2) {
  const rx = p2[0] - p1[0]; const ry = p2[1] - p1[1];
  const sx = q2[0] - q1[0]; const sy = q2[1] - q1[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = q1[0] - p1[0]; const qy = q1[1] - p1[1];
  return { s: (qx * sy - qy * sx) / den, t: (qx * ry - qy * rx) / den };
}

/**
 * 折れ線 `path` の上に乗る点（`vertices` のうち線分上にあるもの）を、線に沿った順に並べる。
 * `path` 自身の節点は必ず含める。重複（距離 `eps` 以内）は 1 つにする。
 *
 * @param {Array<[number, number]>} path
 * @param {Array<[number, number]>} vertices 三角網の頂点（対応点・辺ノード）
 * @param {number} [eps] 座標単位の許容差（絵図ピクセル）
 */
export function lineVertices(path, vertices, eps = 1e-4) {
  const seq = [];
  let base = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]; const b = path[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const on = [{ u: 0, p: a }];
    for (const v of vertices) {
      if (!pointOnSegment(v, a, b, eps)) continue;
      const u = len > 0 ? ((v[0] - a[0]) * (b[0] - a[0]) + (v[1] - a[1]) * (b[1] - a[1])) / (len * len) : 0;
      on.push({ u, p: v });
    }
    on.sort((m, n) => m.u - n.u);
    for (const { u, p } of on) {
      const last = seq[seq.length - 1];
      if (last && Math.hypot(last.p[0] - p[0], last.p[1] - p[1]) <= eps) continue;
      seq.push({ u: base + u, p: [p[0], p[1]] });
    }
    base += 1;
  }
  const end = path[path.length - 1];
  const last = seq[seq.length - 1];
  if (!last || Math.hypot(last.p[0] - end[0], last.p[1] - end[1]) > eps) seq.push({ u: base, p: [end[0], end[1]] });
  return seq.map(({ p }) => p);
}

/**
 * 区間（`seq` の隣り合う 2 点）ごとに、三角網の辺を**内側で**またぐ点を返す。
 * 区間の両端・辺の両端での接触は数えない（頂点を通るのは折れではなく区切り）。
 *
 * @param {Array<[number, number]>} seq 区間の区切り（`lineVertices` の戻り値）
 * @param {Array<{a: [number, number], b: [number, number]}>} tinEdges 三角網の辺（`TinView.tinEdges`）
 * @param {number} [eps] 比の許容差
 * @returns {Array<Array<{s: number, point: [number, number]}>>} 区間ごとの折れ点（s の昇順）
 */
export function crossingsAlong(seq, tinEdges, eps = 1e-7) {
  const out = [];
  for (let k = 0; k < seq.length - 1; k += 1) {
    const a = seq[k]; const b = seq[k + 1];
    const minX = Math.min(a[0], b[0]); const maxX = Math.max(a[0], b[0]);
    const minY = Math.min(a[1], b[1]); const maxY = Math.max(a[1], b[1]);
    const hits = [];
    for (const { a: q1, b: q2 } of tinEdges) {
      if (Math.max(q1[0], q2[0]) < minX || Math.min(q1[0], q2[0]) > maxX
        || Math.max(q1[1], q2[1]) < minY || Math.min(q1[1], q2[1]) > maxY) continue;
      const r = intersectParams(a, b, q1, q2);
      if (!r) continue;
      if (r.s <= eps || r.s >= 1 - eps || r.t <= eps || r.t >= 1 - eps) continue;
      hits.push({ s: r.s, point: [a[0] + (b[0] - a[0]) * r.s, a[1] + (b[1] - a[1]) * r.s] });
    }
    hits.sort((m, n) => m.s - n.s);
    out.push(hits);
  }
  return out;
}

/**
 * 区間の区切りと折れ点を変換 `T` で写す。
 * @returns {{ line: Array<[number, number]>, chords: Array<[[number, number], [number, number]]>,
 *             bends: Array<[number, number]>, bendCount: number, maxOffChord: number }}
 *   `line` は像の折れ線、`chords` は各区間の写した両端を結ぶ直線（#12 の破線 A′B′）、
 *   `bends` は折れ点の像、`maxOffChord` は像が両端を結ぶ直線から離れる最大距離（写した側の単位）
 */
export function mapPolyline(seq, crossings, T) {
  const line = [];
  const chords = [];
  const bends = [];
  let maxOffChord = 0;
  for (let k = 0; k < seq.length - 1; k += 1) {
    const A = T(seq[k]); const B = T(seq[k + 1]);
    chords.push([A, B]);
    if (k === 0) line.push(A);
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (const { point } of crossings[k] ?? []) {
      const P = T(point);
      line.push(P); bends.push(P);
      if (len > 0) {
        const off = Math.abs((B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0])) / len;
        if (off > maxOffChord) maxOffChord = off;
      }
    }
    line.push(B);
  }
  return { line, chords, bends, bendCount: bends.length, maxOffChord };
}

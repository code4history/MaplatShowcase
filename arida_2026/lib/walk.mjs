/**
 * DEMO-C v3「交差点から交差点まで歩く」の純関数（2026-11-01）。DOM 無し。
 *
 *   const line = densify(road, 20);               // 道の線を密にする
 *   const p = pointAlong(road, 0.5);              // 道の線の道のり半分の点
 *   const w = walkDeviation(road, T, target);     // road を歩いた点を T で写し、相手面の道 target からの外れ
 *
 * 外れ＝写した点から相手面の道の線（折れ線）までの最短距離。現代地図側はメルカトル座標の値を
 * `groundScaleAt`（cos φ）で地上の m に直す（メルカトルの 1 単位は奈良の緯度で地上 0.82 m）。
 */

const EARTH_R = 6378137;

/** 折れ線を約 step ごとに補間して密にする（節点は必ず残す） */
export function densify(nodes, step = 40) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const out = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const a = nodes[i]; const b = nodes[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k += 1) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const last = nodes[nodes.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

/** 折れ線の長さ */
export function polylineLength(line) {
  let s = 0;
  for (let i = 0; i < line.length - 1; i += 1) s += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return s;
}

/**
 * 折れ線の上を道のりの比 t（0〜1）だけ進んだ点。範囲外の t は両端に丸める。
 * 長さ 0 の折れ線は始点を返す。
 */
export function pointAlong(line, t) {
  if (!Array.isArray(line) || line.length === 0) throw new RangeError('pointAlong: 折れ線が空');
  const first = line[0];
  if (line.length === 1) return [first[0], first[1]];
  const total = polylineLength(line);
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  if (total === 0) return [first[0], first[1]];
  let rest = u * total;
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]; const b = line[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (rest <= len || i === line.length - 2) {
      const k = len > 0 ? Math.min(1, rest / len) : 0;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    rest -= len;
  }
  const last = line[line.length - 1];
  return [last[0], last[1]];
}

/** 点から折れ線への最短距離 */
export function distToPolyline(p, line) {
  if (line.length === 1) return Math.hypot(p[0] - line[0][0], p[1] - line[0][1]);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]; const b = line[i + 1];
    const vx = b[0] - a[0]; const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t));
    if (d < best) best = d;
  }
  return best;
}

/** 点から線分への最短距離 */
export function distToSegment(p, a, b) {
  return distToPolyline(p, [a, b]);
}

/** メルカトル y（m）での「メルカトル 1 単位＝地上何 m か」（cos φ） */
export function groundScaleAt(mercY) {
  const lat = Math.atan(Math.sinh(mercY / EARTH_R));
  return Math.cos(lat);
}

/**
 * 道の線 `road` を歩き（約 `step` ごとの点）、各点を `T` で相手面へ写して、相手面の道 `target` からの外れを測る。
 * @param {Array<[number, number]>} road 歩く面の道の線
 * @param {(p: [number, number]) => [number, number]} T 歩く面 → 相手面
 * @param {Array<[number, number]>} target 相手面の道の線
 * @param {{ step?: number, scale?: number }} [o] scale … 相手面の 1 単位を何倍して表すか（メルカトル→地上 m など）
 * @returns {{ max: number, maxT: number, mean: number, samples: Array<{ t: number, p: [number, number], q: [number, number], d: number }> }}
 */
export function walkDeviation(road, T, target, { step = 20, scale = 1 } = {}) {
  const pts = densify(road, step);
  const total = polylineLength(road);
  const samples = [];
  let along = 0;
  for (let i = 0; i < pts.length; i += 1) {
    if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const q = T(pts[i]);
    samples.push({ t: total > 0 ? along / total : 0, p: pts[i], q, d: distToPolyline(q, target) * scale });
  }
  let max = 0; let maxT = 0; let sum = 0;
  for (const s of samples) { sum += s.d; if (s.d > max) { max = s.d; maxT = s.t; } }
  return { max, maxT, mean: samples.length ? sum / samples.length : 0, samples };
}

/** 2 方向の角度差（度・0〜90。向きは問わない） */
export function lineAngleDeg(a, b, c, d) {
  const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const t2 = Math.atan2(d[1] - c[1], d[0] - c[0]);
  let x = Math.abs(t1 - t2) % Math.PI;
  if (x > Math.PI / 2) x = Math.PI - x;
  return (x * 180) / Math.PI;
}

/** 折れ線が弦（両端を結ぶ直線）からいちばん離れる距離の、弦長に対する比（まっすぐなら 0） */
export function sinuosity(line) {
  const a = line[0]; const b = line[line.length - 1];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (chord === 0) return Infinity;
  let off = 0;
  for (const p of line) off = Math.max(off, distToSegment(p, a, b));
  return off / chord;
}

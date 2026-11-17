/**
 * 外挿の比・回転・内外判定の純関数（m3 T9・要件書 §5 の ①④）。
 *
 *   import { computeQuadrants, hullOfPoints, classifyPoint } from './lib/extrap.mjs';
 *   const hull = hullOfPoints(data.points);              // 対応点（絵図座標）の凸包
 *   classifyPoint(cursorImage, hull);                    // 'inside' | 'outside'
 *   computeQuadrants(data.vertices, data.centroid, { vertexMode: data.vertexMode });
 *
 * **4 象限の式**（要件書 §5 表 ④・`MaplatTin/src/boundary-vertices.ts:85-86` と同式）:
 *
 *   forwΔ_i = vertices_points[i][0] − centroid_point[0]
 *   bakwΔ_i = [v_x − c_x, c_y − v_y]        （v = vertices_points[i][1]、c = centroid_point[1]）
 *   r_i      = ‖forwΔ_i‖ / ‖bakwΔ_i‖
 *   θ_i      = atan2(forwΔ_x, forwΔ_y) − atan2(bakwΔ_x, bakwΔ_y)
 *
 * `bakwΔ` の y は **invert 補正**（Maplat の既定 `yaxisMode = "invert"`）。この符号を落とすと
 * θ が 180° ずれる。`r_i` は縮尺比、`θ_i` は回転差（度）。
 *
 * **数値の出所を偽らない**: 縮尺比・回転はコンパイル時に内部で計算され `compiled` には
 * 保存されない（保存されるのは `vertices_points` と `vertices_params`）。ここで返すのは
 * `vertices_points` から**再計算した観測値**であり、変換器が内部で使った値そのものではない。
 * 画面でも「境界頂点での観測値」と添える（要件書 §5 の注）。
 *
 * **birdeye でないとき**: 4 隅を別々の象限として扱わず、**1 組に集約**する
 * （`boundary-vertices.ts` の `mode !== "birdeye"` と同じ判断）。集約は
 * 「比は最小値・回転は円周平均」で、4 隅のばらつきを 1 つの代表値に潰す。
 *
 * **内外判定**: ここでいう inside は**対応点の凸包の内側**（要件書 §5 ①）。
 * 外挿領域かどうかは `isInExtrapolation`（凸包の外かつ境界多角形の内）で別に聞く。
 */
import { convexHull, pointInPolygon } from './geom.mjs';

const RAD_TO_DEG = 180 / Math.PI;

/** 有限の [x, y] か（`geom.mjs` と同じ判定をこのモジュール内に閉じる） */
function isFinitePoint(value) {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

/**
 * `compiled.points[i]` / `vertices_points[i]` / `centroid_point` の入れ子から
 * side（0 = 絵図, 1 = メルカトル）の座標を採る。
 *
 * `centroid_point` は素の `[x, y]` で保存されたデータもある ∴ 入れ子でなければ
 * そのまま 1 点として扱う（`side` を問わず同じ座標）。
 *
 * @param {unknown} value
 * @param {0|1} column
 * @param {string} label
 * @returns {[number, number]}
 */
function pointOf(value, column, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} が配列でない: ${JSON.stringify(value)}`);
  }
  const point = Array.isArray(value[0]) ? value[column] : value;
  if (!isFinitePoint(point)) {
    throw new TypeError(`${label} が有限の [x, y] でない: ${JSON.stringify(value)}`);
  }
  return [point[0], point[1]];
}

/** `[絵図座標, メルカトル座標]` の配列を検証して返す */
function pairList(verticesPoints, label) {
  if (!Array.isArray(verticesPoints) || verticesPoints.length === 0) {
    throw new TypeError(`${label} が空でない配列でない`);
  }
  return verticesPoints;
}

/**
 * 4 隅それぞれの `forwΔ` と `bakwΔ`（要件書 §5 ④ の式の入力）。
 *
 * @param {Array<[[number, number], [number, number]]>} verticesPoints `compiled.vertices_points`
 * @param {[[number, number], [number, number]]|[number, number]} centroidPoint `compiled.centroid_point`
 * @returns {Array<{ forwDelta: [number, number], bakwDelta: [number, number] }>}
 */
export function forwBakwDeltas(verticesPoints, centroidPoint) {
  const vertices = pairList(verticesPoints, 'vertices_points');
  const centroidForw = pointOf(centroidPoint, 0, 'centroid_point');
  // bakw 側の重心は列 1（素の [x,y] データでは同じ点が返る）
  const centroidBakw = pointOf(centroidPoint, 1, 'centroid_point');

  return vertices.map((vertex, index) => {
    const forw = pointOf(vertex, 0, `vertices_points[${index}][0]`);
    const bakw = pointOf(vertex, 1, `vertices_points[${index}][1]`);
    return {
      forwDelta: [forw[0] - centroidForw[0], forw[1] - centroidForw[1]],
      // **invert 補正**: y は「重心 − 頂点」（符号を落とすと θ が 180° ずれる）
      bakwDelta: [bakw[0] - centroidBakw[0], centroidBakw[1] - bakw[1]],
    };
  });
}

/**
 * 1 組の `forwΔ`/`bakwΔ` から比 `r` と回転 `θ`（度）を出す。
 *
 * `bakwΔ` が零ベクトル（重心と頂点が同一点）のときは比を作れない ∴ `r`・`θ` とも
 * `NaN` にする（0 や 1 で埋めない。画面は `—` になる）。
 *
 * @param {[number, number]} forwDelta
 * @param {[number, number]} bakwDelta
 * @returns {{ r: number, theta: number, θ: number }}
 */
export function ratioAndTheta(forwDelta, bakwDelta) {
  if (!isFinitePoint(forwDelta) || !isFinitePoint(bakwDelta)) {
    throw new TypeError('ratioAndTheta: 有限の [x, y] を渡す');
  }
  const forwNorm = Math.hypot(forwDelta[0], forwDelta[1]);
  const bakwNorm = Math.hypot(bakwDelta[0], bakwDelta[1]);
  if (!(bakwNorm > 0) || !Number.isFinite(forwNorm)) {
    return { r: Number.NaN, theta: Number.NaN, θ: Number.NaN };
  }
  const r = forwNorm / bakwNorm;
  // **atan2(x, y)** の順（北から時計回り）。式をそのまま実装する
  const theta = (Math.atan2(forwDelta[0], forwDelta[1])
    - Math.atan2(bakwDelta[0], bakwDelta[1])) * RAD_TO_DEG;
  return { r, theta, θ: theta };
}

/**
 * birdeye でないときの 1 組（`boundary-vertices.ts` の `reduceSamples` と同じ判断）。
 * 比は**最小値**、回転は**円周平均**（`atan2(Σsin, Σcos)`）。
 *
 * @param {Array<{ r: number, theta: number }>} entries
 */
function aggregateRatioAndTheta(entries) {
  const usable = entries.filter((entry) => Number.isFinite(entry.r) && Number.isFinite(entry.theta));
  if (usable.length === 0) {
    return { r: Number.NaN, theta: Number.NaN, θ: Number.NaN };
  }
  const r = usable.reduce((min, entry) => Math.min(min, entry.r), Infinity);
  let sumCos = 0;
  let sumSin = 0;
  for (const entry of usable) {
    const rad = entry.theta / RAD_TO_DEG;
    sumCos += Math.cos(rad);
    sumSin += Math.sin(rad);
  }
  const theta = Math.atan2(sumSin, sumCos) * RAD_TO_DEG;
  return { r, theta, θ: theta };
}

/**
 * 境界頂点の比 `r_i` と回転 `θ_i`。
 *
 * - `vertexMode === 'birdeye'` … 4 隅それぞれ 4 組（要件書 §5 ④）
 * - それ以外（plain / 未知） … 1 組に集約（**4 組を偽って出さない**）
 *
 * @param {Array<[[number, number], [number, number]]>} verticesPoints `compiled.vertices_points`
 * @param {[[number, number], [number, number]]|[number, number]} centroidPoint `compiled.centroid_point`
 * @param {{ vertexMode?: string }} [options]
 * @returns {Array<{ r: number, theta: number, θ: number, label?: string }>}
 */
export function computeQuadrants(verticesPoints, centroidPoint, { vertexMode = 'birdeye' } = {}) {
  const deltas = forwBakwDeltas(verticesPoints, centroidPoint);
  const entries = deltas.map(({ forwDelta, bakwDelta }) => ratioAndTheta(forwDelta, bakwDelta));

  if (vertexMode === 'birdeye') {
    return entries.map((entry, index) => ({ ...entry, label: `隅${index + 1}` }));
  }
  return [{ ...aggregateRatioAndTheta(entries), label: '比・回転' }];
}

/**
 * 対応点（`compiled.points`）の絵図座標から凸包を作る。
 *
 * `points` は `[絵図座標, メルカトル座標]` の入れ子、または素の `[x, y]` 配列を受ける。
 * 凸包の外が「外挿」の判定対象（要件書 §5 ①）。
 *
 * @param {Array<[[number, number], [number, number]]|[number, number]>} points
 * @returns {Array<[number, number]>}
 */
export function hullOfPoints(points) {
  if (!Array.isArray(points)) {
    throw new TypeError('hullOfPoints には点の配列を渡す');
  }
  const imagePoints = points.map((point, index) => {
    if (!Array.isArray(point)) {
      throw new TypeError(`points[${index}] が配列でない: ${JSON.stringify(point)}`);
    }
    const value = Array.isArray(point[0]) ? point[0] : point;
    if (!isFinitePoint(value)) {
      throw new TypeError(`points[${index}] が有限の [x, y] でない: ${JSON.stringify(point)}`);
    }
    return [value[0], value[1]];
  });
  return convexHull(imagePoints);
}

/**
 * 点が凸包の内側（境界上を含む）か。
 *
 * @param {[number, number]} point
 * @param {Array<[number, number]>} hull
 * @param {number} [eps=0] 境界の許容差（座標単位）
 * @returns {boolean}
 */
export function isInsideHull(point, hull, eps = 0) {
  if (!isFinitePoint(point)) {
    throw new TypeError('isInsideHull には有限の [x, y] を渡す');
  }
  return pointInPolygon(point, hull, eps);
}

/**
 * 点の内外判定（要件書 §5 ①）。凸包の内側なら `'inside'`、外なら `'outside'`。
 *
 * @param {[number, number]} point
 * @param {Array<[number, number]>} hull
 * @param {{ eps?: number }} [options]
 * @returns {'inside'|'outside'}
 */
export function classifyPoint(point, hull, { eps = 0 } = {}) {
  return isInsideHull(point, hull, eps) ? 'inside' : 'outside';
}

/**
 * 外挿領域（凸包の外かつ境界多角形の内）か。境界多角形の外まで「外挿」と
 * 呼ばないための判定（要件書 §5・計画 §5.3 の 2）。
 *
 * @param {[number, number]} point
 * @param {Array<[number, number]>} hull
 * @param {Array<[number, number]>} boundary `vertices_points[i][0]` の列
 * @param {{ eps?: number }} [options]
 * @returns {boolean}
 */
export function isInExtrapolation(point, hull, boundary, { eps = 0 } = {}) {
  if (!isFinitePoint(point)) {
    throw new TypeError('isInExtrapolation には有限の [x, y] を渡す');
  }
  return !pointInPolygon(point, hull, eps) && pointInPolygon(point, boundary, eps);
}

/** 角を (−π, π] に畳む（`maplat_transform.js` の `H` と同じ） */
function wrapAngle(angle) {
  const full = 2 * Math.PI;
  const n = angle - Math.floor(angle / full) * full;
  return n > Math.PI ? n - full : n;
}

/**
 * 四辺形の外の点が入る**無限大三角形（扇）の番号**。扇 s は重心から隅 s と隅 s+1 を通る
 * 2 本の半直線に挟まれた領域（その外側を三角形 (重心, 隅 s, 隅 s+1) のアフィン変換で外挿する）。
 *
 * 選び方は `vendor/maplat_transform.js` の `_t`／`vt`（公開版 `geometry.ts` の decideUseVertex）と同じ:
 * 重心からの方位角 `atan2(dx, dy)` が、隣り合う 2 隅の方位角の間に入る s のうち、近い方の角の差が最小のもの。
 *
 * @param {[number, number]} point
 * @param {[number, number]} centroid
 * @param {Array<[number, number]>} corners 四隅（`vertices_points[i][0]` の列）
 * @returns {number|null} 0..corners.length-1。決まらなければ null
 */
export function fanIndexOf(point, centroid, corners) {
  if (!isFinitePoint(point) || !isFinitePoint(centroid) || !Array.isArray(corners) || corners.length < 3) {
    return null;
  }
  const angleOf = (p) => Math.atan2(p[0] - centroid[0], p[1] - centroid[1]);
  const a = angleOf(point);
  const angles = corners.map(angleOf);
  let prev = wrapAngle(a - angles[0]);
  let best = 2 * Math.PI;
  let found = null;
  for (let i = 0; i < angles.length; i += 1) {
    const next = wrapAngle(a - angles[(i + 1) % angles.length]);
    const near = Math.min(Math.abs(prev), Math.abs(next));
    if (prev * next <= 0 && near < best) { best = near; found = i; }
    prev = next;
  }
  return found;
}

/**
 * 三角網の三角形がどの域のものか。頂点が対応点（と辺の中間ノード）だけなら `'inside'`（凸包の内）、
 * 四隅の予測点（トークン `b0`〜`b3`・`bbox0`〜）を 1 つでも含めば `'extrap'`（凸包の外・四辺形の内）。
 *
 * @param {Array<string>} keys `TinView` の三角形の `keys`（`p12`・`e3`・`b1`・`c`）
 * @returns {'inside'|'extrap'}
 */
export function triangleZoneOf(keys) {
  return Array.isArray(keys) && keys.some((key) => typeof key === 'string' && /^b\d+$/.test(key)) ? 'extrap' : 'inside';
}

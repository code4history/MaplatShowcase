/**
 * 2 次元の純関数（m3 T3b・計画 §3）。**DOM も canvas も使わない**。
 *
 * `tinview.mjs`（三角網・凸包・外挿塗り）と `vp5.mjs`（T7 の四隅ズレ）から共用する。
 * すべて「入力の配列・点を書き換えない」。座標系は呼び出し側の任意（絵図ピクセルでも
 * メルカトルでもよい）だが、**同じ関数に渡す点は同じ系**であること。
 *
 * 点は `[x, y]`。多角形は**閉じていない**点列（最後の点と最初の点を結ぶ辺は暗黙）。
 * 反時計回りは y 上向きの数学の向きで判定する（canvas は y 下向きだが、凸包の向きは
 * 見た目に影響しない）。
 */

/** 点として読めるか（座標が有限の [x, y]） */
export function isPoint(point) {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(point[0])
    && Number.isFinite(point[1]);
}

/** 点でなければ TypeError（入口の検査だけに使う。内側のループでは呼ばない） */
function requirePoint(point, label) {
  if (!isPoint(point)) {
    throw new TypeError(`${label} は有限の [x, y] でない: ${JSON.stringify(point)}`);
  }
  return point;
}

/**
 * 外積 `(a − o) × (b − o)`。> 0 なら o→a に対して b は左（反時計回り）側。
 * @returns {number}
 */
export function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * 3 点の向き。`-1` = 時計回り（右）、`0` = 一直線、`1` = 反時計回り（左）。
 * @returns {-1|0|1}
 */
export function orientation(a, b, c) {
  const value = cross(a, b, c);
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/**
 * **単調鎖（Andrew's monotone chain）**による凸包。T3b の凸包層が使う。
 *
 * - 重複点は除く
 * - 辺上に並ぶ中間点は返さない（角だけ）
 * - 3 点未満・すべて一直線のときは「両端」だけを返す（面積 0 の多角形を作らない）
 * - 返す点列は**閉じない**（最後と最初は結ばない）
 *
 * @param {Array<[number, number]>} points
 * @returns {Array<[number, number]>} 反時計回りの凸包（元の点の複製）
 */
export function convexHull(points) {
  if (!Array.isArray(points)) {
    throw new TypeError('convexHull には点の配列を渡す');
  }
  const sorted = points
    .map((point) => requirePoint(point, 'points[i]'))
    .map(([x, y]) => [x, y])
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

  // 重複を落とす（同じ座標が 2 回あると外積が 0 になり、角が潰れる）
  const unique = [];
  for (const point of sorted) {
    const last = unique[unique.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) unique.push(point);
  }
  if (unique.length <= 2) return unique;

  const build = (sequence) => {
    const chain = [];
    for (const point of sequence) {
      // 最後の 2 点と一直線（または右折）なら中間点は凸包の角ではない
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) {
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop(); // 最後の点は次の鎖の始点と重複する
    return chain;
  };

  const lower = build(unique);
  const upper = build([...unique].reverse());
  return lower.concat(upper);
}

/**
 * 点が三角形の**内側または辺上**にあるか。
 *
 * 3 辺について「同じ側にあるか」を見る。辺上（外積 0）は内側として扱う。
 * 三角形が退化（3 点が一直線）しているときは常に `false`（面積のない図形は含まない）。
 *
 * @param {[number, number]} point
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {[number, number]} c
 * @param {number} [eps] 外積の許容差（既定 0 = 厳密）
 */
export function pointInTriangle(point, a, b, c, eps = 0) {
  const d1 = cross(a, b, point);
  const d2 = cross(b, c, point);
  const d3 = cross(c, a, point);

  // 退化した三角形（面積 0）は「含まない」。点が辺の上でも true にしない
  if (d1 === 0 && d2 === 0 && d3 === 0) return false;

  const hasNegative = d1 < -eps || d2 < -eps || d3 < -eps;
  const hasPositive = d1 > eps || d2 > eps || d3 > eps;
  return !(hasNegative && hasPositive);
}

/**
 * 点が線分の上にあるか（端点を含む）。
 *
 * `eps` は**座標の単位**（px なら px、メルカトルなら m 相当）。
 * 既定 0 は厳密比較 ∴ 補間で作った点を判定するときは 1e-6 程度を渡す。
 */
export function pointOnSegment(point, a, b, eps = 0) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]) <= eps;
  const distance = cross(a, b, point) / length; // 直線までの符号付き距離
  if (Math.abs(distance) > eps) return false;
  const dot = (point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1]);
  return dot >= -eps * length && dot <= length * length + eps * length;
}

/**
 * 点が多角形（閉じていない点列）の**内側または境界上**にあるか。
 *
 * 判定は even-odd（ray casting）。境界上は先に `pointOnSegment` で拾う
 * （レイキャストだけだと辺上の点が表裏でぶれる）。
 *
 * @param {[number, number]} point
 * @param {Array<[number, number]>} polygon
 * @param {number} [eps] 境界判定の許容差
 */
export function pointInPolygon(point, polygon, eps = 0) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (pointOnSegment(point, a, b, eps)) return true;
  }

  let inside = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    // y 方向の走査線が跨ぐ辺だけを見る（上端は含めない = 頂点の二重カウントを避ける）
    if ((a[1] > point[1]) !== (b[1] > point[1])) {
      const x = a[0] + ((point[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (x > point[0]) inside = !inside;
    }
  }
  return inside;
}

/**
 * 2 線分が交わるか。**端点が接する場合も交差とみなす**（既定）。
 *
 * 交差判定は向きの符号で行い、共線（一直線）のときは端点が相手の線分上にあるかを見る。
 * `inclusive: false` にすると「端点だけが触れる」ケースを除ける（T11b の跨ぎ判定用）。
 *
 * @param {[number, number]} a1
 * @param {[number, number]} a2
 * @param {[number, number]} b1
 * @param {[number, number]} b2
 * @param {{ inclusive?: boolean }} [options]
 */
export function segmentsIntersect(a1, a2, b1, b2, { inclusive = true } = {}) {
  const d1 = orientation(a1, a2, b1);
  const d2 = orientation(a1, a2, b2);
  const d3 = orientation(b1, b2, a1);
  const d4 = orientation(b1, b2, a2);

  // 互いに反対側にある（proper intersection）
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  if (!inclusive) return false;

  // 共線・端点接触
  if (d1 === 0 && pointOnSegment(b1, a1, a2)) return true;
  if (d2 === 0 && pointOnSegment(b2, a1, a2)) return true;
  if (d3 === 0 && pointOnSegment(a1, b1, b2)) return true;
  if (d4 === 0 && pointOnSegment(a2, b1, b2)) return true;
  return false;
}

/**
 * 多角形の**符号付き**面積（shoelace / 2）。反時計回りで正、時計回りで負。
 * 3 点未満は 0。
 */
export function polygonArea(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/** 点列の外接矩形。空なら `null`。 */
export function boundingBox(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    requirePoint(point, 'points[i]');
    if (point[0] < minX) minX = point[0];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[1] > maxY) maxY = point[1];
  }
  return { minX, minY, maxX, maxY };
}

/** 2 点の距離。 */
export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** 点列の重心（単純平均）。空なら `[NaN, NaN]` ではなく `null`。 */
export function centroidOf(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const point of points) {
    requirePoint(point, 'points[i]');
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}

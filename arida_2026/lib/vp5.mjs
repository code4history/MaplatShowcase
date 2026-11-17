/**
 * 1 点方式／5 点方式の「上下左右 4 点のズレ」— 純関数（m3 T7・要件書 §7 の ①〜⑤）。
 *
 *   import { cornerOffsets } from './lib/vp5.mjs';
 *   const r = cornerOffsets(mt, left.getViewpoint(), [600, 800], vpDst);
 *   r.median1; // 1 点方式の4 点ズレ中央値 [m]
 *
 * **測っているもの**（要件書 §7 の表）:
 *   ① 真値 `m = mt.viewpoint2Mercs(vp, size)`
 *      絵図側ビューポートの中心＋上下左右 4 点（`MERC_CROSSMATRIX`。半径 `floor(min(size)/4)`）を
 *      TIN の順方向で実メルカトル（EPSG:3857）に写した**5 点**。
 *   ② `vp5 = mercs2MercViewpoint(m, size)`
 *      その 5 点から**現代地図側の Viewpoint を組み直した**もの（5 点方式）。
 *   ③ `vp1 = { center: q0, zoom: vpDst.zoom, rotation: vpDst.rotation }`
 *      1 点方式 = **現代地図側の直前のズーム・回転を据え置き、中心だけを写す**。
 *      `q0 = transform(vp.center を絵図ピクセルに直した点, false)`、
 *      `vpDst` = 収録開始時に 5 点方式で 1 回同期した現代地図側の Viewpoint。
 *   ④ 上下左右 4 点のズレ `d_i = ‖mX_i − m_i‖`（i=1..4。m はメルカトル、px 換算は `2^zoom` から）
 *   ⑤ 自動で入った値 `Δzoom` / `Δrot`
 *
 * **5 点方式の `d5` は「実残差」である（正直さの注記・要件書 §7 の「T7 実測後の決定」）**:
 * 5 点から相似変換（中心・ズーム・回転）を組み直して Viewpoint `vp5` を作ると、その `vp5` が
 * 指す 4 点は真値（各点を TIN で写した結果）と一致しない。`d5` は**その差そのもの**で、
 * 定義上 0 にはならない（面を 1 つの相似変換で近似しているため）。それでも 1 点方式より小さい。
 * `residual5` は同じ値の別名として残す（T7 実装時の名前。呼び出し側の互換のため）。
 *
 * **∴ 棒グラフにもゲートにも実値が乗る**（自明な 0 を「精度の証拠」として見せない）。
 * ゲート (iii′) は `median5 < median1 / 3`（要件書 §7）。
 *
 * **Δzoom / Δrot の基準**: 要件書 §7 ⑤ は `vp5.zoom − vp.zoom` と書くが、`vp` は絵図側
 * （仮想メルカトル）で `vp5` は現代地図側（EPSG:3857）∴ そのまま引くと座標系の比（この題材で
 * 約 +12.6）が出るだけで「自動で入った値」にならない。**1 点方式が据え置く値 = `vpDst`** を
 * 基準に `dZoom = vp5.zoom − vpDst.zoom` / `dRot = vp5.rotation − vpDst.rotation` とする。
 * 要件書の記号どおりの差は `dZoomRaw` / `dRotRaw` に残す（監査用）。
 *
 * **DOM を使わない**: vendor の純関数と `sync.mjs` / `mapview.mjs` の純関数だけ。
 * `demos/lib/vp5.test.mjs` が canvas 無しで検査する。
 */

import {
  mercViewpoint2Mercs,
  mercs2MercViewpoint,
} from '../vendor/maplat_transform.js';
import {
  MERC_MAX,
  pixelsPerMercator,
  sysCoord2Xy,
} from './mapview.mjs';
import { normalizeViewpoint, transformPoint } from './sync.mjs';

/** 上下左右（`MERC_CROSSMATRIX` の 1..4 = 上・右・下・左。0 は中心）の通し番号 */
const CORNER_INDEXES = Object.freeze([1, 2, 3, 4]);

/** size を検証する（`sync.mjs` の内部関数と同じ規則。ここでは export しない） */
function requireSize(value) {
  if (!Array.isArray(value) || value.length < 2
    || typeof value[0] !== 'number' || !Number.isFinite(value[0])
    || typeof value[1] !== 'number' || !Number.isFinite(value[1])) {
    throw new TypeError(`size は有限の [width, height]: ${JSON.stringify(value)}`);
  }
  if (value[0] <= 0 || value[1] <= 0) {
    throw new RangeError(`size は正の数: ${value[0]}×${value[1]}`);
  }
  return [value[0], value[1]];
}

/** 角度を (-π, π] に畳む（Δrot 用。`-0` を残さない） */
export function normalizeAngle(angle) {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) {
    throw new TypeError(`角度が有限数でない: ${String(angle)}`);
  }
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/**
 * 4 値の中央値。**偶数個は真ん中 2 つの平均**（要件書 §7 の「中央値」を普通の定義で採る）。
 * 空配列・非数は例外（黙って 0 にしない）。
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('median: 空でない配列を渡す');
  }
  const nums = values.map((v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(`median: 有限数でない値 ${String(v)}`);
    }
    return v;
  });
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * メルカトルの距離 [m] → 画面 px（`2^zoom` から。256px タイルの標準）。
 * `pixelsPerMercator(zoom) = 128·2^zoom / MERC_MAX` を掛けるだけ。
 *
 * @param {number} meters
 * @param {number} zoom
 * @returns {number}
 */
export function metersToPixels(meters, zoom) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) {
    throw new TypeError(`metersToPixels: 距離が有限数でない: ${String(meters)}`);
  }
  return Math.abs(meters) * pixelsPerMercator(zoom);
}

/** 上・右・下・左の「正規の向き」（`viewpoint.ts` `mercs2MercViewpoint` の `normal`。メルカトルは y が北） */
const NORMALS = Object.freeze([[0, 1], [1, 0], [0, -1], [-1, 0]]);

/**
 * 変換後の 5 点から、中心に対する 4 点の距離 dᵢ と角度差 θᵢ を取り出し、その平均で
 * ズームと回転を決める過程を**そのまま**返す（資料 #14 `fivePointView` の dᵢ θᵢ と破線の正方形）。
 *
 * 定義は公開版 `MaplatTransform/src/viewpoint.ts` の `mercs2MercViewpoint` と同じ:
 *   - dᵢ = ‖mᵢ − m₀‖（i = 1..4 = 上・右・下・左）
 *   - θᵢ = 正規の向き nᵢ から (mᵢ − m₀) への角度（外積 > 0 なら負）
 *   - ズーム … 4 点の距離の平均 d̄ から `log2(r·MERC_MAX/128/d̄)`、r = floor(min(w, h)/4)
 *   - 回転 … θᵢ の円周平均 `atan2(Σ sin θᵢ, Σ cos θᵢ)`
 * ∴ 戻り値の `zoom` / `rotation` は `mercs2MercViewpoint(m, size)` と一致する（`vp5.test.mjs`）。
 *
 * @param {Array<[number, number]>} mercs 中心＋上下左右の 5 点（メルカトル）
 * @param {[number, number]} size
 * @returns {{ d: number[], theta: number[], meanD: number, meanTheta: number, radiusPx: number, zoom: number, rotation: number }}
 *   `theta` / `meanTheta` はラジアン
 */
export function fivePointParts(mercs, size) {
  const frame = requireSize(size);
  if (!Array.isArray(mercs) || mercs.length < 5) throw new TypeError('fivePointParts には 5 点を渡す');
  const c = mercs[0];
  const d = [];
  const theta = [];
  let cosx = 0;
  let sinx = 0;
  for (let i = 0; i < 4; i += 1) {
    const dx = mercs[i + 1][0] - c[0];
    const dy = mercs[i + 1][1] - c[1];
    const [nx, ny] = NORMALS[i];
    const abs = Math.hypot(dx, dy);
    const outer = dx * ny - dy * nx;
    const inner = Math.acos(Math.max(-1, Math.min(1, (dx * nx + dy * ny) / abs)));
    const t = outer > 0 ? -inner : inner;
    d.push(abs);
    theta.push(t);
    cosx += Math.cos(t);
    sinx += Math.sin(t);
  }
  const meanD = d.reduce((a, b) => a + b, 0) / 4;
  const meanTheta = Math.atan2(sinx, cosx);
  const radiusPx = Math.floor(Math.min(frame[0], frame[1]) / 4);
  const zoom = Math.log2((radiusPx * MERC_MAX) / 128 / meanD);
  return { d, theta, meanD, meanTheta, radiusPx, zoom, rotation: meanTheta };
}

/**
 * 5 点・2 方式のズレを 1 回ぶん計算する（DOM 無し）。
 *
 * @param {object} mt `MapTransform`（`viewpoint2Mercs` / `getLayerTransform` を持つ）
 * @param {{ center: [number, number], zoom: number, rotation?: number }} vp
 *   **移動後の絵図側 Viewpoint**（仮想メルカトル）
 * @param {[number, number]} size 収録面の [width, height]
 * @param {{ center: [number, number], zoom: number, rotation?: number }} vpDst
 *   収録開始時に 5 点方式で 1 回同期した**現代地図側 Viewpoint**（EPSG:3857）
 * @returns {{
 *   truth: Array<[number, number]>, vp5: object, vp1: object,
 *   d5: number[], d1: number[], median5: number, median1: number,
 *   dZoom: number, dRot: number, dZoomRaw: number, dRotRaw: number,
 *   d5Px: number[], d1Px: number[], median5Px: number, median1Px: number,
 *   corners1: Array<[number, number]>, corners5: Array<[number, number]>,
 *   residual5: number[], medianResidual5: number, q0: [number, number],
 *   pxPerMeter5: number, pxPerMeter1: number
 * }}
 */
export function cornerOffsets(mt, vp, size, vpDst) {
  const view = normalizeViewpoint(vp);
  const frame = requireSize(size);
  const dst = normalizeViewpoint(vpDst);

  if (!mt || typeof mt.viewpoint2Mercs !== 'function' || typeof mt.getLayerTransform !== 'function') {
    throw new TypeError('cornerOffsets には MapTransform（viewpoint2Mercs / getLayerTransform を持つ）を渡す');
  }
  if (typeof mt.maxxy !== 'number' || !Number.isFinite(mt.maxxy) || mt.maxxy <= 0) {
    throw new Error(`cornerOffsets: MapTransform.maxxy が正でない（${String(mt.maxxy)}）`);
  }

  // ① 真値: 絵図側の中心＋上下左右 4 点を実メルカトルへ
  const truth = mt.viewpoint2Mercs(view, frame);
  if (!Array.isArray(truth) || truth.length !== 5) {
    throw new Error(`cornerOffsets: viewpoint2Mercs が 5 点を返さない（${JSON.stringify(truth)}）`);
  }
  for (const [i, point] of truth.entries()) {
    if (!Array.isArray(point) || point.length < 2
      || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new Error(`cornerOffsets: truth[${i}] が有限の [x, y] でない（${JSON.stringify(point)}）`);
    }
  }

  // ② 5 点方式: 5 点から現代地図側の Viewpoint を組み直す（過程 dᵢ θᵢ → 平均 も残す）
  const vp5 = normalizeViewpoint(mercs2MercViewpoint(truth, frame));
  const parts5 = fivePointParts(truth, frame);

  // ③ 1 点方式: 中心だけ写し、ズーム・回転は開始時の現代地図側を据え置く
  const q0 = transformPoint(mt, sysCoord2Xy(view.center, mt.maxxy), false);
  const vp1 = { center: q0, zoom: dst.zoom, rotation: dst.rotation };

  // ④ 上下左右 4 点のズレ。
  // 5 点方式の 4 点は「組み直した vp5 が指す上下左右」= 面を 1 つの相似変換で近似した結果で、
  // 真値（各点を TIN で写した結果）とは一致しない。**この差が実残差 = d5**（定義上 0 にしない）。
  const corners5 = mercViewpoint2Mercs(vp5.center, vp5.zoom, vp5.rotation, frame);
  const d5 = CORNER_INDEXES.map((i) => Math.hypot(
    corners5[i][0] - truth[i][0],
    corners5[i][1] - truth[i][1],
  ));

  // 1 点方式の 4 点は「中心・ズーム・回転」から予測した位置（mercViewpoint2Mercs）
  const corners1 = mercViewpoint2Mercs(vp1.center, vp1.zoom, vp1.rotation, frame);
  const d1 = CORNER_INDEXES.map((i) => Math.hypot(
    corners1[i][0] - truth[i][0],
    corners1[i][1] - truth[i][1],
  ));

  // `residual5` は T7 実装時の名前。**中身は d5 と同じ実残差**（呼び出し側の互換のため残す）
  const residual5 = [...d5];

  const median5 = median(d5);
  const median1 = median(d1);
  const medianResidual5 = median5;

  // px 換算（各方式が使う視点の zoom。`2^zoom` がそのまま尺度）
  const pxPerMeter5 = pixelsPerMercator(vp5.zoom);
  const pxPerMeter1 = pixelsPerMercator(vp1.zoom);
  const d5Px = d5.map((value) => value * pxPerMeter5);
  const d1Px = d1.map((value) => value * pxPerMeter1);

  // ⑤ 自動で入った値（1 点方式が据え置く vpDst との差）。記号どおりの差も残す
  const dZoom = vp5.zoom - dst.zoom;
  const dRot = normalizeAngle(vp5.rotation - dst.rotation);
  const dZoomRaw = vp5.zoom - view.zoom;
  const dRotRaw = normalizeAngle(vp5.rotation - view.rotation);

  return {
    truth,
    parts5,
    vp5,
    vp1,
    d5,
    d1,
    median5,
    median1,
    dZoom,
    dRot,
    dZoomRaw,
    dRotRaw,
    d5Px,
    d1Px,
    median5Px: median(d5Px),
    median1Px: median(d1Px),
    corners1,
    corners5,
    residual5,
    medianResidual5,
    q0: [q0[0], q0[1]],
    pxPerMeter5,
    pxPerMeter1,
  };
}

/**
 * 絵図側 Viewpoint を**画面の中心のまわりで**回し・拡大した Viewpoint（v3.0 DEMO-D の筋書き）。
 * 中心は動かさない（回転も拡大も画面中央を固定する ∴ 中心 1 点の写り先は変わらない）。
 *
 * @param {{ center: [number, number], zoom: number, rotation?: number }} vp
 * @param {number} rotateDeg 度。正＝右回り（canvas の y 下向き系で `rotation` が増える向き＝時計回り）
 * @param {number} [zoomFactor=1] 倍率（2 で 2 倍に拡大＝ズーム +1）
 */
export function turnViewpoint(vp, rotateDeg, zoomFactor = 1) {
  const view = normalizeViewpoint(vp);
  if (typeof rotateDeg !== 'number' || !Number.isFinite(rotateDeg)) {
    throw new TypeError(`turnViewpoint の rotateDeg は有限数: ${String(rotateDeg)}`);
  }
  if (typeof zoomFactor !== 'number' || !Number.isFinite(zoomFactor) || zoomFactor <= 0) {
    throw new RangeError(`turnViewpoint の zoomFactor は正の有限数: ${String(zoomFactor)}`);
  }
  return {
    center: [view.center[0], view.center[1]],
    zoom: view.zoom + Math.log2(zoomFactor),
    rotation: view.rotation + (rotateDeg * Math.PI) / 180,
  };
}

/**
 * 筋書きの各段を終えた時点の絵図側 Viewpoint（段の回転と倍率を順に積む）。`script[i]` に対応する配列を返す。
 * @param {{ center: [number, number], zoom: number, rotation?: number }} vpStart
 * @param {ReadonlyArray<{ rotateDeg?: number, zoomFactor?: number }>} script
 */
export function scriptViewpoints(vpStart, script) {
  if (!Array.isArray(script)) throw new TypeError('scriptViewpoints の script は配列');
  let vp = normalizeViewpoint(vpStart);
  return script.map((step) => {
    vp = turnViewpoint(vp, step.rotateDeg ?? 0, step.zoomFactor ?? 1);
    return vp;
  });
}

/** 予備: メルカトル 1 単位が何 px か（`2^zoom` の定義を 1 箇所に集約） */
export { MERC_MAX };

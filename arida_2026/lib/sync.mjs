/**
 * 2 面同期の純関数部分（m3 T4・計画 §5.1）。
 *
 *   import { syncViewpoint } from './lib/sync.mjs';
 *   const vpModern = syncViewpoint(mt, left.getViewpoint(), size, 'hist2modern');
 *   right.setViewpoint(vpModern, { silent: true });
 *
 * **何をしているか**（`../MaplatTransform/demo/mapsync.ts` の `syncFrom()` と同じ）:
 *   1. 操作側の Viewpoint（古地図なら仮想メルカトル、現代地図なら EPSG:3857）を
 *      `MapTransform.viewpoint2Mercs()` / `mercViewpoint2Mercs()` で **メルカトル 5 点**にする
 *   2. 5 点を `mercs2MercViewpoint()` / `MapTransform.mercs2Viewpoint()` で
 *      受け側の Viewpoint に組み直す
 *
 * 古地図 → 現代地図（`hist2modern`）は順方向 TIN を、現代地図 → 古地図（`modern2hist`）は
 * 逆方向 TIN を通す。同じ三角網を逆向きに読む ∴ strict なら位置は往復で戻る
 * （`transformPoint()` の往復誤差は 1e-9 px 程度。`strict_error` では逆変換が例外）。
 *
 * **ズーム・回転について（正直な注記）**: 5 点を三角網に通すと、三角形ごとにアフィン変換が
 * 違うため 5 点はもはや相似変換の像ではない。`mercs2MercViewpoint()` は 4 点の距離の平均から
 * ズームを、角度の平均から回転を組み直す ∴ 往復で **中心位置は厳密に戻るが、ズーム・回転は
 * わずかに（このデータで 1e-2 程度）ずれる**。位置（絵図ピクセル）の往復が要件なので、
 * `sync.test.mjs` は位置を 1e-6 px で、ズーム・回転は 0.05 以内（実測 1e-2 程度）で検査する。
 *
 * **DOM を使わない**: ブラウザの `MapView` にも Node にも依存しない（vendor の純関数だけ）。
 * `demos/lib/sync.test.mjs` が canvas 無しで検査する。
 */

import {
  mercViewpoint2Mercs,
  mercs2MercViewpoint,
  sysCoord2Xy,
  xy2SysCoord,
} from '../vendor/maplat_transform.js';

/** 古地図（仮想メルカトル）→ 現代地図（EPSG:3857） */
export const SYNC_HIST_TO_MODERN = 'hist2modern';

/** 現代地図（EPSG:3857）→ 古地図（仮想メルカトル） */
export const SYNC_MODERN_TO_HIST = 'modern2hist';

/** 正規の direction。`left2right` / `right2left` は左右 2 面ページ用の別名 */
export const SYNC_DIRECTIONS = Object.freeze([SYNC_HIST_TO_MODERN, SYNC_MODERN_TO_HIST]);

/** 別名 → 正規の direction（demo-a は左右、demo-d は古/現で読み替えられる） */
const DIRECTION_ALIASES = Object.freeze({
  [SYNC_HIST_TO_MODERN]: SYNC_HIST_TO_MODERN,
  [SYNC_MODERN_TO_HIST]: SYNC_MODERN_TO_HIST,
  left2right: SYNC_HIST_TO_MODERN,
  right2left: SYNC_MODERN_TO_HIST,
});

/** 有限の [x, y] か */
function isPoint(value) {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'number' && Number.isFinite(value[0])
    && typeof value[1] === 'number' && Number.isFinite(value[1]);
}

function requirePoint(value, label) {
  if (!isPoint(value)) {
    throw new TypeError(`${label} は有限の [x, y]: ${JSON.stringify(value)}`);
  }
  return [value[0], value[1]];
}

function requireSize(value) {
  if (!isPoint(value) || value.length < 2) {
    throw new TypeError(`size は有限の [width, height]: ${JSON.stringify(value)}`);
  }
  if (value[0] <= 0 || value[1] <= 0) {
    throw new RangeError(`size は正の数: ${value[0]}×${value[1]}`);
  }
  return [value[0], value[1]];
}

/**
 * Viewpoint を検証して複製する（呼び出し側のオブジェクトを書き換えない）。
 * @param {unknown} vp
 * @returns {{ center: [number, number], zoom: number, rotation: number }}
 */
export function normalizeViewpoint(vp) {
  if (!vp || typeof vp !== 'object' || !isPoint(vp.center)) {
    throw new TypeError(`Viewpoint は { center: [x, y], zoom, rotation }: ${JSON.stringify(vp)}`);
  }
  if (typeof vp.zoom !== 'number' || !Number.isFinite(vp.zoom)) {
    throw new TypeError(`Viewpoint.zoom が有限数でない: ${String(vp.zoom)}`);
  }
  const rotation = vp.rotation === undefined ? 0 : vp.rotation;
  if (typeof rotation !== 'number' || !Number.isFinite(rotation)) {
    throw new TypeError(`Viewpoint.rotation が有限数でない: ${String(vp.rotation)}`);
  }
  return { center: [vp.center[0], vp.center[1]], zoom: vp.zoom, rotation };
}

/**
 * 古地図の**画像ピクセル**を 1 点だけ TIN 変換する。
 *
 * `MapTransform` 自体は `transform(xy, backward)` を公開していない ∴ メイン TIN
 * （`getLayerTransform(0)`）の `transform(coord, backward)` を呼ぶ。`strict_error` の
 * データで `backward: true` を渡すと vendor が例外を投げる（`transform.ts:286`）。
 * その例外は**握りつぶさない**（呼び出し側が捕まえて「逆変換を実行しません」と出す）。
 *
 * @param {object} mt `MapTransform`（`getLayerTransform` を持つ）
 * @param {[number, number]} point 画像ピクセル（forward）／メルカトル（backward）
 * @param {boolean} [backward=false]
 * @returns {[number, number]}
 */
export function transformPoint(mt, point, backward = false) {
  const xy = requirePoint(point, 'point');
  if (!mt || typeof mt.getLayerTransform !== 'function') {
    throw new TypeError('transformPoint には MapTransform（getLayerTransform を持つ）を渡す');
  }
  const tin = mt.getLayerTransform(0);
  if (!tin || typeof tin.transform !== 'function') {
    throw new Error('transformPoint: メイン TIN が無い（setMapData() を先に呼ぶ）');
  }
  const result = tin.transform([xy[0], xy[1]], Boolean(backward));
  if (result === false || result === null || !Array.isArray(result)) {
    throw new RangeError(
      `transformPoint: TIN の範囲外（backward=${Boolean(backward)}, point=${JSON.stringify(xy)}）`,
    );
  }
  return [result[0], result[1]];
}

/**
 * 絵図ピクセル `p` を順方向→逆方向に通した往復を測る。
 *
 *   q  = transformPoint(mt, p, false)   … メルカトル
 *   p′ = transformPoint(mt, q, true)    … 絵図ピクセル
 *   errorPx = ‖p′ − p‖₂
 *
 * @param {object} mt
 * @param {[number, number]} imagePoint 絵図ピクセル
 * @returns {{ point: [number, number], merc: [number, number], back: [number, number], errorPx: number }}
 */
export function roundTripImagePoint(mt, imagePoint) {
  const point = requirePoint(imagePoint, 'imagePoint');
  const merc = transformPoint(mt, point, false);
  const back = transformPoint(mt, merc, true);
  return {
    point,
    merc,
    back,
    errorPx: Math.hypot(back[0] - point[0], back[1] - point[1]),
  };
}

/**
 * Viewpoint の中心を**絵図ピクセル**で返す（往復の位置を px で比べるため）。
 * @param {object} mt
 * @param {unknown} vp
 * @returns {[number, number]}
 */
export function viewpointImagePixel(mt, vp) {
  const view = normalizeViewpoint(vp);
  if (!mt || typeof mt.maxxy !== 'number' || !Number.isFinite(mt.maxxy) || mt.maxxy === 0) {
    throw new Error('viewpointImagePixel: MapTransform.maxxy が無い（setMapData() を先に呼ぶ）');
  }
  return sysCoord2Xy(view.center, mt.maxxy);
}

/**
 * 絵図ピクセルを仮想メルカトルのメルカトル座標へ（`xy2SysCoord` の薄いラッパー）。
 * @param {object} mt
 * @param {[number, number]} imagePoint
 * @returns {[number, number]}
 */
export function imagePixelToViewpointCenter(mt, imagePoint) {
  const point = requirePoint(imagePoint, 'imagePoint');
  if (!mt || typeof mt.maxxy !== 'number' || !Number.isFinite(mt.maxxy) || mt.maxxy === 0) {
    throw new Error('imagePixelToViewpointCenter: MapTransform.maxxy が無い（setMapData() を先に呼ぶ）');
  }
  return xy2SysCoord(point, mt.maxxy);
}

/**
 * Viewpoint を反対側の Viewpoint へ写す（2 面同期の本体）。
 *
 * @param {object} mt `MapTransform`（`viewpoint2Mercs` / `mercs2Viewpoint` を持つ）
 * @param {{ center: [number, number], zoom: number, rotation?: number }} vp 操作側の Viewpoint
 * @param {[number, number]} size 収録面の [width, height]（両面で同じ大きさ。5 点の半径に効く）
 * @param {'hist2modern'|'modern2hist'|'left2right'|'right2left'} direction
 * @returns {{ center: [number, number], zoom: number, rotation: number }}
 */
export function syncViewpoint(mt, vp, size, direction) {
  const view = normalizeViewpoint(vp);
  const frame = requireSize(size);
  const canonical = DIRECTION_ALIASES[direction];
  if (!canonical) {
    throw new RangeError(
      `direction は ${SYNC_DIRECTIONS.join(' / ')}（別名 left2right / right2left）: ${String(direction)}`,
    );
  }
  if (!mt || typeof mt.viewpoint2Mercs !== 'function' || typeof mt.mercs2Viewpoint !== 'function') {
    throw new TypeError('syncViewpoint には MapTransform（viewpoint2Mercs / mercs2Viewpoint を持つ）を渡す');
  }

  if (canonical === SYNC_HIST_TO_MODERN) {
    // 古地図の仮想メルカトル →（順方向 TIN）→ 実際のメルカトル 5 点 → 現代地図の Viewpoint
    const mercs = mt.viewpoint2Mercs(view, frame);
    return normalizeViewpoint(mercs2MercViewpoint(mercs, frame));
  }

  // 現代地図の Viewpoint → 実際のメルカトル 5 点 →（逆方向 TIN）→ 古地図の Viewpoint
  const mercs = mercViewpoint2Mercs(view.center, view.zoom, view.rotation, frame);
  return normalizeViewpoint(mt.mercs2Viewpoint(mercs, frame));
}

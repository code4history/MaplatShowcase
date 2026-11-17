/**
 * 地図面 — 古地図（Maplat 格子）と現代地図（地理院 XYZ）を 1 枚の canvas に描く（m3 T3a・計画 §3）。
 *
 *   import { MapView } from './lib/mapview.mjs';
 *   const hist = new MapView(canvas, {
 *     kind: 'hist',
 *     tileUrl: 'https://t.tilemap.jp/maplat/tiles/kaisei_hiroshima_jissoku/{z}/{x}/{y}.jpg',
 *     width: 6743, height: 9020,
 *     attribution: '国際日本文化研究センター蔵',
 *   });
 *   const modern = new MapView(canvas2, {
 *     kind: 'modern',
 *     tileUrl: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
 *     attribution: '地理院タイル',
 *     lonLat: [132.4553, 34.3955], zoom: 13,
 *   });
 *   hist.on('change', (vp) => { syncOtherPane(vp); });   // 同期の中身は T4 の仕事
 *   hist.addOverlay((ctx, view) => { ctx.fillRect(...view.mapToPixel([x, y]), size, size); });
 *
 * **座標系の約束**（`../MaplatTransform/demo/mapsync.ts` と `histmap.ts`/`coord-utils.ts` に合わせる）:
 *   - `Viewpoint.center` は常に**メルカトル座標**（縮尺 20037508.342789244 の系）。
 *     古地図は `xy2SysCoord(px, maxxy)` で仮想メルカトルへ写したもの、現代地図は EPSG:3857 そのもの。
 *   - `pixelToMap` / `mapToPixel` の「map」はこのメルカトル座標、「pixel」は **canvas のビットマップ座標**
 *     （左上原点、y 下向き）。`imagePixelToMap` / `mapToImagePixel` は古地図の**画像ピクセル**との変換。
 *   - `zoom` はメルカトルのズームレベル。1 単位 = `128 × 2^zoom / MERC_MAX` 画面 px（256px タイルの標準）。
 *     古地図でも同じ定義 ∴ 2 面同期（T4）で `viewpoint2Mercs`/`mercs2Viewpoint` にそのまま渡せる。
 *   - `rotation` は **canvas の y 下向き系**での反時計回り（mapsync の `MapViewState.rotation` と同じ向き）。
 *
 * **格子**（要件書 §3）: 古地図は `maxZoom = ceil(max(log2(w/256), log2(h/256)))`・256 px・原点左上、
 * 仮想メルカトルの基準は `maxxy = 2^maxZoom × 256`。ズーム z のタイルは画像の
 * `256 × 2^(maxZoom − z)` px を覆う（`histmap.ts` の `tileUrlFunction` と同じ判定で範囲外を落とす）。
 * 現代地図は標準 XYZ（`x/2^z`, `y/2^z` の正規化メルカトル）。
 *
 * **このモジュールの分担**: DOM が要るのは `MapView` だけで、格子・投影・タイル選択は
 * すべて純関数として export する（`mapview.test.mjs` が canvas 無しで検証する）。
 * 外部タイルを伴う目視は orchestrator が行う（計画 §4.1）。
 */

/** 現代地図のタイルに掛ける CSS filter（v2.8 visual 15: 建物の橙を落とす。canvas の `ctx.filter`） */
export const MODERN_TILE_FILTER = 'saturate(0.35)';

/**
 * 現代地図のタイル 1 枚に `MODERN_TILE_FILTER` を**読み込み時に 1 回だけ**掛けた canvas を返す（v2.9 N1）。
 * v2.8 は描画のたびに `ctx.filter` を掛けていた。headless Chromium ではこれが 1 回の再描画を約 2.4 倍に重くし、
 * デモ②（カーソルの 1 移動ごとに右面を描き直す）で収録の `glide` が字幕の窓を大きく超えて間延びした
 * （帯が変わる前に書き出しの窓が終わった）。canvas が無い環境（Node のテスト）では元の画像をそのまま返す。
 * @param {HTMLImageElement} image
 */
export function desaturatedTile(image) {
  if (typeof document === 'undefined' || !document.createElement) return image;
  try {
    const w = image.naturalWidth || TILE_SIZE;
    const h = image.naturalHeight || TILE_SIZE;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return image;
    g.filter = MODERN_TILE_FILTER;
    g.drawImage(image, 0, 0, w, h);
    return c;
  } catch {
    return image;
  }
}

/** タイル 1 枚の px（Maplat も地理院も 256） */
export const TILE_SIZE = 256;

/** Web メルカトルの東西端（`MaplatTransform/src/constants.ts` と同じ値） */
export const MERC_MAX = 20037508.342789244;

/** 現代地図（地理院 std）のタイル最大ズーム。`maxZoom` を渡せば上書きできる */
export const MODERN_MAX_ZOOM = 18;

/** 数値の範囲制限 */
function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** 有限数であることを確かめる（偽なら例外。**黙って 0 にしない**） */
function requireFinite(value, label) {
  const num = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(num)) {
    throw new TypeError(`${label} が有限数でない: ${String(value)}`);
  }
  return num;
}

// ---------------------------------------------------------------------------
// 古地図の格子（Maplat / histmap.ts:65-67・106）
// ---------------------------------------------------------------------------

/**
 * 古地図の最大ズーム（`maxZoom = ceil(max(log2(w/256), log2(h/256)))`）。
 * **式をそのまま実装する**（正数に丸めない。256px 未満の画像は maxZoom ≤ 0 になる）。
 * @param {number} width 画像幅（px）
 * @param {number} height 画像高さ（px）
 * @returns {number}
 */
export function histMaxZoom(width, height) {
  const w = requireFinite(width, 'width');
  const h = requireFinite(height, 'height');
  if (w <= 0 || h <= 0) {
    throw new RangeError(`画像サイズは正の数: ${w}×${h}`);
  }
  return Math.ceil(Math.max(Math.log2(w / TILE_SIZE), Math.log2(h / TILE_SIZE)));
}

/**
 * 古地図の仮想メルカトル基準 `maxxy = 2^maxZoom × 256`（`histmap.ts:106`）。
 * @param {number} maxZoom
 * @returns {number}
 */
export function histMaxxy(maxZoom) {
  return Math.pow(2, requireFinite(maxZoom, 'maxZoom')) * TILE_SIZE;
}

/**
 * ズーム `tileZoom` のタイル 1 枚が覆う**画像 px**。
 * z = maxZoom で 256 px、1 段下がるごとに 2 倍（`histmap.ts` の `x * 256 * 2^(maxZoom − z)`）。
 * @param {number} tileZoom
 * @param {number} maxZoom
 * @returns {number}
 */
export function histPixelsPerTile(tileZoom, maxZoom) {
  return TILE_SIZE * Math.pow(2, requireFinite(maxZoom, 'maxZoom') - requireFinite(tileZoom, 'tileZoom'));
}

/**
 * 表示ズームから**実際に読むタイルのズーム**を決める（四捨五入・[0, maxZoom] に制限）。
 * 最大ズームを超える表示（オーバーズーム）では maxZoom のタイルを引き伸ばす。
 * @param {number} viewZoom
 * @param {number} maxZoom
 * @returns {number}
 */
export function histTileZoom(viewZoom, maxZoom) {
  const max = Math.max(0, Math.trunc(requireFinite(maxZoom, 'maxZoom')));
  return clamp(Math.round(requireFinite(viewZoom, 'viewZoom')), 0, max);
}

/**
 * 画像ピクセル → タイル番号（原点左上・床関数）。
 * @param {number} x 画像 x（px）
 * @param {number} y 画像 y（px）
 * @param {number} tileZoom
 * @param {number} maxZoom
 * @returns {{ x: number, y: number }}
 */
export function histTileOfPixel(x, y, tileZoom, maxZoom) {
  const size = histPixelsPerTile(tileZoom, maxZoom);
  return {
    x: Math.floor(requireFinite(x, 'x') / size),
    y: Math.floor(requireFinite(y, 'y') / size),
  };
}

/**
 * タイル番号 → 覆う画像矩形（左上と 1 辺）。
 * @returns {{ x: number, y: number, size: number }}
 */
export function histTileRect(tileX, tileY, tileZoom, maxZoom) {
  const size = histPixelsPerTile(tileZoom, maxZoom);
  return {
    x: requireFinite(tileX, 'tileX') * size,
    y: requireFinite(tileY, 'tileY') * size,
    size,
  };
}

/**
 * 画像を覆うタイル数（列 × 行）。縁は部分タイルになる ∴ 切り上げ。
 * @returns {{ cols: number, rows: number }}
 */
export function histTileCount(width, height, tileZoom, maxZoom) {
  const size = histPixelsPerTile(tileZoom, maxZoom);
  return {
    cols: Math.ceil(requireFinite(width, 'width') / size),
    rows: Math.ceil(requireFinite(height, 'height') / size),
  };
}

/**
 * 画像を覆うタイル番号の範囲（両端を含む）。
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
export function histTileRange(width, height, tileZoom, maxZoom) {
  const { cols, rows } = histTileCount(width, height, tileZoom, maxZoom);
  return { minX: 0, maxX: cols - 1, minY: 0, maxY: rows - 1 };
}

/**
 * タイルが画像の範囲に入るか（`histmap.ts` の `tileUrlFunction` と同じ判定）。
 * 範囲外は透明タイル（`transPng`）に相当するので**読まない**。
 * @returns {boolean}
 */
export function histTileExists(tileX, tileY, tileZoom, maxZoom, width, height) {
  const size = histPixelsPerTile(tileZoom, maxZoom);
  const tx = requireFinite(tileX, 'tileX');
  const ty = requireFinite(tileY, 'tileY');
  return (
    tx >= 0
    && ty >= 0
    && tx * size < requireFinite(width, 'width')
    && ty * size < requireFinite(height, 'height')
  );
}

/**
 * タイル番号と**タイル画像の実寸** → 画像 px の描画矩形。
 *
 * タイルサーバは縁のタイルを 256×256 に揃えず**切り詰めて返す**（実測: kaisei の
 * `6/26/35` は 87×60、`2/1/0` は 165×256）。したがって描画先の大きさは
 * `実寸 × 2^(maxZoom − z)` で決める。256 固定で引き伸ばすと縁だけ縮尺がずれて地図が歪む。
 *
 * @param {number} bitmapWidth タイル画像の幅（`naturalWidth`）
 * @param {number} bitmapHeight タイル画像の高さ（`naturalHeight`）
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} tileZoom
 * @param {number} maxZoom
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function histTileDestRect(bitmapWidth, bitmapHeight, tileX, tileY, tileZoom, maxZoom) {
  const tileSize = histPixelsPerTile(tileZoom, maxZoom);
  const ratio = tileSize / TILE_SIZE;
  return {
    x: requireFinite(tileX, 'tileX') * tileSize,
    y: requireFinite(tileY, 'tileY') * tileSize,
    width: requireFinite(bitmapWidth, 'bitmapWidth') * ratio,
    height: requireFinite(bitmapHeight, 'bitmapHeight') * ratio,
  };
}

// ---------------------------------------------------------------------------
// 画像ピクセル ⇄ 仮想メルカトル（MaplatCore/mixin.ts と MaplatTransform/coord-utils.ts）
// ---------------------------------------------------------------------------

/**
 * 古地図の画像ピクセル → 仮想メルカトル。
 * `sysX = x·2M/maxxy − M`、`sysY = M − y·2M/maxxy`（画像 y は下向き、メルカトル y は上向き）。
 * @param {[number, number]} xy
 * @param {number} maxxy
 * @returns {[number, number]}
 */
export function xy2SysCoord(xy, maxxy) {
  if (!Array.isArray(xy) || xy.length < 2) throw new TypeError('xy は [x, y]');
  const max = requireFinite(maxxy, 'maxxy');
  const x = requireFinite(xy[0], 'xy[0]');
  const y = requireFinite(xy[1], 'xy[1]');
  return [
    (x * (2 * MERC_MAX)) / max - MERC_MAX,
    -1 * ((y * (2 * MERC_MAX)) / max - MERC_MAX),
  ];
}

/**
 * 仮想メルカトル → 古地図の画像ピクセル（`xy2SysCoord` の逆）。
 * @param {[number, number]} sysCoord
 * @param {number} maxxy
 * @returns {[number, number]}
 */
export function sysCoord2Xy(sysCoord, maxxy) {
  if (!Array.isArray(sysCoord) || sysCoord.length < 2) throw new TypeError('sysCoord は [x, y]');
  const max = requireFinite(maxxy, 'maxxy');
  const x = requireFinite(sysCoord[0], 'sysCoord[0]');
  const y = requireFinite(sysCoord[1], 'sysCoord[1]');
  return [
    ((x + MERC_MAX) * max) / (2 * MERC_MAX),
    ((-y + MERC_MAX) * max) / (2 * MERC_MAX),
  ];
}

// ---------------------------------------------------------------------------
// ズームと縮尺
// ---------------------------------------------------------------------------

/** 表示ズーム → メルカトル 1 単位あたりの画面 px（256px タイルの標準） */
export function pixelsPerMercator(zoom) {
  return (128 * Math.pow(2, requireFinite(zoom, 'zoom'))) / MERC_MAX;
}

/** メルカトル 1 単位あたりの画面 px → 表示ズーム（`pixelsPerMercator` の逆） */
export function zoomForPixelsPerMercator(pixelsPerUnit) {
  return Math.log2((requireFinite(pixelsPerUnit, 'pixelsPerUnit') * MERC_MAX) / 128);
}

/**
 * 古地図の**画像 px あたりの画面 px** → 表示ズーム（`mapsync.ts` の `stateToViewpoint`）。
 * `scale = 2^zoom × 256 / maxxy` の逆。
 */
export function imageScaleToViewZoom(scale, maxxy) {
  return Math.log2((requireFinite(scale, 'scale') * requireFinite(maxxy, 'maxxy')) / TILE_SIZE);
}

/** 表示ズーム → 古地図の画像 px あたりの画面 px（`mapsync.ts` の `viewpointToState`） */
export function viewZoomToImageScale(zoom, maxxy) {
  return (Math.pow(2, requireFinite(zoom, 'zoom')) * TILE_SIZE) / requireFinite(maxxy, 'maxxy');
}

// ---------------------------------------------------------------------------
// 経緯度 ⇄ メルカトル（現代地図の初期位置用）
// ---------------------------------------------------------------------------

/**
 * 経緯度 → Web メルカトル。
 * @param {[number, number]} lonLat [経度, 緯度]（度）
 * @returns {[number, number]}
 */
export function lonLatToMercator(lonLat) {
  if (!Array.isArray(lonLat) || lonLat.length < 2) throw new TypeError('lonLat は [lon, lat]');
  const lon = requireFinite(lonLat[0], 'lon');
  const lat = clamp(requireFinite(lonLat[1], 'lat'), -85.0511287798066, 85.0511287798066);
  const rad = (lat * Math.PI) / 180;
  return [
    (lon * MERC_MAX) / 180,
    (MERC_MAX / Math.PI) * Math.log(Math.tan(Math.PI / 4 + rad / 2)),
  ];
}

/** Web メルカトル → 経緯度（`lonLatToMercator` の逆） */
export function mercatorToLonLat(merc) {
  if (!Array.isArray(merc) || merc.length < 2) throw new TypeError('merc は [x, y]');
  const x = requireFinite(merc[0], 'merc[0]');
  const y = requireFinite(merc[1], 'merc[1]');
  return [
    (x * 180) / MERC_MAX,
    ((2 * Math.atan(Math.exp((y * Math.PI) / MERC_MAX)) - Math.PI / 2) * 180) / Math.PI,
  ];
}

// ---------------------------------------------------------------------------
// 現代地図の XYZ 格子
// ---------------------------------------------------------------------------

/**
 * メルカトル座標 → XYZ のタイル番号（`{z}/{x}/{y}`）。
 * 世界の外（y < 0 や y ≥ 2^z）も返す ∴ 呼び出し側が捨てる。x の巻き戻しもしない。
 * @param {[number, number]} merc
 * @param {number} z
 * @returns {{ x: number, y: number }}
 */
export function modernTileOfMercator(merc, z) {
  if (!Array.isArray(merc) || merc.length < 2) throw new TypeError('merc は [x, y]');
  const zoom = requireFinite(z, 'z');
  const n = Math.pow(2, zoom);
  const wx = (requireFinite(merc[0], 'merc[0]') + MERC_MAX) / (2 * MERC_MAX);
  const wy = (MERC_MAX - requireFinite(merc[1], 'merc[1]')) / (2 * MERC_MAX);
  return { x: Math.floor(wx * n), y: Math.floor(wy * n) };
}

/**
 * XYZ のタイル番号 → 覆うメルカトル矩形。
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
export function modernTileMercBounds(tileX, tileY, z) {
  const n = Math.pow(2, requireFinite(z, 'z'));
  const span = (2 * MERC_MAX) / n;
  const minX = requireFinite(tileX, 'tileX') * span - MERC_MAX;
  const maxY = MERC_MAX - requireFinite(tileY, 'tileY') * span;
  return { minX, maxX: minX + span, minY: maxY - span, maxY };
}

// ---------------------------------------------------------------------------
// タイル URL
// ---------------------------------------------------------------------------

/**
 * タイル URL の雛形を検証する。`{z}/{x}/{y}` の 3 つが揃っていない雛形は**別の URL を指す**ので拒否する。
 * @param {unknown} template
 * @returns {string}
 */
export function validateTileTemplate(template) {
  if (typeof template !== 'string' || template.length === 0) {
    throw new TypeError(`タイル URL が文字列でない: ${String(template)}`);
  }
  for (const key of ['{z}', '{x}', '{y}']) {
    if (!template.includes(key)) {
      throw new Error(`タイル URL に ${key} が無い: ${template}`);
    }
  }
  return template;
}

/**
 * `{z}/{x}/{y}` を差し替える。**テンプレートは検証済み**を前提とする（`validateTileTemplate`）。
 * @param {string} template
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function tileUrlFrom(template, z, x, y) {
  return validateTileTemplate(template)
    .replace(/\{z\}/g, String(z))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y));
}

// ---------------------------------------------------------------------------
// 投影（canvas ピクセル ⇄ メルカトル）
// ---------------------------------------------------------------------------

/**
 * メルカトル → canvas ピクセル（左上原点・y 下向き）。
 * `rotation` は mapsync の `xyToCanvas` と同じ向き（y 下向き系の反時計回り）。
 * @param {[number, number]} map
 * @param {{ center: [number, number], zoom: number, rotation?: number, size: [number, number] }} frame
 * @returns {[number, number]}
 */
export function mapToScreen(map, { center, zoom, rotation = 0, size }) {
  if (!Array.isArray(map) || map.length < 2) throw new TypeError('map は [x, y]');
  const s = pixelsPerMercator(zoom);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = requireFinite(map[0], 'map[0]') - center[0];
  const dy = requireFinite(map[1], 'map[1]') - center[1];
  return [
    size[0] / 2 + s * (cos * dx + sin * dy),
    size[1] / 2 + s * (sin * dx - cos * dy),
  ];
}

/**
 * canvas ピクセル → メルカトル（`mapToScreen` の逆）。
 * @param {[number, number]} pixel
 * @param {{ center: [number, number], zoom: number, rotation?: number, size: [number, number] }} frame
 * @returns {[number, number]}
 */
export function screenToMap(pixel, { center, zoom, rotation = 0, size }) {
  if (!Array.isArray(pixel) || pixel.length < 2) throw new TypeError('pixel は [x, y]');
  const s = pixelsPerMercator(zoom);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const ux = (requireFinite(pixel[0], 'pixel[0]') - size[0] / 2) / s;
  const uy = (requireFinite(pixel[1], 'pixel[1]') - size[1] / 2) / s;
  return [
    center[0] + cos * ux + sin * uy,
    center[1] + sin * ux - cos * uy,
  ];
}

// ---------------------------------------------------------------------------
// 出典の文言
// ---------------------------------------------------------------------------

/**
 * データの `title`（`{ja, en}` か文字列）から出典に使う 1 行を採る。
 * @param {unknown} title
 * @returns {string}
 */
export function titleText(title) {
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object') {
    for (const key of ['ja', 'en']) {
      if (typeof title[key] === 'string' && title[key].length > 0) return title[key];
    }
    for (const value of Object.values(title)) {
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

/**
 * ドラッグの種類。Shift＋ドラッグは回転、ただし `rotatable: false` の面では回転せず移動にする
 * （DEMO-B は回転を使わない。2026-11-01 発表者の指摘）。
 * @param {boolean} shiftKey
 * @param {boolean} [rotatable=true]
 * @returns {'rotate'|'pan'}
 */
export function dragModeOf(shiftKey, rotatable = true) {
  return shiftKey && rotatable ? 'rotate' : 'pan';
}

/**
 * ホイールの種類。既定はズームで、**`wheelRotate: true` の面だけ** Shift＋ホイールで回転する
 * （v3.0 DEMO-D: 絵図を回して見せる。他のデモの Shift＋ホイールはズームのまま）。
 * @param {boolean} shiftKey
 * @param {boolean} [rotatable=true]
 * @param {boolean} [wheelRotate=false]
 * @returns {'rotate'|'zoom'}
 */
export function wheelModeOf(shiftKey, rotatable = true, wheelRotate = false) {
  return shiftKey && rotatable && wheelRotate ? 'rotate' : 'zoom';
}

/** Shift＋ホイール 1 ノッチ（deltaY = 100）で回す角度（度） */
export const WHEEL_ROTATE_DEG = 15;

/** `MapView` が受け付けるイベント */
const EVENT_TYPES = Object.freeze(['change', 'draw']);

/** canvas の寸法が 0 のときに使う仮の大きさ（レイアウト前でも初期ズームを壊さない） */
const FALLBACK_SIZE = [600, 800];

/**
 * 地図面の 1 枚。canvas 1 つにつき 1 インスタンス。
 *
 * 主な API:
 *   - `setViewpoint(vp)` / `getViewpoint()` … `{ center:[x,y](メルカトル), zoom, rotation }`
 *   - `pixelToMap([px,py])` / `mapToPixel([x,y])` … canvas ピクセル ⇄ メルカトル
 *   - `imagePixelToMap([px,py])` / `mapToImagePixel([x,y])` … 古地図の画像ピクセル ⇄ メルカトル
 *   - `on('change'|'draw', fn)` … 同期（T4）と HUD 更新用。戻り値は解除関数
 *   - `addOverlay(fn(ctx, view))` … 補助描画のフック（T3b の三角網がここに描く）
 *   - `ready({ minTiles, timeoutMs })` … タイルが 1 枚以上描画されるまで待つ（収録前の assert 用）
 *   - `resize(width, height, dpr)` … ページ側のレイアウト変更を反映
 */
export class MapView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   kind: 'hist'|'modern',
   *   tileUrl: string,
   *   width?: number, height?: number,
   *   attribution?: string, title?: unknown,
   *   viewpoint?: { center: [number, number], zoom: number, rotation?: number },
   *   center?: [number, number], lonLat?: [number, number], zoom?: number,
   *   maxZoom?: number, minZoom?: number, maxViewZoom?: number,
   *   dpr?: number, background?: string,
   *   rotatable?: boolean,   // 既定 true。false で Shift＋ドラッグの回転を切る（移動になる）
   *   wheelRotate?: boolean, // 既定 false。true で Shift＋ホイールを回転にする（rotatable のときだけ）
   * }} options
   */
  constructor(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new TypeError('canvas（getContext を持つ要素）が要る');
    }
    const kind = options.kind;
    if (kind !== 'hist' && kind !== 'modern') {
      throw new TypeError(`kind は 'hist' か 'modern': ${String(kind)}`);
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.kind = kind;
    this.tileUrl = validateTileTemplate(options.tileUrl);
    this.imageWidth = kind === 'hist' ? requireFinite(options.width, 'width') : null;
    this.imageHeight = kind === 'hist' ? requireFinite(options.height, 'height') : null;
    if (kind === 'hist' && (this.imageWidth <= 0 || this.imageHeight <= 0)) {
      throw new RangeError(`古地図の width/height は正の数: ${this.imageWidth}×${this.imageHeight}`);
    }

    // 古地図は Maplat 格子（要件書 §3）、現代地図は XYZ のタイル最大ズーム
    this.maxZoom = kind === 'hist'
      ? histMaxZoom(this.imageWidth, this.imageHeight)
      : (Number.isFinite(options.maxZoom) ? Math.trunc(options.maxZoom) : MODERN_MAX_ZOOM);
    this.maxxy = kind === 'hist' ? histMaxxy(this.maxZoom) : null;
    this.minZoom = Number.isFinite(options.minZoom)
      ? options.minZoom
      : (kind === 'hist' ? -2 : 1);
    this.maxViewZoom = Number.isFinite(options.maxViewZoom)
      ? options.maxViewZoom
      : this.maxZoom + (kind === 'hist' ? 3 : 2);

    this.dpr = Number.isFinite(options.dpr) && options.dpr > 0 ? options.dpr : 1;
    this.rotatable = options.rotatable !== false;
    this.wheelRotate = options.wheelRotate === true;
    this.background = typeof options.background === 'string'
      ? options.background
      : (kind === 'hist' ? '#e7dcc4' : '#dfe6ee');
    this.attribution = typeof options.attribution === 'string' && options.attribution.length > 0
      ? options.attribution
      : (kind === 'modern' ? '地理院タイル' : titleText(options.title) || '古地図');

    /** @type {Map<string, { status: 'loading'|'loaded'|'error', image: HTMLImageElement|null }>} */
    this.tileCache = new Map();
    /** @type {Array<(ctx: CanvasRenderingContext2D, view: object) => void>} */
    this.overlays = [];
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
    /** 直近の描画で `drawImage` できたタイル数（要件書 §3 の「空撮りを防ぐ」） */
    this.drawnTiles = 0;
    this._readyWaiters = [];
    this._drag = null;
    this._destroyed = false;

    this.viewpoint = this._initialViewpoint(options);
    this._bindInput();
    this.draw();
  }

  // --- ビューポイント -------------------------------------------------------

  /** 初期表示（`viewpoint` 指定 → 古地図は画像にフィット／現代地図は center/zoom） */
  _initialViewpoint(options) {
    if (options.viewpoint && typeof options.viewpoint === 'object') {
      return this._normalizeViewpoint(options.viewpoint);
    }
    const zoom = Number.isFinite(options.zoom) ? options.zoom : null;
    if (this.kind === 'hist') {
      const size = this._canvasSize();
      const fit = Math.min(size[0] / this.imageWidth, size[1] / this.imageHeight) * 0.94;
      return {
        center: xy2SysCoord([this.imageWidth / 2, this.imageHeight / 2], this.maxxy),
        zoom: Number.isFinite(zoom) ? zoom : imageScaleToViewZoom(fit, this.maxxy),
        rotation: 0,
      };
    }
    const center = Array.isArray(options.center)
      ? options.center
      : (Array.isArray(options.lonLat) ? lonLatToMercator(options.lonLat) : [0, 0]);
    return {
      center: [requireFinite(center[0], 'center[0]'), requireFinite(center[1], 'center[1]')],
      zoom: Number.isFinite(zoom) ? zoom : 12,
      rotation: 0,
    };
  }

  /** Viewpoint を検証して複製する（呼び出し側のオブジェクトを書き換えない） */
  _normalizeViewpoint(vp) {
    if (!vp || typeof vp !== 'object' || !Array.isArray(vp.center) || vp.center.length < 2) {
      throw new TypeError('Viewpoint は { center: [x, y], zoom, rotation }');
    }
    return {
      center: [
        requireFinite(vp.center[0], 'viewpoint.center[0]'),
        requireFinite(vp.center[1], 'viewpoint.center[1]'),
      ],
      zoom: requireFinite(vp.zoom, 'viewpoint.zoom'),
      rotation: Number.isFinite(vp.rotation) ? vp.rotation : 0,
    };
  }

  /**
   * ビューポイントを差し替える（同期 T4 の受け側）。`silent: true` で `change` を出さない。
   * @param {{ center: [number, number], zoom: number, rotation?: number }} vp
   * @param {{ silent?: boolean }} [options]
   */
  setViewpoint(vp, { silent = false } = {}) {
    this.viewpoint = this._normalizeViewpoint(vp);
    this.draw();
    if (!silent) this._emit('change', this.getViewpoint());
  }

  /** 現在のビューポイント（複製）。center はメルカトル座標 */
  getViewpoint() {
    return {
      center: [this.viewpoint.center[0], this.viewpoint.center[1]],
      zoom: this.viewpoint.zoom,
      rotation: this.viewpoint.rotation,
    };
  }

  // --- 座標変換 -------------------------------------------------------------

  /** canvas ピクセル → メルカトル（古地図は仮想メルカトル） */
  pixelToMap(pixel) {
    return screenToMap(pixel, this._frame());
  }

  /** メルカトル → canvas ピクセル */
  mapToPixel(map) {
    return mapToScreen(map, this._frame());
  }

  /**
   * 古地図の**画像ピクセル** → メルカトル。現代地図には画像座標が無い ∴ 例外。
   * @param {[number, number]} pixel
   * @returns {[number, number]}
   */
  imagePixelToMap(pixel) {
    this._assertHist('imagePixelToMap');
    return xy2SysCoord(pixel, this.maxxy);
  }

  /** メルカトル → 古地図の画像ピクセル（`imagePixelToMap` の逆） */
  mapToImagePixel(map) {
    this._assertHist('mapToImagePixel');
    return sysCoord2Xy(map, this.maxxy);
  }

  /** 古地図の画像ピクセル → canvas ピクセル（T3b の描画層が使う） */
  imageToScreen(pixel) {
    this._assertHist('imageToScreen');
    return this.mapToPixel(xy2SysCoord(pixel, this.maxxy));
  }

  /** canvas ピクセル → 古地図の画像ピクセル */
  screenToImage(pixel) {
    this._assertHist('screenToImage');
    return sysCoord2Xy(this.pixelToMap(pixel), this.maxxy);
  }

  _assertHist(method) {
    if (this.kind !== 'hist') {
      throw new Error(`${method} は古地図（kind: 'hist'）だけで使える`);
    }
  }

  /** `mapToScreen`/`screenToMap` に渡す現在の枠 */
  _frame() {
    return {
      center: this.viewpoint.center,
      zoom: this.viewpoint.zoom,
      rotation: this.viewpoint.rotation,
      size: this._canvasSize(),
    };
  }

  /** canvas のビットマップ寸法（0 のときは仮の値。レイアウト前でも NaN を作らない） */
  _canvasSize() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return [
      Number.isFinite(w) && w > 0 ? w : FALLBACK_SIZE[0],
      Number.isFinite(h) && h > 0 ? h : FALLBACK_SIZE[1],
    ];
  }

  // --- 描画座標（y 下向き） -------------------------------------------------

  /** 表示用の「世界座標」の縮尺（画面 px / 世界単位） */
  _worldScale() {
    return this.kind === 'hist'
      ? viewZoomToImageScale(this.viewpoint.zoom, this.maxxy)
      : TILE_SIZE * Math.pow(2, this.viewpoint.zoom);
  }

  /**
   * 世界座標。古地図 = 画像ピクセル（左上原点）、現代地図 = 正規化メルカトル
   * （左上が [-M, M]、右下が [M, -M]、y 下向き）。描画変換を単純にするための内部系。
   */
  _worldFromMap(map) {
    if (this.kind === 'hist') return sysCoord2Xy(map, this.maxxy);
    return [
      (map[0] + MERC_MAX) / (2 * MERC_MAX),
      (MERC_MAX - map[1]) / (2 * MERC_MAX),
    ];
  }

  _centerWorld() {
    return this._worldFromMap(this.viewpoint.center);
  }

  /** 画面ピクセル → 世界座標（回転の逆変換。`_visibleWorldRect` と pan/zoom が使う） */
  _screenToWorld(pixel) {
    const [w, h] = this._canvasSize();
    const cw = this._centerWorld();
    const s = this._worldScale();
    const cos = Math.cos(this.viewpoint.rotation);
    const sin = Math.sin(this.viewpoint.rotation);
    const ux = (pixel[0] - w / 2) / s;
    const uy = (pixel[1] - h / 2) / s;
    return [cw[0] + cos * ux + sin * uy, cw[1] - sin * ux + cos * uy];
  }

  // --- タイル ---------------------------------------------------------------

  /**
   * タイルの画像を返す（無ければ読み込みを始める）。**完了時に再描画**する。
   * @param {string} key キャッシュキー
   * @param {string} url
   * @returns {{ status: 'loading'|'loaded'|'error', image: HTMLImageElement|null }}
   */
  _tile(key, url) {
    let entry = this.tileCache.get(key);
    if (entry) return entry;
    entry = { status: 'loading', image: null };
    this.tileCache.set(key, entry);
    if (typeof Image !== 'function') {
      // Node（テスト）では画像を読まない。描画は 0 枚のまま
      entry.status = 'error';
      return entry;
    }
    const image = new Image();
    image.onload = () => {
      entry.status = 'loaded';
      entry.image = image;
      if (this.kind !== 'hist') entry.drawable = desaturatedTile(image);
      this.draw();
    };
    image.onerror = () => {
      entry.status = 'error';
      this.draw();
    };
    entry.image = image;
    image.src = url;
    return entry;
  }

  /**
   * 実際に読むタイルのズーム（表示ズームの四捨五入・タイル最大で頭打ち）。
   * dpr 2 の画面ではビットマップが 2 倍細かい ∴ `log2(dpr)` だけ上を読んで精細さを揃える
   * （dpr 1 の収録面では従来どおり）。
   */
  _tileZoom() {
    const zoom = this.viewpoint.zoom + Math.log2(this.dpr > 0 ? this.dpr : 1);
    if (this.kind === 'hist') return histTileZoom(zoom, this.maxZoom);
    return clamp(Math.round(zoom), 0, this.maxZoom);
  }

  /** 画面に入る世界座標の矩形（回転を含む ∴ 4 隅の外接矩形） */
  _visibleWorldRect() {
    const [w, h] = this._canvasSize();
    const corners = [[0, 0], [w, 0], [0, h], [w, h]].map((p) => this._screenToWorld(p));
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  /** タイルを描く（読めていないタイルは次の描画で埋まる） */
  _drawTiles(ctx) {
    const [w, h] = this._canvasSize();
    const s = this._worldScale();
    if (!(s > 0) || !(w > 0) || !(h > 0)) return 0;

    const z = this._tileZoom();
    const rect = this._visibleWorldRect();
    const cw = this._centerWorld();

    // 画面が地図の外を向いているときは 1 枚も描かない（`drawnTiles` を「空撮り」と誤認させない）
    if (this.kind === 'hist') {
      if (rect.maxX < 0 || rect.maxY < 0 || rect.minX > this.imageWidth || rect.minY > this.imageHeight) {
        return 0;
      }
    } else if (rect.maxY < 0 || rect.minY > 1) {
      return 0;
    }

    /**
     * v3.4（2026-11-08 人間の指摘「中心が振動する」）: 拡大・平行移動は **canvas の変換行列に載せない**。
     * canvas 2D の行列は実装上 float32 で、現代地図の world 座標（0〜1 に正規化）を `scale(s)`（ズーム 19 で
     * 約 1.3 億倍）で拡大すると、中心 0.86 の丸め誤差（約 6e-8）が数画素に化け、回転や中心が少し変わるたびに
     * 誤差が変わって地図が跳ぶ（左面は画像 px 座標 ∴ 起きない）。∴ 各タイルの位置と大きさを JS（倍精度）で
     * 画面 px に直してから描き、行列は中心への平行移動と回転だけにする。
     */
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(this.viewpoint.rotation);
    const px = (x, y) => [(x - cw[0]) * s, (y - cw[1]) * s];

    let drawn = 0;
    // タイル境界の継ぎ目を隠すため 1 画面 px だけ広げて描く
    const eps = 0.75;

    if (this.kind === 'hist') {
      const tileSize = histPixelsPerTile(z, this.maxZoom);
      const { cols, rows } = histTileCount(this.imageWidth, this.imageHeight, z, this.maxZoom);
      const minX = clamp(Math.floor(rect.minX / tileSize), 0, cols - 1);
      const maxX = clamp(Math.floor(rect.maxX / tileSize), 0, cols - 1);
      const minY = clamp(Math.floor(rect.minY / tileSize), 0, rows - 1);
      const maxY = clamp(Math.floor(rect.maxY / tileSize), 0, rows - 1);
      for (let ty = minY; ty <= maxY; ty += 1) {
        for (let tx = minX; tx <= maxX; tx += 1) {
          if (!histTileExists(tx, ty, z, this.maxZoom, this.imageWidth, this.imageHeight)) continue;
          const entry = this._tile(`h:${z}/${tx}/${ty}`, tileUrlFrom(this.tileUrl, z, tx, ty));
          if (entry.status !== 'loaded' || !entry.image) continue;
          const image = entry.image;
          // 縁のタイルは 256×256 より小さい ∴ 実寸 × 倍率で置く（`histTileDestRect`）
          const dest = histTileDestRect(
            image.naturalWidth || TILE_SIZE,
            image.naturalHeight || TILE_SIZE,
            tx, ty, z, this.maxZoom,
          );
          const [dx, dy] = px(dest.x, dest.y);
          ctx.drawImage(image, dx, dy, dest.width * s + eps, dest.height * s + eps);
          drawn += 1;
        }
      }
    } else {
      /**
       * 現代地図のタイルだけ彩度を落とす（v2.8 見た目のレビュー visual 15）。地理院タイルの建物の橙が、
       * デモの着目の橙（軌跡・破線の正方形）とぶつかっていた。補助描画（三角網・印）は `restore()` の後に
       * 描かれる ∴ この filter は掛からない。絵図の面（hist）は触らない。
       */
      // v2.9（N1）: filter は読み込み時に 1 回だけ掛けた `entry.drawable` を使う（描画のたびに ctx.filter を掛けない）
      const n = Math.pow(2, z);
      const span = 1 / n;
      const minCol = Math.floor(rect.minX / span);
      const maxCol = Math.floor(rect.maxX / span);
      const minRow = clamp(Math.floor(rect.minY / span), 0, n - 1);
      const maxRow = clamp(Math.floor(rect.maxY / span), 0, n - 1);
      // 世界 1 周より広く見えているときは重複描画を避ける
      const colCount = Math.min(maxCol - minCol + 1, n);
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let i = 0; i < colCount; i += 1) {
          const col = minCol + i;
          const wrapped = ((col % n) + n) % n;
          const entry = this._tile(`m:${z}/${wrapped}/${row}`, tileUrlFrom(this.tileUrl, z, wrapped, row));
          if (entry.status !== 'loaded' || !entry.image) continue;
          const [dx, dy] = px(col * span, row * span);
          ctx.drawImage(entry.drawable ?? entry.image, dx, dy, span * s + eps, span * s + eps);
          drawn += 1;
        }
      }
    }

    ctx.restore();
    return drawn;
  }

  // --- 出典・補助描画 -------------------------------------------------------

  /** 右下に「地理院タイル」等を常時描く（要件書 §3） */
  _drawAttribution(ctx) {
    const text = this.attribution;
    if (!text) return;
    const [w, h] = this._canvasSize();
    const fontSize = Math.max(11, Math.round(13 * this.dpr));
    const padX = Math.round(6 * this.dpr);
    const padY = Math.round(3 * this.dpr);
    const margin = Math.round(8 * this.dpr);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${fontSize}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const metrics = ctx.measureText ? ctx.measureText(text) : { width: text.length * fontSize };
    const x = w - margin;
    const y = h - margin;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
    ctx.fillRect(x - metrics.width - padX, y - fontSize - padY, metrics.width + padX * 2, fontSize + padY * 2);
    ctx.fillStyle = '#1b2230';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** 補助描画（T3b）。`fn(ctx, view)` を登録順に呼ぶ */
  addOverlay(fn) {
    if (typeof fn !== 'function') throw new TypeError('addOverlay には関数を渡す');
    this.overlays.push(fn);
    this.draw();
    return () => {
      const index = this.overlays.indexOf(fn);
      if (index >= 0) this.overlays.splice(index, 1);
      this.draw();
    };
  }

  /** 登録済みの補助描画をすべて外す */
  clearOverlays() {
    this.overlays.length = 0;
    this.draw();
  }

  /**
   * 補助描画へ渡す読み取り用の view オブジェクト（毎描画ごとに作る）。
   *
   * 座標変換は 3 組:
   *   - `mapToPixel` / `pixelToMap` … メルカトル ⇄ canvas ピクセル
   *   - `imagePixelToMap` / `mapToImagePixel` … 古地図の画像ピクセル ⇄ メルカトル（`kind: 'hist'` のみ）
   *   - `imageToScreen` / `screenToImage` … 古地図の画像ピクセル ⇄ canvas ピクセル（`kind: 'hist'` のみ）
   *
   * `ctx` は変換なし（左上原点・canvas ピクセル）で渡す ∴ 線の太さや文字は画面 px で指定する。
   * 描き直しが要るとき（アニメーション等）は `requestDraw()` を呼ぶ。
   */
  _viewObject() {
    const [w, h] = this._canvasSize();
    return {
      kind: this.kind,
      canvas: this.canvas,
      ctx: this.ctx,
      width: w,
      height: h,
      dpr: this.dpr,
      center: [this.viewpoint.center[0], this.viewpoint.center[1]],
      zoom: this.viewpoint.zoom,
      rotation: this.viewpoint.rotation,
      scale: this._worldScale(),
      maxZoom: this.maxZoom,
      maxxy: this.maxxy,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      mapToPixel: (map) => this.mapToPixel(map),
      pixelToMap: (pixel) => this.pixelToMap(pixel),
      imagePixelToMap: (pixel) => this.imagePixelToMap(pixel),
      mapToImagePixel: (map) => this.mapToImagePixel(map),
      imageToScreen: (pixel) => this.imageToScreen(pixel),
      screenToImage: (pixel) => this.screenToImage(pixel),
      requestDraw: () => this.draw(),
    };
  }

  // --- 描画 -----------------------------------------------------------------

  /** 全部描き直す。読み込み済みタイルの枚数を `drawnTiles` と `window.__demoTiles[canvas.id]` に出す */
  draw() {
    if (this._destroyed) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const [w, h] = this._canvasSize();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, w, h);

    this.drawnTiles = this._drawTiles(ctx);

    if (this.overlays.length > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const view = this._viewObject();
      for (const overlay of this.overlays) {
        try {
          overlay(ctx, view);
        } catch (error) {
          // 1 枚の補助描画が壊れても地図は描き続ける（原因は console に残す）
          console.error('MapView: overlay が例外を投げた', error);
        }
      }
    }

    this._drawAttribution(ctx);
    this._publishTileCount();
    this._flushReadyWaiters();
    this._emit('draw', this.getViewpoint());
  }

  /** `window.__demoTiles[canvas.id]`（収録時の確認用） */
  _publishTileCount() {
    if (typeof window === 'undefined') return;
    if (!window.__demoTiles || typeof window.__demoTiles !== 'object') {
      window.__demoTiles = {};
    }
    const key = this.canvas.id || 'mapview';
    window.__demoTiles[key] = this.drawnTiles;
  }

  /**
   * タイルが `minTiles` 枚以上描画されるまで待つ（要件書 §3「空撮りを防ぐ」）。
   * `timeoutMs > 0` なら超えた時点で **reject** する（収録を無限に待たせない）。
   * 引数は number（枚数）でも object でもよい。
   * @param {{ minTiles?: number, timeoutMs?: number }|number} [options]
   * @returns {Promise<number>} 描画済みタイル数
   */
  ready(options = {}) {
    const { minTiles = 1, timeoutMs = 15000 } = typeof options === 'number'
      ? { minTiles: options }
      : options;
    if (this.drawnTiles >= minTiles) return Promise.resolve(this.drawnTiles);
    return new Promise((resolve, reject) => {
      const waiter = { min: minTiles, resolve, timer: null };
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this._readyWaiters.indexOf(waiter);
          if (index >= 0) this._readyWaiters.splice(index, 1);
          reject(new Error(`タイルが ${minTiles} 枚描画されない（${timeoutMs}ms 経過）`));
        }, timeoutMs);
      }
      this._readyWaiters.push(waiter);
    });
  }

  _flushReadyWaiters() {
    if (this._readyWaiters.length === 0) return;
    const remaining = [];
    for (const waiter of this._readyWaiters) {
      if (this.drawnTiles >= waiter.min) {
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.resolve(this.drawnTiles);
      } else {
        remaining.push(waiter);
      }
    }
    this._readyWaiters = remaining;
  }

  // --- イベント -------------------------------------------------------------

  /**
   * `'change'`（ビューポイントが動いた）と `'draw'`（描き直した）を購読する。
   * @param {'change'|'draw'} type
   * @param {(viewpoint: { center: [number, number], zoom: number, rotation: number }) => void} fn
   * @returns {() => void} 解除関数
   */
  on(type, fn) {
    if (!EVENT_TYPES.includes(type)) {
      throw new Error(`イベントは ${EVENT_TYPES.join(' / ')}: ${String(type)}`);
    }
    if (typeof fn !== 'function') throw new TypeError('on には関数を渡す');
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  /** 購読を外す */
  off(type, fn) {
    const set = this.listeners.get(type);
    if (set) set.delete(fn);
  }

  _emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (error) {
        console.error(`MapView: ${type} の購読者が例外を投げた`, error);
      }
    }
  }

  // --- 入力（ドラッグ・ホイール） -------------------------------------------

  /** 画面の CSS px をビットマップ px に直す（dpr が 2 でも座標がずれない） */
  _eventToCanvas(event) {
    const rect = this.canvas.getBoundingClientRect
      ? this.canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: this.canvas.width, height: this.canvas.height };
    const sx = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? this.canvas.height / rect.height : 1;
    return [(event.clientX - rect.left) * sx, (event.clientY - rect.top) * sy];
  }

  _bindInput() {
    const canvas = this.canvas;
    if (!canvas.addEventListener) return;

    this._onWheel = (event) => {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      const pixel = this._eventToCanvas(event);
      // deltaMode（0=px / 1=行 / 2=ページ）を px に直す。既定は px。
      const unit = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? this._canvasSize()[1] : 1);
      if (wheelModeOf(event.shiftKey, this.rotatable, this.wheelRotate) === 'rotate') {
        // macOS の Chromium は Shift＋ホイールを横スクロール（deltaX）に変える ∴ 縦が 0 なら横を使う
        const delta = (event.deltaY || event.deltaX || 0) * unit;
        const notches = clamp(delta / 100, -3, 3);
        this.viewpoint.rotation += (notches * WHEEL_ROTATE_DEG * Math.PI) / 180;
        this.draw();
        this._emit('change', this.getViewpoint());
        return;
      }
      // 1 ノッチ（deltaY = 100）で 1.15 倍。トラックパッドの小刻みな delta も連続的に効く
      const steps = clamp((-event.deltaY * unit) / 100, -3, 3);
      this.zoomAt(pixel, Math.pow(1.15, steps));
    };

    this._onPointerDown = (event) => {
      if (typeof event.button === 'number' && event.button !== 0) return;
      const pixel = this._eventToCanvas(event);
      const [w, h] = this._canvasSize();
      const mode = dragModeOf(event.shiftKey, this.rotatable);
      this._drag = {
        pointerId: event.pointerId,
        last: pixel,
        mode,
        startAngle: Math.atan2(pixel[1] - h / 2, pixel[0] - w / 2),
        startRotation: this.viewpoint.rotation,
      };
      if (typeof canvas.setPointerCapture === 'function' && event.pointerId !== undefined) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          // capture できない環境（古いブラウザ）でも pan は動く
        }
      }
      if (canvas.style) canvas.style.cursor = mode === 'rotate' ? 'crosshair' : 'grabbing';
    };

    this._onPointerMove = (event) => {
      const drag = this._drag;
      if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
      const pixel = this._eventToCanvas(event);
      const [w, h] = this._canvasSize();

      if (drag.mode === 'pan') {
        this.panBy(pixel[0] - drag.last[0], pixel[1] - drag.last[1]);
      } else {
        const angle = Math.atan2(pixel[1] - h / 2, pixel[0] - w / 2);
        this.viewpoint.rotation = drag.startRotation + (angle - drag.startAngle);
        this.draw();
        this._emit('change', this.getViewpoint());
      }
      drag.last = pixel;
    };

    this._onPointerUp = () => {
      if (!this._drag) return;
      const drag = this._drag;
      this._drag = null;
      if (typeof canvas.releasePointerCapture === 'function' && drag.pointerId !== undefined) {
        try {
          canvas.releasePointerCapture(drag.pointerId);
        } catch {
          // 既に離している場合は無視
        }
      }
      if (canvas.style) canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerUp);
    if (canvas.style) canvas.style.cursor = 'grab';
  }

  /**
   * 画面 px の差分だけ地図を動かす（ドラッグ）。メルカトル座標で中心を補正する。
   * @param {number} dx 画面 x の差分
   * @param {number} dy 画面 y の差分
   */
  panBy(dx, dy) {
    const s = pixelsPerMercator(this.viewpoint.zoom);
    const cos = Math.cos(this.viewpoint.rotation);
    const sin = Math.sin(this.viewpoint.rotation);
    // 画面差分 → メルカトル差分（y は上下反転・回転の逆変換）
    const mx = (cos * dx + sin * dy) / s;
    const my = (sin * dx - cos * dy) / s;
    this.viewpoint.center = [
      this.viewpoint.center[0] - mx,
      this.viewpoint.center[1] - my,
    ];
    this.draw();
    this._emit('change', this.getViewpoint());
  }

  /**
   * カーソル位置を固定したズーム（ホイール）。`factor > 1` で拡大。
   * @param {[number, number]} pixel canvas ピクセル
   * @param {number} factor 倍率
   */
  zoomAt(pixel, factor) {
    const zoom = clamp(
      this.viewpoint.zoom + Math.log2(requireFinite(factor, 'factor')),
      this.minZoom,
      this.maxViewZoom,
    );
    const anchor = this.pixelToMap(pixel);
    const s = pixelsPerMercator(zoom);
    const cos = Math.cos(this.viewpoint.rotation);
    const sin = Math.sin(this.viewpoint.rotation);
    const [w, h] = this._canvasSize();
    const ux = (pixel[0] - w / 2) / s;
    const uy = (pixel[1] - h / 2) / s;
    this.viewpoint.zoom = zoom;
    this.viewpoint.center = [
      anchor[0] - (cos * ux + sin * uy),
      anchor[1] - (sin * ux - cos * uy),
    ];
    this.draw();
    this._emit('change', this.getViewpoint());
  }

  // --- レイアウト -----------------------------------------------------------

  /**
   * canvas のビットマップ寸法を差し替えて描き直す（中心は保つ）。
   * @param {number} width ビットマップ幅
   * @param {number} height ビットマップ高さ
   * @param {number} [dpr]
   */
  resize(width, height, dpr) {
    const w = Math.max(1, Math.round(requireFinite(width, 'width')));
    const h = Math.max(1, Math.round(requireFinite(height, 'height')));
    if (Number.isFinite(dpr) && dpr > 0) this.dpr = dpr;
    this.canvas.width = w;
    this.canvas.height = h;
    this.draw();
  }

  /** 後始末（イベント解除。ページを捨てるときだけ使う） */
  destroy() {
    this._destroyed = true;
    const canvas = this.canvas;
    if (canvas.removeEventListener) {
      canvas.removeEventListener('wheel', this._onWheel);
      canvas.removeEventListener('pointerdown', this._onPointerDown);
      canvas.removeEventListener('pointermove', this._onPointerMove);
      canvas.removeEventListener('pointerup', this._onPointerUp);
      canvas.removeEventListener('pointercancel', this._onPointerUp);
      canvas.removeEventListener('pointerleave', this._onPointerUp);
    }
    this.listeners.clear();
    this.overlays.length = 0;
    for (const waiter of this._readyWaiters) {
      if (waiter.timer) clearTimeout(waiter.timer);
    }
    this._readyWaiters = [];
    this.tileCache.clear();
  }
}

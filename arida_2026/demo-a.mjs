/**
 * `demo-a.html` のスクリプト — DEMO-A「往復で戻るか」（m3 T4・要件書 §4・計画 §5.1）。
 *
 *   node demos/scripts/serve.mjs
 *   → http://127.0.0.1:8811/demo-a.html
 *   → http://127.0.0.1:8811/demo-a.html?data=kaisei_hiroshima_jissoku.pairswap（T5 の error 派生）
 *
 * **画面**: 1200×800 の収録面。左が地図面（古地図・kaisei の絵図ピクセル）、右が地理面（地理院 `xyz/std`）。
 * 右上に `Panel`（状態・起点・往復誤差・凡例）、左下に出典。左右は `lib/sync.mjs` の
 * `syncViewpoint()`（`viewpoint2Mercs` / `mercs2Viewpoint`）で同期する。
 * **開いた直後から収録の点（`DEMO_A_POINT`）のあたりに寄る**（引きの絵では三角網が読めない ∴ 人間指摘 2026-11-01）。
 *
 * **往復計測**（どちらの面からでも始められる。クリックのたびに前の印は消す）:
 *   地図面クリック … `p`（絵図ピクセル）→ 順変換 `q = T(p)` → 再変換 `p′ = T⁻¹(q)`。誤差 `‖p′−p‖` px
 *   地理面クリック … `q`（メルカトル）→ 順変換 `p = T⁻¹(q)` → 再変換 `q′ = T(p)`。誤差 `‖q′−q‖` m
 *                    （m はメルカトル座標の単位。地上距離ではない）
 * 「順変換」は**クリックした面から相手の面へ**の意味（地理面起点では Maplat の backward が往路）。
 *
 * **印**（ページ全体を覆う SVG `#roundtrip-overlay` に描く。canvas の三角網より上）:
 *   クリック点 … 水色の十字 ／ 相手側の対応点 … 塗りつぶした菱形 ／ 再変換点 … 赤丸
 *   行きの矢印（クリック点 → 相手側）… 橙 ／ 帰りの矢印（相手側 → 再変換点）… 藍
 *   行きと帰りが重なる（再変換点がクリック点に戻る）とき … 橙と藍を混ぜた色の両方向矢印 1 本
 * 面をまたぐ矢印は両面の画面座標を結ぶ。パン・ズーム・同期で canvas を描き直すたびに引き直す
 * （各面の最後の overlay が `renderOverlay()` を呼ぶ）。端点が自分の面の外に出たら矢印は描かない
 * （別の面の上に矢じりが乗って誤読させない）。
 *
 * **三角網**: 一般の辺＝青、制約辺＝緑（v2.8: デモ C・資料 #12 と同じ緑 #1B7A3D。赤は「問題」だけに使う）。
 * **太さ・不透明度は同じ**（種類で目立ち方を変えない）。
 * 対象の三角形（クリック点・対応点を含む三角形）は黄の太い縁取りと半透明の塗りで**最前面**に描く。
 *
 * **`strict_error`**（要件書 §4 ⑤）: 逆変換は vendor が例外を投げる（`transform.ts:286`）∴
 * 捕まえて Panel に「error: 逆変換を実行しない」を出し、**数値は出さない**（`—` のまま）。
 *
 * **収録用フック**:
 *   window.__demoA = {
 *     ready: Promise,                     // 両面ともタイル 1 枚以上を描くまで
 *     clickAt(side, [x, y]),             // side='left' は絵図ピクセル、'right' はメルカトル
 *     state(),                            // 下の snapshot() を参照（起点・3 点・誤差を実測で返す）
 *     load(name),                         // 同一ページのまま題材を差し替える（T6 の cue ⑤）
 *     centerOn(xy), screenOf(side), screenOfImage(xy), goToRecordPoint(),
 *   }
 * 右面の引数は `state().clickedXy`（絵図ピクセル）をそのまま渡してもよい。値が
 * `[0, width] × [0, height]` に入るときは「左と同じ絵図ピクセル」と解釈して順方向に写す
 * （メルカトル座標は広島で |x| ≈ 1.5e7 ∴ 取り違えない。解釈したことは console.info に残す）。
 *
 * **座標の約束**（`lib/mapview.mjs` と同じ）: 古地図の Viewpoint 中心は仮想メルカトル、
 * 現代地図の Viewpoint 中心は EPSG:3857。`MapTransform` は「絵図ピクセル ⇄ メルカトル」を写す。
 */
import { loadCompiled, normalizeName } from './lib/data.mjs';
import { MapView, lonLatToMercator, titleText } from './lib/mapview.mjs';
import { TinView } from './lib/tinview.mjs';
import { Panel, formatQuantity, NULL_TEXT } from './lib/panel.mjs';
import { installCursor } from './lib/cursor.mjs';
import {
  SYNC_HIST_TO_MODERN,
  SYNC_MODERN_TO_HIST,
  syncViewpoint,
  transformPoint, imagePixelToViewpointCenter,
} from './lib/sync.mjs';
import { MapTransform } from './vendor/maplat_transform.js';
import { DEMO_A_POINT } from './lib/demo-points.mjs';
import { layoutRect, layoutSize } from './lib/stage-fit.mjs';
import { DECK_COLOR, mixHex, withAlpha } from './lib/deck-colors.mjs';

/** 既定の題材（要件書 §4・計画 §1） */
const DEFAULT_DATA = 'kaisei_hiroshima_jissoku';

/** 地理院タイル（標準地図）。要件書 §3 のとおり `xyz/std` */
const MODERN_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';

/** 現代地図の出典（画面隅に常時表示） */
const MODERN_ATTRIBUTION = '地理院タイル';

/** 現代地図の仮の初期位置（すぐ左面から同期する。同期に失敗したときの保険） */
const MODERN_PROVISIONAL = Object.freeze({ lonLat: [132.4553, 34.3955], zoom: 13 }); // 広島市中心部

/** 「収録の点へ寄る」の拡大率（1 絵図 px ≈ 0.5 画面 px。収録の `zoomLeftTo(page, 0.5)` と同じ） */
const RECORD_POINT_SCALE = 0.5;

/**
 * 印と矢印の色。クリック点の水色は資料に無い色だが、地図（茶・白）と三角網（青・赤・黄）の
 * どれとも被らない ∴ 発表者の指定（2026-11-01）どおり水色にする。他は資料の色。
 */
const MARK = Object.freeze({
  clicked: '#00E5FF',
  counterpart: '#00E5FF',
  back: DECK_COLOR.red,
  go: DECK_COLOR.orange,
  ret: DECK_COLOR.indigo,
  both: mixHex(DECK_COLOR.orange, DECK_COLOR.indigo),
  halo: 'rgba(6, 12, 22, 0.78)',
  light: 'rgba(255, 255, 255, 0.92)',
});

/** 再変換点がクリック点から何 CSS px 以内なら「重なる」（両方向矢印 1 本）とみなすか */
const MERGE_CSS_PX = 4;

/**
 * 要件書 §4「補助表示」: 三角網（青）と制約辺（緑。v2.8 で赤から）と kinks（橙丸。error データのみ点が入る）。
 * 対応線（`edges` 層）は制約辺を直線で重ね描きするだけ ∴ 出さない（目立ち方が揃わなくなる）。
 * GCP・辺ノード・凸包・境界・外挿も**出さない**（確認ページ T3b の全部入りとは別）。
 */
const TIN_LAYERS_FOR_DEMO = Object.freeze({
  gcps: false,
  edges: false,
  tin: true,
  constraint: true,
  edgeNodes: false,
  kinks: true,
  hull: false,
  boundary: false,
  extrap: false,
});

/** 辺の太さ・不透明度（一般の辺と制約辺で同じ。CSS px） */
const TIN_LINE_WIDTH = 1.8;
const TIN_LINE_ALPHA = 0.9;

/**
 * 三角網の見た目（`TinView` の style 差し替え）。一般の辺＝青・制約辺＝緑で、**太さと不透明度は同じ**。
 * 制約辺のハイライト（対象三角形に接する制約辺の太線）も同じ見た目にして、対象三角形だけを目立たせる。
 */
const TIN_STYLE_FOR_DEMO = Object.freeze({
  tin: { color: withAlpha(DECK_COLOR.blue, TIN_LINE_ALPHA), width: TIN_LINE_WIDTH },
  constraint: { color: withAlpha(DECK_COLOR.green, TIN_LINE_ALPHA), width: TIN_LINE_WIDTH },
  constraintHighlight: { color: withAlpha(DECK_COLOR.green, TIN_LINE_ALPHA), width: TIN_LINE_WIDTH },
  tinHighlight: {
    color: DECK_COLOR.amber,
    width: 4.5,
    fill: withAlpha(DECK_COLOR.amber, 0.34),
    halo: 'rgba(20, 16, 10, 0.85)',
    haloWidth: 8,
  },
});

// ---------------------------------------------------------------------------
// 状態（`window.__demoA` から読む）
// ---------------------------------------------------------------------------

const runtime = {
  dataName: DEFAULT_DATA,
  data: null,
  mt: null,
  left: null,
  right: null,
  tins: { left: null, right: null },
  panel: null,
  badge: null,
  originRow: null,
  roundTrip: null,
  errorNote: null,
  strictStatus: null,
  syncing: false,
  /** 直前のクリック（題材を切り替えたとき、同じ点で自動で再計算するため） */
  lastClick: null,
};

/**
 * 往復の 1 回分。`origin` は起点の面（'map' = 地図面・絵図ピクセル、'geo' = 地理面・メルカトル）。
 * `clicked` は起点の面の座標、`counterpart` は相手の面の座標、`back` は起点の面へ戻した座標。
 * `error` は `{ value, unit }`（unit は 'px' か 'm'）。逆変換が禁止・失敗したときは該当が null。
 */
const trip = {
  origin: null,
  clicked: null,
  counterpart: null,
  back: null,
  error: null,
};

/** `window.__demoA.ready` の deferred。モジュール評価直後にフックを置くため先に作る */
let resolveReady = () => {};
let rejectReady = () => {};
const readyPromise = new Promise((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});

// ---------------------------------------------------------------------------
// 小さなヘルパー
// ---------------------------------------------------------------------------

/** `?data=` を解く。安全な名前（`normalizeName`）だけを受け、危険な名前は既定へ戻す */
function pickDataName() {
  const requested = new URLSearchParams(window.location.search).get('data');
  if (!requested) return { name: DEFAULT_DATA, invalid: null };
  try {
    return { name: normalizeName(requested), invalid: null };
  } catch (error) {
    return { name: DEFAULT_DATA, invalid: `${requested}（${error.message}）` };
  }
}

/** canvas のビットマップ寸法を CSS の寸法 × dpr に合わせる（Retina でもぼやけない） */
function fitCanvas(canvas) {
  // v3.5: getBoundingClientRect は #stage の縮尺 k（スマホ）で縮んだ寸法を返す ∴ レイアウト上の寸法を使う
  const rect = layoutSize(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round((rect.w || canvas.width || 600) * dpr));
  const height = Math.max(1, Math.round((rect.h || canvas.height || 800) * dpr));
  canvas.width = width;
  canvas.height = height;
  return { width, height, dpr };
}

/** 古地図のタイル URL（データの `url` を第一、無ければ slug から組む） */
function histTileUrl(data) {
  if (typeof data.raw?.url === 'string' && data.raw.url.includes('{z}')) return data.raw.url;
  return `https://t.tilemap.jp/maplat/tiles/${data.tileSlug}/{z}/{x}/{y}.jpg`;
}

/** 古地図の出典（データの `attr` → `title` の順。要件書 §3） */
function histAttribution(data) {
  return titleText(data.raw?.attr) || titleText(data.title) || '古地図';
}

/** vendor の `MapTransform` はコンストラクタに引数を取らない ∴ `setMapData` で渡す */
function createTransform(compiled) {
  const mt = new MapTransform();
  mt.setMapData({ compiled });
  return mt;
}

/** 同期の 5 点に渡す面の大きさ。左右が同じでないときは小さい方（`min(size)/4` が半径） */
function syncSize() {
  return [
    Math.min(runtime.left.canvas.width, runtime.right.canvas.width),
    Math.min(runtime.left.canvas.height, runtime.right.canvas.height),
  ];
}

function redrawAll() {
  runtime.left?.draw();
  runtime.right?.draw();
  renderOverlay();
}

function showNote(text) {
  const note = document.getElementById('data-note');
  if (!note) return;
  note.hidden = false;
  note.textContent = text;
}

function showFatal(error) {
  console.error(error);
  showNote(`読み込みに失敗: ${error instanceof Error ? error.message : String(error)}`);
}

function setErrorNotice(text) {
  if (!runtime.errorNote) return;
  runtime.errorNote.set(text);
  runtime.errorNote.el.hidden = false;
}

function clearErrorNotice() {
  if (!runtime.errorNote) return;
  runtime.errorNote.el.hidden = true;
}

/**
 * 逆変換が失敗したときの注記。**strict_error（地図全体の検査落ち）と、範囲外などの
 * 個別の失敗を混同しない**（要件書 §4 ⑤の文言は前者だけに出す）。
 */
function backwardFailureMessage(error) {
  const text = error instanceof Error ? error.message : String(error);
  if (runtime.strictStatus === 'strict_error' || text.includes('Backward transform is not allowed')) {
    return 'error: 逆変換を実行しない';
  }
  return `逆変換できない: ${text}`;
}

const ORIGIN_TEXT = Object.freeze({ map: '地図面（絵図）', geo: '地理面（現代地図）' });

/** Panel の「起点」「往復誤差」を `trip` に合わせる */
function updatePanel() {
  if (runtime.originRow) {
    runtime.originRow.numEl.textContent = trip.origin ? ORIGIN_TEXT[trip.origin] : NULL_TEXT;
  }
  if (runtime.roundTrip) {
    const label = trip.origin === 'geo' ? '往復誤差（地理面から）'
      : trip.origin === 'map' ? '往復誤差（地図面から）' : '往復誤差';
    runtime.roundTrip.setLabel(label);
    runtime.roundTrip.numEl.textContent = trip.error
      ? formatQuantity(trip.error.value, trip.error.unit, 2)
      : NULL_TEXT;
  }
}

/** 往復をまとめて差し替える（前の印は消える） */
function setTrip(next) {
  trip.origin = next?.origin ?? null;
  const copy = (xy) => (Array.isArray(xy) && xy.length >= 2 ? [xy[0], xy[1]] : null);
  trip.clicked = copy(next?.clicked);
  trip.counterpart = copy(next?.counterpart);
  trip.back = copy(next?.back);
  trip.error = next?.error && Number.isFinite(next.error.value)
    ? { value: next.error.value, unit: next.error.unit }
    : null;
  highlightTriangles();
  updatePanel();
}

/** 地図面（絵図ピクセル）にある点・地理面（メルカトル）にある点 */
function mapFacePoint() {
  if (trip.origin === 'map') return trip.clicked;
  if (trip.origin === 'geo') return trip.counterpart;
  return null;
}
function geoFacePoint() {
  if (trip.origin === 'geo') return trip.clicked;
  if (trip.origin === 'map') return trip.counterpart;
  return null;
}

/** クリック点・対応点を含む三角形を両面で強調する（TinView.highlightAt。描画は最前面） */
function highlightTriangles() {
  const hist = runtime.tins.left;
  const modern = runtime.tins.right;
  const p = mapFacePoint();
  const q = geoFacePoint();
  if (hist) {
    if (p) hist.highlightAt(p);
    else hist.clearHighlight();
  }
  if (modern) {
    if (q) modern.highlightAt(q);
    else modern.clearHighlight();
  }
}

// ---------------------------------------------------------------------------
// 印と矢印（ページ全体を覆う SVG。面をまたぐ矢印を両面の画面座標で結ぶ）
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

/** canvas の要素と #stage の位置関係（CSS px）。毎回引き直す（レイアウトが変わっても追随） */
function paneRect(side) {
  const canvas = document.getElementById(side === 'left' ? 'map-left' : 'map-right');
  const stage = document.getElementById('stage');
  if (!canvas || !stage) return null;
  // v3.5: 縮尺 k（スマホ）で縮めていても、SVG は #stage の中（レイアウト座標）に描く ∴ k で割った矩形を使う
  const rect = layoutRect(canvas, stage);
  return {
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    sx: rect.w / (canvas.width || 1),
    sy: rect.h / (canvas.height || 1),
  };
}

/**
 * 面の座標 → #stage の CSS px。`face` は 'map'（絵図ピクセル・左面）か 'geo'（メルカトル・右面）。
 * 面の外に出た点も座標は返す（`inside` で判定する）。
 */
function stageOf(face, xy) {
  if (!xy) return null;
  const view = face === 'map' ? runtime.left : runtime.right;
  const rect = paneRect(face === 'map' ? 'left' : 'right');
  if (!view || !rect) return null;
  let px;
  try { px = face === 'map' ? view.imageToScreen(xy) : view.mapToPixel(xy); } catch { return null; }
  if (!px || !Number.isFinite(px[0]) || !Number.isFinite(px[1])) return null;
  const x = rect.x + px[0] * rect.sx;
  const y = rect.y + px[1] * rect.sy;
  const inside = x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  return { x, y, inside };
}

function otherFace(face) { return face === 'map' ? 'geo' : 'map'; }

/** 3 点の #stage 座標と、矢印の描き方（'both' | 'separate' | 'go' | null） */
function overlayGeometry() {
  if (!trip.origin || !trip.clicked) return null;
  const origin = trip.origin;
  const clicked = stageOf(origin, trip.clicked);
  const counterpart = stageOf(otherFace(origin), trip.counterpart);
  const back = stageOf(origin, trip.back);
  let arrow = null;
  if (clicked && counterpart) {
    if (back) {
      arrow = Math.hypot(back.x - clicked.x, back.y - clicked.y) <= MERGE_CSS_PX ? 'both' : 'separate';
    } else {
      arrow = 'go';
    }
  }
  return { origin, clicked, counterpart, back, arrow };
}

/** SVG の要素を作る */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

/** 矢じり（marker）。色ごとに 1 つ。`auto-start-reverse` ∴ 両方向矢印の始点にも使える */
function arrowMarker(id, color) {
  const marker = svgEl('marker', {
    id,
    viewBox: '0 0 12 12',
    refX: 10,
    refY: 6,
    markerWidth: 18,
    markerHeight: 18,
    markerUnits: 'userSpaceOnUse',
    orient: 'auto-start-reverse',
  });
  marker.append(svgEl('path', {
    d: 'M0,0 L12,6 L0,12 L3,6 Z', fill: color, stroke: MARK.halo, 'stroke-width': 1,
  }));
  return marker;
}

/** #stage に 1 枚だけ置く SVG（pointer-events なし。Panel・ボタン・カーソルより下） */
function ensureOverlaySvg() {
  let svg = document.getElementById('roundtrip-overlay');
  if (svg) return svg;
  const stage = document.getElementById('stage');
  if (!stage) return null;
  svg = svgEl('svg', { id: 'roundtrip-overlay', width: 1200, height: 800, 'aria-hidden': 'true' });
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:8;overflow:hidden;';
  const defs = svgEl('defs');
  defs.append(
    arrowMarker('ah-go', MARK.go),
    arrowMarker('ah-ret', MARK.ret),
    arrowMarker('ah-both', MARK.both),
  );
  for (const side of ['left', 'right']) {
    const clip = svgEl('clipPath', { id: `clip-${side}` });
    clip.append(svgEl('rect', { 'data-pane': side, x: 0, y: 0, width: 0, height: 0 }));
    defs.append(clip);
  }
  svg.append(defs, svgEl('g', { id: 'roundtrip-arrows' }), svgEl('g', { id: 'roundtrip-marks' }));
  stage.append(svg);
  return svg;
}

/** 端点から `pad` だけ内側に寄せる（矢じりが印を覆わない） */
function shorten(a, b, padA, padB) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len <= padA + padB + 1) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return { a: { x: a.x + ux * padA, y: a.y + uy * padA }, b: { x: b.x - ux * padB, y: b.y - uy * padB }, len };
}

/**
 * 矢印の path。`bow` は進行方向の左手側へのふくらみ（0 なら直線）。行きと帰りはどちらも
 * 「自分の進行方向の左手」にふくらませる ∴ 往路と復路が反対側に分かれて重ならない。
 */
function arrowPath(a, b, bow) {
  if (!bow) return `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (b.y - a.y) / len;
  const ny = -(b.x - a.x) / len;
  const cx = mx + nx * bow;
  const cy = my + ny * bow;
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}

/** 縁取り（下地）つきの矢印を 1 本足す */
function addArrow(group, d, color, markerId, { start = false } = {}) {
  group.append(svgEl('path', {
    d, fill: 'none', stroke: MARK.halo, 'stroke-width': 7.5, 'stroke-linecap': 'round', opacity: 0.9,
  }));
  const attrs = {
    d, fill: 'none', stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round',
    'marker-end': `url(#${markerId})`,
  };
  if (start) attrs['marker-start'] = `url(#${markerId})`;
  group.append(svgEl('path', attrs));
}

/** 水色の十字（クリック点） */
function addCross(group, { x, y }) {
  const arm = 15;
  const d = `M${x - arm},${y} L${x + arm},${y} M${x},${y - arm} L${x},${y + arm}`;
  group.append(svgEl('path', { d, stroke: MARK.halo, 'stroke-width': 7, 'stroke-linecap': 'round', fill: 'none' }));
  group.append(svgEl('path', { d, stroke: MARK.clicked, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }));
}

/** 塗りつぶした菱形（相手側の対応点） */
function addDiamond(group, { x, y }) {
  const r = 11;
  const d = `M${x},${y - r} L${x + r},${y} L${x},${y + r} L${x - r},${y} Z`;
  group.append(svgEl('path', { d, fill: MARK.counterpart, stroke: MARK.halo, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
}

/** 赤丸（再変換点）。十字より大きい ∴ 元に戻ったときは十字を囲んで両方見える */
function addRing(group, { x, y }) {
  group.append(svgEl('circle', { cx: x, cy: y, r: 12, fill: 'none', stroke: MARK.light, 'stroke-width': 7 }));
  group.append(svgEl('circle', { cx: x, cy: y, r: 12, fill: 'none', stroke: MARK.back, 'stroke-width': 3.5 }));
}

/** 印と矢印を描き直す（canvas の描画のたびに呼ばれる） */
function renderOverlay() {
  const svg = ensureOverlaySvg();
  if (!svg) return;
  for (const side of ['left', 'right']) {
    const rect = paneRect(side);
    const clipRect = svg.querySelector(`rect[data-pane="${side}"]`);
    if (rect && clipRect) {
      clipRect.setAttribute('x', rect.x);
      clipRect.setAttribute('y', rect.y);
      clipRect.setAttribute('width', rect.w);
      clipRect.setAttribute('height', rect.h);
    }
  }
  const arrows = svg.querySelector('#roundtrip-arrows');
  const marks = svg.querySelector('#roundtrip-marks');
  arrows.replaceChildren();
  marks.replaceChildren();
  const geo = overlayGeometry();
  runtime.lastGeometry = geo;
  if (!geo || !geo.clicked) return;

  // 矢印: 端点が両方とも自分の面の中にあるときだけ（別の面の上に矢じりを乗せない）
  const { clicked, counterpart, back, arrow } = geo;
  const canArrow = clicked.inside && counterpart && counterpart.inside;
  if (canArrow && arrow === 'both') {
    const seg = shorten(clicked, counterpart, 18, 14);
    if (seg) addArrow(arrows, arrowPath(seg.a, seg.b, 0), MARK.both, 'ah-both', { start: true });
  } else if (canArrow && arrow === 'separate') {
    const go = shorten(clicked, counterpart, 18, 14);
    if (go) addArrow(arrows, arrowPath(go.a, go.b, Math.min(70, go.len * 0.12)), MARK.go, 'ah-go');
    if (back.inside) {
      const ret = shorten(counterpart, back, 14, 15);
      if (ret) addArrow(arrows, arrowPath(ret.a, ret.b, Math.min(70, ret.len * 0.12)), MARK.ret, 'ah-ret');
    }
  } else if (canArrow && arrow === 'go') {
    const go = shorten(clicked, counterpart, 18, 14);
    if (go) addArrow(arrows, arrowPath(go.a, go.b, 0), MARK.go, 'ah-go');
  }

  // 印: 面ごとに切り抜く（相手の面にはみ出さない）。順は 菱形 → 赤丸 → 十字（十字が最前面）
  const originSide = geo.origin === 'map' ? 'left' : 'right';
  const otherSide = originSide === 'left' ? 'right' : 'left';
  const gOrigin = svgEl('g', { 'clip-path': `url(#clip-${originSide})` });
  const gOther = svgEl('g', { 'clip-path': `url(#clip-${otherSide})` });
  if (counterpart) addDiamond(gOther, counterpart);
  if (back) addRing(gOrigin, back);
  addCross(gOrigin, clicked);
  marks.append(gOther, gOrigin);
}

/** 各面の最後の overlay。canvas を描き直したら（パン・ズーム・同期）SVG も引き直す */
function overlayHook() {
  renderOverlay();
}

// ---------------------------------------------------------------------------
// 2 面同期（無限ループ防止のガードつき）
// ---------------------------------------------------------------------------

/**
 * 操作側の `change` を受けて反対側を同期する。
 * `setViewpoint(..., { silent: true })` は `change` を出さないが、将来の変更に備えてガードする。
 */
function syncFrom(from, to, direction) {
  if (runtime.syncing || !runtime.mt) return;
  runtime.syncing = true;
  try {
    const vp = syncViewpoint(runtime.mt, from.getViewpoint(), syncSize(), direction);
    to.setViewpoint(vp, { silent: true });
  } catch (error) {
    // 範囲外などで同期できないときは地図を壊さず、原因だけ残す（数値は出さない）
    console.warn(`DEMO-A: 同期できない（${direction}）`, error);
  } finally {
    runtime.syncing = false;
  }
  renderOverlay();
}

// ---------------------------------------------------------------------------
// 往復計測
// ---------------------------------------------------------------------------

/** クリック座標を検証する（`NaN` を黙って 0 にしない） */
function validatePair(xy) {
  if (!Array.isArray(xy) || xy.length < 2
    || typeof xy[0] !== 'number' || !Number.isFinite(xy[0])
    || typeof xy[1] !== 'number' || !Number.isFinite(xy[1])) {
    throw new TypeError(`clickAt の座標は有限の [x, y]: ${JSON.stringify(xy)}`);
  }
  return [xy[0], xy[1]];
}

/**
 * 右面クリックの入力をメルカトルへ直す。
 * 既定はメルカトルだが、**絵図ピクセルの範囲に入る値**は「左と同じ点」と解釈して順方向に写す
 * （`state().clickedXy` をそのまま `clickAt('right', ...)` に渡せるようにするため）。
 * 広島のメルカトルは |x| ≈ 1.5e7 ∴ 画像ピクセル（0〜6743, 0〜9020）と取り違えない。
 */
function resolveRightMercator(xy) {
  const [x, y] = xy;
  const data = runtime.data;
  const inImageBounds = Boolean(data)
    && x >= 0 && x <= data.width
    && y >= 0 && y <= data.height;
  if (inImageBounds) {
    console.info(`DEMO-A: 右面の [${x}, ${y}] を絵図ピクセルとして順方向に写します`);
    return transformPoint(runtime.mt, [x, y], false);
  }
  return [x, y];
}

/**
 * 地図面（絵図ピクセル `p`）から往復する: `q = T(p)` → `p′ = T⁻¹(q)`。誤差 ‖p′−p‖ px。
 * 逆変換が禁止・失敗したときは p と q だけを出し、数値は出さない。
 */
function roundTripFromMap(p) {
  const q = transformPoint(runtime.mt, p, false);
  try {
    const back = transformPoint(runtime.mt, q, true);
    setTrip({ origin: 'map', clicked: p, counterpart: q, back, error: { value: Math.hypot(back[0] - p[0], back[1] - p[1]), unit: 'px' } });
    clearErrorNotice();
  } catch (error) {
    setTrip({ origin: 'map', clicked: p, counterpart: q, back: null, error: null });
    setErrorNotice(backwardFailureMessage(error));
    console.warn('DEMO-A: 逆変換できない', error);
  }
}

/**
 * 地理面（メルカトル `q`）から往復する: `p = T⁻¹(q)` → `q′ = T(p)`。誤差 ‖q′−q‖ m（メルカトル座標の単位）。
 * 地理面起点では往路が逆変換 ∴ strict_error ではクリック点だけを出す。
 */
function roundTripFromGeo(q) {
  let p;
  try {
    p = transformPoint(runtime.mt, q, true);
  } catch (error) {
    setTrip({ origin: 'geo', clicked: q, counterpart: null, back: null, error: null });
    setErrorNotice(backwardFailureMessage(error));
    console.warn('DEMO-A: 逆変換できない', error);
    return;
  }
  const back = transformPoint(runtime.mt, p, false);
  setTrip({ origin: 'geo', clicked: q, counterpart: p, back, error: { value: Math.hypot(back[0] - q[0], back[1] - q[1]), unit: 'm' } });
  clearErrorNotice();
}

/**
 * 収録用クリック。**DOM 座標ではなく地図面のデータ座標**を与える。
 *   - `side='left'` … `[x, y]` は**絵図ピクセル**（地図面起点。誤差は px）
 *   - `side='right'` … `[x, y]` は**メルカトル座標**（地理面起点。誤差は m）。
 *     絵図ピクセル（`state().clickedXy`）を渡したときは `resolveRightMercator()` が順方向に写す。
 * **クリックのたびに前の印は消える。**
 *
 * @param {'left'|'right'} side
 * @param {[number, number]} xy
 * @returns {object} `state()` と同じ形
 */
function clickAt(side, xy) {
  if (!runtime.left || !runtime.right || !runtime.mt) {
    throw new Error('clickAt: 地図がまだ準備できていない（window.__demoA.ready を待つ）');
  }
  if (side !== 'left' && side !== 'right') {
    throw new RangeError(`clickAt の side は 'left' か 'right': ${String(side)}`);
  }
  const point = validatePair(xy);
  if (side === 'left') {
    roundTripFromMap(point);
    runtime.lastClick = { side: 'left', xy: [point[0], point[1]] };
  } else {
    const q = resolveRightMercator(point);
    roundTripFromGeo(q);
    runtime.lastClick = { side: 'right', xy: [q[0], q[1]] };
  }
  redrawAll();
  return snapshot();
}

/**
 * 目視用: 地図を**クリック**したら同じ計測を通す（ドラッグと区別するため 4 CSS px 以上は無視）。
 * 収録は実クリック（`page.mouse`）でもこの経路を通る。
 * 古地図は canvas ピクセル → 絵図ピクセル、現代地図は canvas ピクセル → メルカトルに直す。
 */
function bindMouseClicks(canvas, side) {
  let downAt = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (typeof event.button === 'number' && event.button !== 0) return; // 左ボタンだけ
    downAt = [event.clientX, event.clientY];
  });
  // 押したまま外へ出た／取り消された場合はクリックにしない（古い downAt を残さない）
  canvas.addEventListener('pointercancel', () => { downAt = null; });
  canvas.addEventListener('pointerleave', () => { downAt = null; });
  canvas.addEventListener('pointerup', (event) => {
    if (!downAt) return;
    const moved = Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]);
    downAt = null;
    if (moved > 4) return; // ドラッグ（pan / rotate）はクリックにしない

    const rect = canvas.getBoundingClientRect();
    const pixel = [
      (event.clientX - rect.left) * (canvas.width / rect.width),
      (event.clientY - rect.top) * (canvas.height / rect.height),
    ];
    try {
      if (side === 'left') {
        clickAt('left', runtime.left.screenToImage(pixel));
      } else {
        clickAt('right', runtime.right.pixelToMap(pixel));
      }
    } catch (error) {
      // 地図の外（TIN の範囲外）をクリックしたときなど。地図はそのまま
      console.warn(`DEMO-A: ${side} のクリックを計測できない`, error);
    }
  });
}

/**
 * `window.__demoA.state()`。**実測値だけ**を返す（未計測は null）。
 *   origin          … 起点の面（'map' | 'geo' | null）
 *   clicked         … クリック点（起点の面の座標。map は絵図 px、geo はメルカトル）
 *   counterpart     … 相手側の対応点（相手の面の座標）
 *   back            … 再変換点（起点の面の座標）
 *   error           … `{ value, unit }`（unit は 'px' か 'm'）
 *   arrow           … 画面の矢印（'both' = 重なって両方向 1 本 / 'separate' = 行きと帰りの 2 本 /
 *                     'go' = 行きだけ / null）。端点が面の外でも判定はする
 *   roundTripPx     … 地図面起点の誤差（px）。地理面起点では null（収録のゲートが読む）
 *   roundTripM      … 地理面起点の誤差（m）。地図面起点では null
 *   clickedXy       … 地図面にある点（地図面起点ならクリック点、地理面起点なら対応点）
 *   clickedMerc     … 地理面にある点（同上の逆）
 *   backXy          … 地図面起点の再変換点（絵図 px）。地理面起点では null
 */
function snapshot() {
  const copy = (xy) => (xy ? [...xy] : null);
  const geo = runtime.lastGeometry;
  return {
    dataName: runtime.dataName,
    strictStatus: runtime.strictStatus,
    origin: trip.origin,
    clicked: copy(trip.clicked),
    counterpart: copy(trip.counterpart),
    back: copy(trip.back),
    error: trip.error ? { ...trip.error } : null,
    arrow: geo && geo.origin === trip.origin ? geo.arrow : null,
    roundTripPx: trip.origin === 'map' && trip.error ? trip.error.value : null,
    roundTripM: trip.origin === 'geo' && trip.error ? trip.error.value : null,
    clickedXy: copy(mapFacePoint()),
    clickedMerc: copy(geoFacePoint()),
    backXy: trip.origin === 'map' ? copy(trip.back) : null,
    /** error 注記が画面に出ているか（T6 の cue ⑤ と sidecar の `errorShown`） */
    errorShown: Boolean(runtime.errorNote && runtime.errorNote.el && !runtime.errorNote.el.hidden),
    drawnTiles: {
      left: runtime.left ? runtime.left.drawnTiles : 0,
      right: runtime.right ? runtime.right.drawnTiles : 0,
    },
  };
}

/**
 * 印の**収録面上の座標**（CSS px・#stage 左上原点）。収録スクリプトが `page.mouse` で
 * そこへカーソルを動かすために使う。無ければ null。
 *   'left'  … 左面（地図面）の印（地図面起点ならクリック点、地理面起点なら対応点）
 *   'right' … 右面（地理面）の印（同上の逆）
 *   'back'  … 再変換点（起点の面）
 *   'clicked' / 'counterpart' … クリック点／相手側の対応点
 */
function screenOf(side) {
  let face;
  let point;
  if (side === 'left') { face = 'map'; point = mapFacePoint(); }
  else if (side === 'right') { face = 'geo'; point = geoFacePoint(); }
  else if (side === 'back') { face = trip.origin; point = trip.back; }
  else if (side === 'clicked') { face = trip.origin; point = trip.clicked; }
  else if (side === 'counterpart') { face = trip.origin ? otherFace(trip.origin) : null; point = trip.counterpart; }
  if (!face || !point) return null;
  const s = stageOf(face, point);
  return s ? [s.x, s.y] : null;
}

/** 絵図ピクセル → 収録面座標（収録スクリプトがクリック位置を決めるため） */
function screenOfImage(xy) {
  const s = stageOf('map', xy);
  return s ? [s.x, s.y] : null;
}

/** 絵図ピクセル xy を左面の中心に置く（右面は同期）。収録で見せたい点を画面中央へ */
function centerOn(xy) {
  if (!runtime.left || !runtime.mt) throw new Error('centerOn: 地図がまだ準備できていない');
  const vp = runtime.left.getViewpoint();
  const center = imagePixelToViewpointCenter(runtime.mt, xy);
  runtime.left.setViewpoint({ ...vp, center });
  syncFrom(runtime.left, runtime.right, SYNC_HIST_TO_MODERN);
  redrawAll();
}

// モジュール評価直後にフックを置く（`page.evaluate` が読み込み途中でも `ready` を掴める）
window.__demoA = {
  ready: readyPromise,
  clickAt: (side, xy) => clickAt(side, xy),
  centerOn: (xy) => centerOn(xy),
  goToRecordPoint: () => goToRecordPoint(),
  screenOf: (side) => screenOf(side),
  screenOfImage: (xy) => screenOfImage(xy),
  state: () => snapshot(),
  /**
   * 同じページのまま題材を差し替える（T6 の cue ⑤ = error 派生の 5 秒）。
   * **`page.goto` で遷移しない** ∴ 収録中の字幕・カバーが途切れない。
   */
  load: (name) => loadData(name),
};

// ---------------------------------------------------------------------------
// 凡例
// ---------------------------------------------------------------------------

/** 凡例の小さな見本（SVG 文字列。色は MARK・TIN_STYLE_FOR_DEMO と同じ） */
function legendIcon(kind) {
  const w = 34;
  const h = 18;
  const halo = MARK.halo;
  const body = {
    cross: `<path d="M8,9 L26,9 M17,1 L17,17" stroke="${halo}" stroke-width="6" stroke-linecap="round"/>`
      + `<path d="M8,9 L26,9 M17,1 L17,17" stroke="${MARK.clicked}" stroke-width="2.6" stroke-linecap="round"/>`,
    diamond: `<path d="M17,1 L25,9 L17,17 L9,9 Z" fill="${MARK.counterpart}" stroke="${halo}" stroke-width="2.4"/>`,
    ring: `<circle cx="17" cy="9" r="6.5" fill="none" stroke="${MARK.light}" stroke-width="5"/>`
      + `<circle cx="17" cy="9" r="6.5" fill="none" stroke="${MARK.back}" stroke-width="2.6"/>`,
    go: `<path d="M2,9 L26,9" stroke="${MARK.go}" stroke-width="3.5"/><path d="M24,3 L33,9 L24,15 Z" fill="${MARK.go}"/>`,
    ret: `<path d="M2,9 L26,9" stroke="${MARK.ret}" stroke-width="3.5"/><path d="M24,3 L33,9 L24,15 Z" fill="${MARK.ret}"/>`,
    both: `<path d="M8,9 L26,9" stroke="${MARK.both}" stroke-width="3.5"/><path d="M24,3 L33,9 L24,15 Z" fill="${MARK.both}"/>`
      + `<path d="M10,3 L1,9 L10,15 Z" fill="${MARK.both}"/>`,
    tri: `<path d="M4,16 L17,2 L30,16 Z" fill="${TIN_STYLE_FOR_DEMO.tinHighlight.fill}" stroke="${DECK_COLOR.amber}" stroke-width="2.6" stroke-linejoin="round"/>`,
    tin: `<path d="M2,6 L32,6" stroke="${TIN_STYLE_FOR_DEMO.tin.color}" stroke-width="2"/>`
      + `<path d="M2,13 L32,13" stroke="${TIN_STYLE_FOR_DEMO.constraint.color}" stroke-width="2"/>`,
  }[kind];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
}

/**
 * Panel の本文に凡例を足す（2 列）。v2.8（見た目のレビュー visual 1）: 14px → 20px。地図を隠す面積を
 * 増やしすぎないよう、行間を詰め（line-height 1.1・行の間 2px）、語を短くした（「行き＝帰り（戻った）」→「戻った（行き＝帰り）」は
 * 意味を変えずに同じ字数のまま）。
 */
function addLegend(panel) {
  const doc = panel.doc;
  const box = doc.createElement('div');
  box.className = 'demo-a-legend';
  box.style.cssText = 'display:grid;grid-template-columns:auto auto auto auto;gap:2px 6px;white-space:nowrap;align-items:center;'
    + 'margin-top:4px;font-size:20px;line-height:1.1;color:#10151c;';
  const head = doc.createElement('div');
  head.textContent = '凡例';
  head.style.cssText = 'grid-column:1 / -1;font-size:20px;font-weight:700;color:#4a5260;';
  box.append(head);
  const items = [
    ['cross', 'クリック点'],
    ['go', '行き'],
    ['diamond', '相手側の対応点'],
    ['ret', '帰り'],
    ['ring', '再変換点'],
    ['both', '行き＝帰り（戻った）'],
    ['tri', '対象の三角形'],
    ['tin', '辺（青 一般／緑 制約）'],
  ];
  for (const [kind, text] of items) {
    const icon = doc.createElement('span');
    icon.innerHTML = legendIcon(kind);
    icon.style.cssText = 'display:inline-flex;';
    const label = doc.createElement('span');
    label.textContent = text;
    box.append(icon, label);
  }
  panel.body.append(box);
  return box;
}

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

/**
 * 題材を読み込んで 2 面・パネル・三角網を作る（初期化と `window.__demoA.load()` の共通本体）。
 * **ページ遷移しない** ∴ 収録中の字幕・カバーが途切れない（T6 の cue ⑤）。
 * 開いた直後から収録の点に寄った表示にする（`goToRecordPoint()`。タイル待ちはその後）。
 */
async function boot(name) {
  const data = await loadCompiled(name);
  runtime.dataName = name;
  runtime.data = data;
  runtime.strictStatus = data.compiled.strict_status ?? data.strictStatus ?? null;

  // 出典（左下）と題材名
  const source = document.getElementById('source');
  if (source) source.textContent = `出典: ${histAttribution(data)} ／ ${MODERN_ATTRIBUTION}`;

  const stage = document.getElementById('stage');
  const leftCanvas = document.getElementById('map-left');
  const rightCanvas = document.getElementById('map-right');
  if (!stage || !leftCanvas || !rightCanvas) {
    throw new Error('#stage / #map-left / #map-right が無い');
  }

  const leftSize = fitCanvas(leftCanvas);
  const rightSize = fitCanvas(rightCanvas);

  const mt = createTransform(data.compiled);
  runtime.mt = mt;

  const left = new MapView(leftCanvas, {
    kind: 'hist',
    tileUrl: histTileUrl(data),
    width: data.width,
    height: data.height,
    attribution: histAttribution(data),
    title: data.title,
    dpr: leftSize.dpr,
  });

  const right = new MapView(rightCanvas, {
    kind: 'modern',
    tileUrl: MODERN_TILE_URL,
    attribution: MODERN_ATTRIBUTION,
    viewpoint: {
      center: lonLatToMercator(MODERN_PROVISIONAL.lonLat),
      zoom: MODERN_PROVISIONAL.zoom,
      rotation: 0,
    },
    dpr: rightSize.dpr,
  });

  runtime.left = left;
  runtime.right = right;

  // 左上（古地図）の初期表示を基準に、右（現代地図）を 5 点同期で合わせる
  try {
    const vpModern = syncViewpoint(mt, left.getViewpoint(), syncSize(), SYNC_HIST_TO_MODERN);
    right.setViewpoint(vpModern, { silent: true });
  } catch (error) {
    console.warn('DEMO-A: 初期同期に失敗（現代地図は仮位置のまま）', error);
  }

  // Panel は収録面（#stage）の右上。数値の文字サイズは panel.mjs が 28px に固定する
  const panel = new Panel(stage, {
    corner: 'tr',
    // 題材名は左下の出典にある ∴ 見出しは短く（パネルを低くして、右面中央の対応点を隠さない）
    title: 'DEMO-A 往復変換',
    // v2.8: 凡例を 20px にしたぶん 400 → 480px（右上の隅のまま。右面中央の対応点は隠さない）
    width: 480,
  });
  runtime.panel = panel;
  runtime.badge = panel.badge(runtime.strictStatus, { label: '状態' });
  runtime.originRow = panel.value('起点', null);
  runtime.originRow.numEl.style.fontSize = '22px'; // 面の名前は数値より小さく（28px だと折り返す）
  runtime.roundTrip = panel.value('往復誤差', null, 'px', 2);
  addLegend(panel);
  runtime.errorNote = panel.note('', { tone: 'danger' });
  runtime.errorNote.el.hidden = true;
  if (runtime.strictStatus === 'strict_error') {
    // 逆変換が禁止されたデータは、読み込んだ時点で「実行しない」と明示する
    setErrorNotice('error: 逆変換を実行しない');
  }

  // 三角網（青）・制約辺（赤）・kinks（要件書 §4 の補助表示）。hist 面の kinks は
  // 逆変換が要るため描かない（strict_error では戻せない ∴ 嘘をつかない。modern 面だけ出す）
  const histTin = new TinView(data, { side: 'hist', layers: TIN_LAYERS_FOR_DEMO, style: TIN_STYLE_FOR_DEMO });
  const modernTin = new TinView(data, { side: 'modern', layers: TIN_LAYERS_FOR_DEMO, style: TIN_STYLE_FOR_DEMO });
  runtime.tins.left = histTin;
  runtime.tins.right = modernTin;
  left.addOverlay(histTin.overlay());
  right.addOverlay(modernTin.overlay());
  // 印と矢印は SVG（両面をまたぐ）。canvas を描き直すたびに引き直す
  left.addOverlay(overlayHook);
  right.addOverlay(overlayHook);

  // 同期（一方の change で他方へ）。`silent` とガードの二重で無限ループを防ぐ
  left.on('change', () => syncFrom(left, right, SYNC_HIST_TO_MODERN));
  right.on('change', () => syncFrom(right, left, SYNC_MODERN_TO_HIST));

  updatePanel();
  // 開いた直後から寄りの絵（引きでは三角網が読めない）。タイルはこの表示で待つ
  goToRecordPoint();

  // 収録前の空撮り防止（要件書 §3・T6 の ready assert）
  await Promise.all([
    left.ready({ minTiles: 1, timeoutMs: 30000 }),
    right.ready({ minTiles: 1, timeoutMs: 30000 }),
  ]);
  redrawAll();
  return snapshot();
}

/**
 * 同じページのまま題材を差し替える（T6 の cue ⑤ = error 派生の 5 秒）。
 * 古い 2 面・パネルを捨ててから `boot()` で作り直す。**`page.goto` しない。**
 * `keepView`（手で切り替えたとき）は、同じ場所を表示したまま**直前のクリックを自動でやり直す**
 * （strict と loose を同じ点で比べられる）。
 */
async function loadData(name, { keepView = false } = {}) {
  const stem = normalizeName(name);
  const keptViewpoint = keepView && runtime.left ? runtime.left.getViewpoint() : null;
  const keptClick = keepView && runtime.lastClick
    ? { side: runtime.lastClick.side, xy: [...runtime.lastClick.xy] }
    : null;

  runtime.panel?.detach();
  runtime.left?.destroy();
  runtime.right?.destroy();
  runtime.left = null;
  runtime.right = null;
  runtime.tins = { left: null, right: null };
  runtime.panel = null;
  runtime.badge = null;
  runtime.originRow = null;
  runtime.roundTrip = null;
  runtime.errorNote = null;
  runtime.mt = null;
  runtime.data = null;
  runtime.strictStatus = null;
  runtime.syncing = false;
  runtime.lastClick = null;
  setTrip(null);
  renderOverlay();

  const note = document.getElementById('data-note');
  if (note) note.hidden = true;

  markDataButtons(stem);
  const state = await boot(stem);
  if (keptViewpoint) {
    runtime.left.setViewpoint(keptViewpoint, { silent: true });
    syncFrom(runtime.left, runtime.right, SYNC_HIST_TO_MODERN);
  }
  // 直前のクリックを同じ面・同じ座標でやり直す（印は新しい題材の結果に置き換わる）
  if (keptClick) {
    try { clickAt(keptClick.side, keptClick.xy); } catch (error) { console.warn('DEMO-A: 前のクリック点を引き継げない', error); }
  }
  redrawAll();
  return keptViewpoint || keptClick ? snapshot() : state;
}

/** 題材ボタンの押下状態を題材名に合わせる（`load()` から切り替えたときも揃える） */
function markDataButtons(name) {
  for (const button of document.querySelectorAll('#data-buttons button[data-name]')) {
    button.setAttribute('aria-pressed', String(button.dataset.name === name));
  }
}

/** 収録と同じ点（`DEMO_A_POINT`）を左面の中央に置き、1 絵図 px ≈ 0.5 画面 px まで寄る */
function goToRecordPoint() {
  if (!runtime.left) return;
  centerOn(DEMO_A_POINT);
  const scaleOf = () => {
    const a = runtime.left.imageToScreen(DEMO_A_POINT);
    const b = runtime.left.imageToScreen([DEMO_A_POINT[0] + 100, DEMO_A_POINT[1]]);
    const dpr = runtime.left.dpr || 1;
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / 100 / dpr;
  };
  for (let i = 0; i < 40 && scaleOf() < RECORD_POINT_SCALE; i += 1) {
    const vp = runtime.left.getViewpoint();
    runtime.left.setViewpoint({ ...vp, zoom: vp.zoom + Math.log2(1.15) }, { silent: true });
  }
  centerOn(DEMO_A_POINT);
}

/** 題材ボタンと「収録の点へ寄る」を結ぶ（手で操作するときの経路。収録は `load()` を直接呼ぶ） */
function bindDataButtons() {
  const buttons = [...document.querySelectorAll('#data-buttons button')];
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (button.id === 'go-point') { goToRecordPoint(); return; }
      if (button.dataset.name === runtime.dataName) return;
      buttons.forEach((b) => { b.disabled = true; });
      try {
        await loadData(button.dataset.name, { keepView: true });
      } catch (error) {
        showFatal(error);
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    });
  }
}

async function main() {
  const { name, invalid } = pickDataName();
  if (invalid) {
    showNote(`?data=${invalid} は使えない。既定の ${DEFAULT_DATA} を表示`);
  }
  await boot(name);
  markDataButtons(name);
  bindDataButtons();

  // 収録面に見えるカーソル（F-7）。pointer イベントに追随する ∴ 実クリックがそのまま映る
  installCursor(document.getElementById('stage'));

  // 目視用のクリック計測（収録は実クリックでもこの経路を通る）。**差し替えでは付け直さない**
  bindMouseClicks(document.getElementById('map-left'), 'left');
  bindMouseClicks(document.getElementById('map-right'), 'right');

  resolveReady(snapshot());
}

main().catch((error) => {
  rejectReady(error);
  showFatal(error);
});

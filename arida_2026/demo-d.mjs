/**
 * `demo-d.html` のスクリプト — DEMO-D「中心 1 点合わせと 5 点合わせ」（m3 T7・要件書 §7・計画 §5.2）。
 *
 * **v3.0（2026-11-08・引き継ぎ書 `2026-11-08-v30-demo-d-and-kouzu.md` §1）の筋書き**: 絵図を**大きく回して
 * 拡大しながら**、1 点方式では現代地図が付いてこず（ズーム・回転は据え置き ∴ 4 点が目標から外れる）、
 * 5 点方式では縮尺と方角を組み直して付いてくる（4 点が目標に重なる）ことを見せる。筋書きの表は
 * `lib/demo-points.mjs` の `DEMO_D_SCRIPT`（確認ページの「収録と同じ移動」と収録が同じ表を読む）。
 *   - 左面（絵図）は回せる: ドラッグ＝移動、Shift＋ドラッグ／Shift＋ホイール＝回転、ホイール＝ズーム。
 *     左面の右上に DOM ボタン「左へ 30°」「右へ 30°」「拡大」「縮小」「戻す」。
 *   - 右面（現代地図）は方式に従って追随する。右面の「目標」（薄い墨の丸）は左面と同じ画面オフセットの 4 点。
 *   - パネル（左下）に両面の回転とズーム、ずれ（1 点／5 点）。
 *
 *   node demos/scripts/serve.mjs
 *   → http://127.0.0.1:8811/demo-d.html
 *
 * **画面**: 1200×800 の収録面。左が絵図（`aki_hiroshima_castle`）、右が現代地図（地理院 `xyz/std`）。
 * 左面の左下寄り（5 点の名札と字幕を隠さない位置）に `Panel`（中央値（1 点・5 点）・正直さの注記）。
 * 幅は収録面の 1/3（400px）以下・高さは 1/2 以下に抑え、古地図を覆わない（4 値の個別行は
 * 出さず、値は `state()` と sidecar に残す。文字サイズは 28px / 20px のまま）。
 * 右上（現代地図面）に **DOM ボタン 2 個**「中心 1 点」「5 点」で方式を切り替える（収録は `page.click`）。
 *
 * **計測**（純関数は `lib/vp5.mjs`）:
 *   開始位置で 5 点方式の同期を 1 回行い、現代地図側の Viewpoint を `vpDst` として覚える。
 *   絵図側を動かした**移動後の位置**で
 *     - 5 点方式 … 5 点から組み直した現代地図側 Viewpoint が指す 4 点と真値の差（**実残差**）
 *     - 1 点方式 … 中心だけ写し、ズーム・回転は `vpDst` のまま（4 点は中心・ズーム・回転から予測）
 *   を比べ、右面の Viewpoint と Panel を切り替える。
 *
 *   **5 点方式のズレも 0 にはならない**（要件書 §7 の「T7 実測後の決定」）。5 点方式は面を
 *   1 つの相似変換で近似するため残差が残る（それでも 1 点方式より小さい）。この実値を
 *   Panel の数値と棒グラフに出す（自明な 0 を精度の証拠として見せない）。
 *
 * **補助表示**（資料 #14 の図 `fivePointView`（slides/src/arida-diagrams.mjs）に揃える）:
 *   - 5 点マーカー（中心＋上下左右）を**両面に同色**で描く（中心＝ink・上＝orange・右＝blue・下＝teal（v2.9 で indigo から）・左＝purple）
 *   - 絵図面: 十字の 4 点を結ぶ正方形（inkMuted の細線）と中心からの細線
 *   - 現代地図面（5 点）: 中心から変換後の 4 点への線と `dᵢ θᵢ`、**距離の平均と角度差の円周平均から組み直した
 *     正方形（橙の破線・角は白抜きの橙丸）**。右下の表に d₁〜d₄・θ₁〜θ₄ と平均（ズーム・回転）を実測で出す
 *   - 現代地図面（1 点）: 中心だけ写してズーム・回転を据え置いた正方形（灰の破線）
 *   - **両方式とも**、現代地図面に「真値 → その方式の予測」の**差分ベクトル（矢印）**を描く
 *     （1 点方式は長い矢印、5 点方式は短い矢印 ∴ 縮んだことが線の長さでも読める）
 *   - `residual5`（= `d5` の別名。5 点を相似変換で組み直したときの実残差）は `state()` に残す
 *
 * **収録用フック**:
 *   window.__demoD = {
 *     ready: Promise,
 *     setMode('one'|'five'),   // DOM ボタンと同じ経路（右面と Panel が切り替わる）
 *     rotateBy(deg, {ms}?),    // v3.0: 絵図を画面中心のまわりで回す（正＝右回り）。ms 付きは Promise
 *     zoomBy(factor, {ms}?),   // v3.0: 絵図を factor 倍に（0.5 で縮小）。ms 付きは Promise
 *     animate({rotateDeg, zoomFactor, ms}), // v3.0: 回転と拡大を同時に（Promise）
 *     reset(),                 // v3.0: 開始位置へ戻す（方式はそのまま）
 *     playScript(),            // v3.0: 筋書き DEMO_D_SCRIPT を通す（Promise。「収録と同じ移動」と同じ）
 *     setHint(bool),           // v3.0: 開始位置の手引きの表示（収録は false）
 *     dragBy([dx, dy]),        // 絵図側の中心を **絵図ピクセル** で動かす
 *     wheel(steps),            // 1 段 = 1.15 倍（MapView._onWheel と同じ）
 *     measure(),               // 現在位置で再計測して state() を返す
 *     state(),                 // { mode, d1, d5, median1, median5, dZoom, dRot, vpDst, drawnTiles, hist, modern, pressed, ... }
 *   }
 *
 * **座標の約束**（`lib/mapview.mjs` と同じ）: 絵図側 Viewpoint の中心は仮想メルカトル、
 * 現代地図側は EPSG:3857。`MapTransform` は「絵図ピクセル ⇄ メルカトル」を写す。
 */
import { loadCompiled, normalizeName } from './lib/data.mjs';
import {
  MapView,
  lonLatToMercator,
  pixelsPerMercator,
  titleText,
  xy2SysCoord,
} from './lib/mapview.mjs';
import { Panel } from './lib/panel.mjs';
import { installCursor } from './lib/cursor.mjs';
import { SYNC_HIST_TO_MODERN, syncViewpoint, transformPoint } from './lib/sync.mjs';
import { cornerOffsets, normalizeAngle, turnViewpoint } from './lib/vp5.mjs';
import { DECK_COLOR, FIVE_POINT_COLORS } from './lib/deck-colors.mjs';
import { DEMO_D_SCRIPT, DEMO_D_START_SHIFT } from './lib/demo-points.mjs';
import { MapTransform } from './vendor/maplat_transform.js';
import { layoutSize } from './lib/stage-fit.mjs';

/** 既定の題材（要件書 §7: aki。`p6.mp4` と同じ） */
const DEFAULT_DATA = 'aki_hiroshima_castle';

/** 地理院タイル（標準地図）。要件書 §3 のとおり `xyz/std` */
const MODERN_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';

/** 現代地図の出典（画面の角に常時表示） */
const MODERN_ATTRIBUTION = '地理院タイル';

/** 現代地図の仮の初期位置（すぐ絵図側から同期する。同期に失敗したときの保険） */
const MODERN_PROVISIONAL = Object.freeze({ lonLat: [132.4553, 34.3955], zoom: 13 }); // 広島市中心部

/**
 * 収録開始位置（絵図ピクセル）と表示ズーム。
 * `points[181]` は絵図の中央付近で、局所の相似性が高く 5 点方式の再構成残差が小さい
 * （`vp5.test.mjs` と同じ点。aki の compiled は `data/MANIFEST.json` で固定されている）。
 */
const START_POINT_INDEX = 181;
const START_ZOOM = 5.5;

/** ボタン 1 回の回転（度）・倍率と、その動きの長さ（ミリ秒） */
const BUTTON_TURN_DEG = 30;
const BUTTON_ZOOM_FACTOR = 2;
const BUTTON_MS = 600;

/** ホイール 1 段の倍率（`MapView._onWheel` と同じ） */
const WHEEL_FACTOR = 1.15;

/** 差分ベクトル（真値 → その方式が指す点）の色。資料の規約で「問題」は赤 */
const ARROW_COLOR = DECK_COLOR.red;
/** 1 点方式の据え置き正方形の色 */
const ONE_SQUARE_COLOR = '#5f6b7a';
/** 右面の「目標」（左面と同じ画面オフセットの 4 点）の色。薄い墨 */
const TARGET_STROKE = '#4a4f57'; // v3.1（L5）: 外側の線は 3px・濃い灰
const TARGET_FILL = 'rgba(255, 255, 255, 0.45)';

// ---------------------------------------------------------------------------
// 状態（`window.__demoD` から読む）
// ---------------------------------------------------------------------------

const runtime = {
  dataName: DEFAULT_DATA,
  data: null,
  mt: null,
  left: null,
  right: null,
  panel: null,
  /** 収録開始時に 5 点方式で 1 回同期した現代地図側 Viewpoint（1 点方式が据え置く値） */
  vpDst: null,
  /** 計測結果（`lib/vp5.mjs` の戻り値） */
  measurement: null,
  mode: 'five',
  syncing: false,
  /** 開始位置の絵図側 Viewpoint（ここでは 1 点と 5 点が定義上同じ ∴ 表に注記を出す） */
  vpStart: null,
  values: {},
  /** 開始位置の手引き（表の下の 1 行）を出すか。収録では `setHint(false)` で消す */
  hint: true,
  /** 動き（回転・拡大・筋書き）の世代。新しい動きが始まったら古い動きは止まる */
  motion: 0,
  playing: false,
};

/** `window.__demoD.ready` の deferred。モジュール評価直後にフックを置くため先に作る */
let resolveReady = () => {};
let rejectReady = () => {};
const readyPromise = new Promise((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});

// ---------------------------------------------------------------------------
// 小さなヘルパー（`demo-a.mjs` と同じ方針）
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

/** 5 点の半径に効く面の大きさ。左右が違うときは小さい方（`min(size)/4`） */
function syncSize() {
  return [
    Math.min(runtime.left.canvas.width, runtime.right.canvas.width),
    Math.min(runtime.left.canvas.height, runtime.right.canvas.height),
  ];
}

function showNote(text) {
  const note = document.getElementById('data-note');
  if (!note) return;
  note.hidden = false;
  note.textContent = text;
}

function hideNote() {
  const note = document.getElementById('data-note');
  if (note) note.hidden = true;
}

function showFatal(error) {
  console.error(error);
  showNote(`読み込みに失敗: ${error instanceof Error ? error.message : String(error)}`);
}

/**
 * 開始位置の絵図ピクセル（データに点が無ければ画像の中心）。v3.0: `points[181]` から
 * `DEMO_D_START_SHIFT.deltaImage` だけ寄せた位置（5 点方式の残差が小さく、開始時に印が重なる）
 */
function startImagePoint(data) {
  const point = data.points[START_POINT_INDEX]?.[0];
  if (!(Array.isArray(point) && point.every(Number.isFinite))) return [data.width / 2, data.height / 2];
  const [dx, dy] = DEMO_D_START_SHIFT.deltaImage;
  return [point[0] + dx, point[1] + dy];
}

/** 開始位置の表示ズーム（`START_ZOOM` にホイール `DEMO_D_START_SHIFT.wheelSteps` 段ぶん） */
function startZoom() {
  return START_ZOOM + Math.log2(WHEEL_FACTOR) * DEMO_D_START_SHIFT.wheelSteps;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** 方式の表示名 */
function modeTag(mode) {
  return mode === 'one' ? '1 点' : '5 点';
}

/**
 * Panel の数値行を組み立てる（要件書 §7: Δzoom/Δrot・中央値（1 点・5 点）・2 本の棒・注記）。
 *
 * **T8b（orchestrator の判定）**: このパネルは 400px（収録面 1200px の 1/3）以下に抑え、
 * 古地図を覆わない。4 点の個別値（各点の m と px の 8 行）は**出さない**
 * （値は `state()` と sidecar に残す）。文字サイズ（数値 28px・ラベル 20px）は落とさない。
 * 幅を抑えるため、中央値は m だけを 1 行で出す（px は `state()` / sidecar が持つ）。
 */
function buildPanel(stage) {
  // 左（絵図）面の 5 点（中心 (300,400)・上下左右 ±150px・名札は点の右上）と字幕（下端 ~660px 以下）の
  // **どれも隠さない**位置: 左面の左下寄り、x 16〜288・y 432〜約 650（F-10・2026-10-24）。
  // 幅は「下」の点（x≈293〜330）に届かない 272px に固定し、行数を絞って高さを 220px 以内に収める
  const panel = new Panel(stage, {
    corner: 'tl',
    title: '表示',
    width: 272,
  });
  panel.el.style.width = '272px';
  panel.el.style.top = '432px';
  panel.el.style.left = '16px';

  // v3.0: 両面の回転とズーム（絵図を回すと、1 点方式では現代地図が据え置き・5 点方式では付いてくる）
  const pose = document.createElement('div');
  pose.className = 'dd-pose';
  // v3.0: 高さ（下端が出典の帯 y≈749 より上）に収めるため、ずれ（1 点／5 点）も同じ表に入れる。
  // 名前は v2.8（visual 19）のまま「ずれ」（同じ量に別の名前を付けない）。押している方式の列を濃くする
  // v3.1（3-中-6）: 列見出しは v2.9 の語（方角・縮尺）に揃える。値は MapView の rotation（度）と zoom のまま
  pose.innerHTML = '<span></span><span class="h">方角</span><span class="h">縮尺</span>'
    + '<span class="l">絵図</span><span class="n" data-v="hist-rot">—</span><span class="n" data-v="hist-zoom">—</span>'
    + '<span class="l">現代</span><span class="n" data-v="modern-rot">—</span><span class="n" data-v="modern-zoom">—</span>'
    + '<span class="h sep">（m）</span><span class="h sep" data-k="one">1 点</span><span class="h sep" data-k="five">5 点</span>'
    + '<span class="l">ずれ</span><span class="n" data-v="median1" data-k="one">—</span><span class="n" data-v="median5" data-k="five">—</span>';
  panel.body.append(pose);
  const valueCell = (key) => ({ set: (v) => {
    const el = pose.querySelector(`[data-v="${key}"]`);
    // 10 m 以上は小数 1 桁・1000 m 以上は整数（幅 272px の表からはみ出さない。高解像度の画面では同じ位置でも m が大きく出る）
    if (el) el.textContent = Number.isFinite(v) ? v.toFixed(Math.abs(v) >= 1000 ? 0 : (Math.abs(v) >= 10 ? 1 : 2)) : '—';
  } });
  const median1 = valueCell('median1');
  const median5 = valueCell('median5');

  // 正直さの注記（5 点方式のずれも 0 ではない＝数値で見える）。v2.8: 24px で 1 行に収まる長さに。Δzoom / Δrot は state() に残す
  panel.note('上下左右の中央値');

  return { panel, median1, median5, pose };
}

/** 計測結果を Panel に反映する（数値が無いときは `—`。`Panel.value` が 0 で埋めない） */
function updatePanel(result) {
  const ui = runtime.values;
  if (!ui.panel || !result) return;
  const tag = modeTag(runtime.mode);

  ui.median1.set(result.median1);
  ui.median5.set(result.median5);
  // 押している方式のずれを濃く（もう一方は薄く）。値は両方とも出す
  for (const el of ui.pose?.querySelectorAll('[data-k]') ?? []) {
    el.classList.toggle('off', el.dataset.k !== runtime.mode);
  }
  const poseValues = poseOf();
  const put = (key, text) => {
    const el = ui.pose?.querySelector(`[data-v="${key}"]`);
    if (el) el.textContent = text;
  };
  if (poseValues) {
    put('hist-rot', `${fmtSigned(poseValues.hist.rotationDeg, 0)}°`);
    put('hist-zoom', poseValues.hist.zoom.toFixed(1));
    put('modern-rot', `${fmtSigned(poseValues.modern.rotationDeg, 0)}°`);
    put('modern-zoom', poseValues.modern.zoom.toFixed(1));
  }
  // v2.8: 見出しが 24px で 2 行に折れた ∴「DEMO-D」を落として短くした
  ui.panel.title(`表示: ${tag}`);
  updateTable(result);
}

const SUB = ['₁', '₂', '₃', '₄'];
const DIR = ['上', '右', '下', '左'];
const deg = (rad) => (rad * 180) / Math.PI;
const fmtSigned = (v, digits) => {
  const text = Math.abs(v).toFixed(digits);
  if (Number(text) === 0) return text; // 「+0」「−0」を出さない
  return `${v >= 0 ? '+' : '−'}${text}`;
};

/**
 * 両面の回転（度・右回りが正・(−180, 180]）とズーム。回転は MapView の `rotation`
 * （canvas の y 下向き系で増える向き＝画面で時計回り）をそのまま度にしたもの。
 */
function poseOf() {
  if (!runtime.left || !runtime.right) return null;
  const pose = (view) => {
    const vp = view.getViewpoint();
    return { rotationDeg: deg(normalizeAngle(vp.rotation ?? 0)), zoom: vp.zoom };
  };
  return { hist: pose(runtime.left), modern: pose(runtime.right) };
}

/** 開始位置のままか（1 点と 5 点が定義上同じになる位置） */
function atStart() {
  const a = runtime.vpStart;
  const b = runtime.left?.getViewpoint();
  if (!a || !b) return false;
  return Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) < 1e-9
    && Math.abs(a.zoom - b.zoom) < 1e-9 && Math.abs((a.rotation ?? 0) - (b.rotation ?? 0)) < 1e-9;
}

/**
 * 右下の表: 変換後の 4 点の距離 dᵢ（m）と角度差 θᵢ（度）、その平均（距離の平均・角度差の円周平均）と、
 * そこから決まるズーム・回転。値は `fivePointParts`（viewpoint.ts と同じ定義）の実測だけ。
 */
function updateTable(result) {
  const el = document.getElementById('vp5-table');
  if (!el || !result?.parts5) return;
  const p = result.parts5;
  // v2.8: 20px で幅 276px に収めるため、dᵢ θᵢ と単位は見出しの行へ（資料 #14 の dᵢ θᵢ と同じ記号）
  const rows = p.d.map((d, i) => `<tr><th style="color:${FIVE_POINT_COLORS[i + 1]}">${DIR[i]}</th>`
    + `<td>${d.toFixed(1)}</td><td>${fmtSigned(deg(p.theta[i]), 2)}</td></tr>`).join('');
  const start = atStart();
  // 平均の行: 距離は算術平均、角度差は円周平均（atan2(Σsin, Σcos)）
  // v2.8: 20px にしたぶん、見出しと凡例を短くし、「1 点の据え置きとの差」の行は表から外した（値は state() に残す）。
  // 表は「上」（x≈300・y≈250）と「左」（y≈400）の点に届かない大きさに収める
  el.innerHTML = `<div class="ttl">5 点から縮尺と方角（実測）</div>
    <table><tr class="hd"><th></th><td>dᵢ（m）</td><td>θᵢ（°）</td></tr>${rows}
      <tr class="mean"><th>平均</th><td>${p.meanD.toFixed(1)}</td><td>${fmtSigned(deg(p.meanTheta), 2)}</td></tr>
    </table>
    <div class="res">→ 縮尺（ズーム）${p.zoom.toFixed(3)}<br>→ 方角（回転）${fmtSigned(deg(p.rotation), 2)}°</div>
    <div class="key"><span class="${runtime.mode === 'five' ? '' : 'faint'}"><span class="sq"></span>平均の正方形</span>　<span class="ar"></span>ずれ</div>
    <div class="key"><span class="tg"></span>目標　<span class="${runtime.mode === 'one' ? '' : 'faint'}"><span class="sq gray"></span>目標の正方形</span></div>
    ${start && runtime.hint && !runtime.playing ? '<div class="hint">開始位置では 1 点と 5 点が同じ。絵図を回すか「収録と同じ移動」を押す</div>' : ''}`;
}

// ---------------------------------------------------------------------------
// 計測と方式の切り替え
// ---------------------------------------------------------------------------

/**
 * 現在の絵図側 Viewpoint で計測し、右面を方式に合わせて更新する。
 * 失敗（TIN の範囲外など）は地図を壊さず、原因だけ残す（数値を偽らない）。
 */
function applyMode() {
  if (!runtime.left || !runtime.right || !runtime.mt || !runtime.vpDst) return null;
  const vp = runtime.left.getViewpoint();
  let result;
  try {
    result = cornerOffsets(runtime.mt, vp, syncSize(), runtime.vpDst);
  } catch (error) {
    console.warn('DEMO-D: 計測できない（TIN の範囲外など）', error);
    showNote(`この位置では計測できない: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  hideNote();
  runtime.measurement = result;

  const target = runtime.mode === 'one' ? result.vp1 : result.vp5;
  runtime.syncing = true;
  try {
    runtime.right.setViewpoint(target, { silent: true });
  } finally {
    runtime.syncing = false;
  }
  updatePanel(result);
  runtime.left.draw(); // マーカー・矢印は measurement を参照する ∴ 左面も描き直す
  return result;
}

/** 方式を切り替える（DOM ボタンと同じ経路）。`one` | `five` 以外は例外 */
function setMode(mode) {
  if (mode !== 'one' && mode !== 'five') {
    throw new RangeError(`setMode の mode は 'one' か 'five': ${String(mode)}`);
  }
  runtime.mode = mode;
  for (const button of document.querySelectorAll('#mode-buttons button')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  }
  applyMode();
  return snapshot();
}

/** 絵図側の中心を **絵図ピクセル** で動かす（収録用。画面 px ではない） */
function dragBy(delta) {
  if (!runtime.left) throw new Error('dragBy: 地図がまだ準備できていない（window.__demoD.ready を待つ）');
  if (!Array.isArray(delta) || delta.length < 2
    || typeof delta[0] !== 'number' || !Number.isFinite(delta[0])
    || typeof delta[1] !== 'number' || !Number.isFinite(delta[1])) {
    throw new TypeError(`dragBy の delta は有限の [dx, dy]: ${JSON.stringify(delta)}`);
  }
  const vp = runtime.left.getViewpoint();
  const image = runtime.left.mapToImagePixel(vp.center);
  const center = xy2SysCoord([image[0] + delta[0], image[1] + delta[1]], runtime.left.maxxy);
  runtime.left.setViewpoint({ center, zoom: vp.zoom, rotation: vp.rotation }); // change → applyMode
  return snapshot();
}

/** ホイール。`steps` 段（1 段 = 1.15 倍、画面中央を固定） */
function wheel(steps) {
  if (!runtime.left) throw new Error('wheel: 地図がまだ準備できていない（window.__demoD.ready を待つ）');
  if (typeof steps !== 'number' || !Number.isFinite(steps)) {
    throw new TypeError(`wheel の steps は有限数: ${JSON.stringify(steps)}`);
  }
  const canvas = runtime.left.canvas;
  runtime.left.zoomAt([canvas.width / 2, canvas.height / 2], Math.pow(WHEEL_FACTOR, steps));
  return snapshot();
}

/** 待つ（筋書きの間合い）。世代が変わったら早めに返る */
function pause(ms, generation) {
  return new Promise((resolve) => {
    const end = performance.now() + Math.max(0, ms);
    const tick = () => {
      if (runtime.motion !== generation || performance.now() >= end) resolve();
      else setTimeout(tick, Math.min(100, end - performance.now()));
    };
    tick();
  });
}

/** 0→1 のなめらかな進み（動き始めと終わりをゆっくり） */
const ease = (t) => t * t * (3 - 2 * t);

/**
 * 絵図を画面の中心のまわりで回し・拡大する。`ms > 0` なら `ms` かけて動かす（Promise）。
 * 途中で別の動き（ボタン・`reset()`・`playScript()`）が始まったら、そこで止まる。
 * @returns {Promise<object>} 動き終えた時点の `state()`
 */
function turn({ rotateDeg = 0, zoomFactor = 1, ms = 0 } = {}, generation = (runtime.motion += 1)) {
  if (!runtime.left) return Promise.reject(new Error('turn: 地図がまだ準備できていない（window.__demoD.ready を待つ）'));
  const from = runtime.left.getViewpoint();
  // 入力の検査は turnViewpoint が持つ（rotateDeg は有限数・zoomFactor は正）
  const target = turnViewpoint(from, rotateDeg, zoomFactor);
  if (!(ms > 0)) {
    runtime.left.setViewpoint(target); // change → applyMode
    return Promise.resolve(snapshot());
  }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = () => {
      if (runtime.motion !== generation) { resolve(snapshot()); return; }
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = ease(t);
      runtime.left.setViewpoint(turnViewpoint(from, rotateDeg * e, zoomFactor ** e));
      if (t < 1) requestAnimationFrame(frame);
      else resolve(snapshot());
    };
    requestAnimationFrame(frame);
  });
}

/** 絵図を `deg` 度回す（正＝右回り）。`{ ms }` を渡すとその長さで動かす（Promise） */
function rotateBy(degrees, { ms = 0 } = {}) {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) {
    throw new TypeError(`rotateBy の deg は有限数: ${JSON.stringify(degrees)}`);
  }
  const p = turn({ rotateDeg: degrees, ms });
  return ms > 0 ? p : snapshot();
}

/** 絵図を `factor` 倍に拡大する（0.5 で縮小）。`{ ms }` を渡すとその長さで動かす（Promise） */
function zoomBy(factor, { ms = 0 } = {}) {
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(`zoomBy の factor は正の有限数: ${JSON.stringify(factor)}`);
  }
  const p = turn({ zoomFactor: factor, ms });
  return ms > 0 ? p : snapshot();
}

/** 回転と拡大を同時に（筋書きの「左へ 90° 回しながら縮小」）。Promise */
function animate({ rotateDeg = 0, zoomFactor = 1, ms = 0 } = {}) {
  return turn({ rotateDeg, zoomFactor, ms });
}

/** 開始位置へ戻す（方式はそのまま）。動いている途中の動き・筋書きは止める */
function reset() {
  runtime.motion += 1;
  runtime.playing = false;
  if (!runtime.left || !runtime.vpStart) throw new Error('reset: 地図がまだ準備できていない（window.__demoD.ready を待つ）');
  runtime.left.setViewpoint({ ...runtime.vpStart, center: [...runtime.vpStart.center] }); // change → applyMode
  return snapshot();
}

/**
 * 筋書き（`DEMO_D_SCRIPT`）を頭から通す。確認ページの「収録と同じ移動」と同じ。
 * 開始位置・1 点方式から始め、段ごとに方式を切り替え、回し・拡大し、`holdMs` 待つ。
 * @returns {Promise<object[]>} 段ごとの `state()`（段の動きを終えた時点）
 */
async function playScript() {
  reset();
  const generation = (runtime.motion += 1);
  runtime.playing = true;
  const states = [];
  try {
    for (const step of DEMO_D_SCRIPT) {
      if (runtime.motion !== generation) break;
      if (runtime.mode !== step.mode) setMode(step.mode);
      if (step.rotateDeg !== 0 || step.zoomFactor !== 1) {
        await turn({ rotateDeg: step.rotateDeg, zoomFactor: step.zoomFactor, ms: step.ms }, generation);
      }
      states.push({ id: step.id, ...snapshot() });
      await pause(step.holdMs, generation);
    }
  } finally {
    if (runtime.motion === generation) runtime.playing = false;
    updatePanel(runtime.measurement);
  }
  return states;
}

/** 開始位置の手引き（表の下の 1 行）の表示を切り替える（収録は false） */
function setHint(show) {
  runtime.hint = Boolean(show);
  updatePanel(runtime.measurement);
  return snapshot();
}

/** 現在位置で測り直す（収録の `measure()`） */
function measure() {
  applyMode();
  return snapshot();
}

/** `window.__demoD.state()`。**実測値だけ**を返す（未計測は null） */
function snapshot() {
  const r = runtime.measurement;
  return {
    mode: runtime.mode,
    d1: r ? [...r.d1] : null,
    d5: r ? [...r.d5] : null,
    median1: r ? r.median1 : null,
    median5: r ? r.median5 : null,
    dZoom: r ? r.dZoom : null,
    /** 5 点から縮尺と方角を決める過程（資料 #14）。dᵢ は m、θᵢ・平均・rotation はラジアン */
    parts5: r ? {
      d: [...r.parts5.d], theta: [...r.parts5.theta], meanD: r.parts5.meanD, meanTheta: r.parts5.meanTheta,
      zoom: r.parts5.zoom, rotation: r.parts5.rotation, radiusPx: r.parts5.radiusPx,
    } : null,
    dRot: r ? r.dRot : null,
    vpDst: runtime.vpDst
      ? {
        center: [...runtime.vpDst.center],
        zoom: runtime.vpDst.zoom,
        rotation: runtime.vpDst.rotation,
      }
      : null,
    drawnTiles: {
      left: runtime.left ? runtime.left.drawnTiles : 0,
      right: runtime.right ? runtime.right.drawnTiles : 0,
    },
    // 補助（T8 の sidecar と目視の確認用）
    median1Px: r ? r.median1Px : null,
    median5Px: r ? r.median5Px : null,
    d1Px: r ? [...r.d1Px] : null,
    d5Px: r ? [...r.d5Px] : null,
    vp1: r ? { center: [...r.vp1.center], zoom: r.vp1.zoom, rotation: r.vp1.rotation } : null,
    vp5: r ? { center: [...r.vp5.center], zoom: r.vp5.zoom, rotation: r.vp5.rotation } : null,
    truth: r ? r.truth.map((point) => [...point]) : null,
    residual5: r ? [...r.residual5] : null,
    medianResidual5: r ? r.medianResidual5 : null,
    pixelsPerMercator: r ? pixelsPerMercator(r.vp1.zoom) : null,
    /** v3.0: 両面の回転（度・右回りが正）とズーム。絵図を回したとき現代地図が付いてくるかを読む */
    hist: poseOf()?.hist ?? null,
    modern: poseOf()?.modern ?? null,
    /** 押されている方式ボタン（aria-pressed="true" の data-mode）。字幕と照合する */
    pressed: document.querySelector('#mode-buttons button[aria-pressed="true"]')?.dataset.mode ?? null,
    playing: runtime.playing,
  };
}

// モジュール評価直後にフックを置く（`page.evaluate` が読み込み途中でも `ready` を掴める）
window.__demoD = {
  ready: readyPromise,
  setMode: (mode) => setMode(mode),
  dragBy: (delta) => dragBy(delta),
  wheel: (steps) => wheel(steps),
  measure: () => measure(),
  state: () => snapshot(),
  rotateBy: (degrees, options) => rotateBy(degrees, options),
  zoomBy: (factor, options) => zoomBy(factor, options),
  animate: (options) => animate(options),
  reset: () => reset(),
  playScript: () => playScript(),
  setHint: (show) => setHint(show),
  script: DEMO_D_SCRIPT,
};

// ---------------------------------------------------------------------------
// 補助描画: 5 点マーカーと 4 点の差分ベクトル
// ---------------------------------------------------------------------------

/** メルカトルの点をその面の canvas ピクセルへ（絵図側は逆 TIN を 1 回通す） */
function screenOf(view, merc) {
  if (view.kind === 'hist') {
    const image = transformPoint(runtime.mt, merc, true); // 実メルカトル → 絵図ピクセル
    return view.imageToScreen(image);
  }
  return view.mapToPixel(merc);
}

/** 矢印（差分ベクトル）。短すぎるときは丸だけ残す（0 を矢印で偽らない） */
function drawArrow(ctx, from, to, dpr) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (!(length > 0.5)) return;
  // 矢じりは線の長さに合わせる（5 点方式の矢印は 4〜8px ∴ 12px 固定のままだと塊になる）
  const head = Math.min(16 * dpr, Math.max(3 * dpr, length * 0.5)); // v3.1（L5）: 矢じりは最大 16px
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.strokeStyle = 'rgba(10, 14, 22, 0.65)';
  ctx.lineWidth = 6 * dpr;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
  ctx.strokeStyle = ARROW_COLOR;
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
  ctx.fillStyle = ARROW_COLOR;
  ctx.beginPath();
  ctx.moveTo(to[0], to[1]);
  ctx.lineTo(to[0] - head * Math.cos(angle - 0.45), to[1] - head * Math.sin(angle - 0.45));
  ctx.lineTo(to[0] - head * Math.cos(angle + 0.45), to[1] - head * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** canvas の点列を白い縁取り＋本線でつなぐ */
function strokeLine(ctx, pts, color, width, dpr, { dash = [], close = false } = {}) {
  if (pts.length < 2 || pts.some((p) => !p)) return;
  const trace = () => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.setLineDash([]); ctx.lineWidth = (width + 3) * dpr; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; trace(); ctx.stroke();
  ctx.setLineDash(dash.map((d) => d * dpr)); ctx.lineWidth = width * dpr; ctx.strokeStyle = color; trace(); ctx.stroke();
  ctx.restore();
}

/** 文字に白い縁を付けて置く */
function label(ctx, text, [x, y], color, dpr, align = 'left') {
  ctx.save();
  ctx.font = `bold ${18 * dpr}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.textBaseline = 'middle'; ctx.textAlign = align;
  // v2.9（visual 1 の残り）: 縁取りを 4 → 6px・不透明の白に（地図の上で確実に読める）
  ctx.lineJoin = 'round'; ctx.lineWidth = 6 * dpr; ctx.strokeStyle = '#ffffff'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.restore();
}

/** 正方形の角（白抜きの丸） */
function hollowDot(ctx, p, color, dpr) {
  ctx.save();
  ctx.beginPath(); ctx.arc(p[0], p[1], 8 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = color; ctx.stroke();
  ctx.restore();
}

/**
 * `MapView.addOverlay` に渡す補助描画（資料 #14 の描き方）。
 *   絵図面 … 十字の 4 点を結ぶ正方形（inkMuted）と中心からの細線、5 点（色分け）と名前
 *   現代地図面・5 点 … 平均で組み直した正方形（橙の破線・白抜きの角）→ 中心から 4 点への線と dᵢ θᵢ →
 *                       4 点の差分ベクトル（真値 → 正方形の角）→ 5 点
 *   現代地図面・1 点 … 据え置いた正方形（灰の破線）→ 差分ベクトル（真値 → 正方形の角）→ 5 点
 */
function drawMarkers(ctx, view) {
  const result = runtime.measurement;
  if (!result) return;
  const dpr = Number.isFinite(view.dpr) && view.dpr > 0 ? view.dpr : 1;
  const points = result.truth.map((merc) => {
    try {
      const screen = screenOf(view, merc);
      return Array.isArray(screen) && Number.isFinite(screen[0]) && Number.isFinite(screen[1]) ? screen : null;
    } catch (error) {
      return null; // 逆変換できない点は描かない（地図は描き続ける）
    }
  });
  const toPx = (arr) => arr.map((m) => { try { return view.mapToPixel(m); } catch { return null; } });
  const NAMES = ['中心', '上', '右', '下', '左'];

  if (view.kind === 'hist') {
    if (points.slice(1).every(Boolean)) strokeLine(ctx, points.slice(1), DECK_COLOR.inkMuted, 1.5, dpr, { close: true });
    for (let i = 1; i <= 4; i += 1) if (points[0] && points[i]) strokeLine(ctx, [points[0], points[i]], DECK_COLOR.inkMuted, 1, dpr);
  } else {
    // v3.0: 「目標」＝左面と同じ画面オフセット（中心から上下左右に min(w,h)/4）の 4 点。薄い墨の丸。
    // 方式が指す 4 点（正方形の角）は定義上ここに来る ∴ 変換後の印（色の点）との差が矢印になる
    const [w, h] = [view.canvas?.width ?? 600 * dpr, view.canvas?.height ?? 800 * dpr];
    const r = Math.floor(Math.min(w, h) / 4);
    for (const [ox, oy] of [[0, -r], [r, 0], [0, r], [-r, 0]]) {
      ctx.save();
      ctx.beginPath(); ctx.arc(w / 2 + ox, h / 2 + oy, 17 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = TARGET_FILL; ctx.fill();
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = TARGET_STROKE; ctx.stroke();
      ctx.restore();
    }
    const five = runtime.mode === 'five';
    const corners = toPx((five ? result.corners5 : result.corners1).slice(1));
    const squareColor = five ? DECK_COLOR.orange : ONE_SQUARE_COLOR;
    strokeLine(ctx, corners, squareColor, 2.5, dpr, { dash: [10, 6], close: true });
    for (const c of corners) if (c) hollowDot(ctx, c, squareColor, dpr);
    if (five) {
      for (let i = 1; i <= 4; i += 1) if (points[0] && points[i]) strokeLine(ctx, [points[0], points[i]], DECK_COLOR.ink, 2, dpr);
    }
    for (let i = 1; i <= 4; i += 1) if (points[i] && corners[i - 1]) drawArrow(ctx, points[i], corners[i - 1], dpr);
  }

  // 5 点（中心＋上下左右 = MERC_CROSSMATRIX の順。両面同色）
  points.forEach((screen, index) => {
    if (!screen) return;
    const color = FIVE_POINT_COLORS[index];
    ctx.save();
    ctx.beginPath(); ctx.arc(screen[0], screen[1], (index === 0 ? 9 : 8) * dpr, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = DECK_COLOR.paper; ctx.stroke();
    ctx.restore();
    let text = NAMES[index];
    if (view.kind === 'modern' && runtime.mode === 'five' && index > 0) text = `${NAMES[index]} d${SUB[index - 1]} θ${SUB[index - 1]}`;
    // v3.1（M3）: 左面の十字は右へ寄せた（中心 x≈430）∴「右」の名札は面の右端で切れないよう点の左に置く
    if (view.kind === 'hist' && index === 2) {
      label(ctx, text, [screen[0] - 13 * dpr, screen[1] - 15 * dpr], color, dpr, 'right');
    } else {
      label(ctx, text, [screen[0] + 13 * dpr, screen[1] - 15 * dpr], index === 0 ? DECK_COLOR.ink : color, dpr);
    }
  });
}

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

async function main() {
  const { name, invalid } = pickDataName();
  runtime.dataName = name;
  if (invalid) {
    showNote(`?data=${invalid} は使えない。既定の ${DEFAULT_DATA} を表示`);
  }

  const data = await loadCompiled(name);
  runtime.data = data;

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
    rotatable: true, // Shift＋ドラッグで回す（v3.0）
    wheelRotate: true, // Shift＋ホイールで回す（v3.0。他のデモはズームのまま）
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

  // 収録開始位置（絵図の中央付近）へ寄せる。同期の前に置く（change はまだ購読しない）
  const startImage = startImagePoint(data);
  left.setViewpoint({
    center: xy2SysCoord(startImage, left.maxxy),
    zoom: startZoom(),
    rotation: 0,
  }, { silent: true });

  runtime.vpStart = left.getViewpoint();

  // 開始位置で 5 点方式の同期を 1 回行い、現代地図側 Viewpoint を「据え置き値」として覚える
  let vpDst = null;
  try {
    vpDst = syncViewpoint(mt, left.getViewpoint(), syncSize(), SYNC_HIST_TO_MODERN);
    right.setViewpoint(vpDst, { silent: true });
  } catch (error) {
    console.warn('DEMO-D: 初期同期に失敗（現代地図は仮位置のまま）', error);
  }
  runtime.vpDst = vpDst;

  // Panel（左面の左下寄り・幅 272px。数値は panel.mjs が 28px に固定する）
  const ui = buildPanel(stage);
  // マーカーと一緒に dᵢ θᵢ の添字を使う ∴ 表は Panel の後で作る
  runtime.panel = ui.panel;
  runtime.values = ui;

  // 補助描画（両面に同じ関数を登録する。矢印は関数の中で現代地図面だけに絞る）
  left.addOverlay(drawMarkers);
  right.addOverlay(drawMarkers);

  installCursor(stage);

  // 「収録と同じ移動」: 開始位置・1 点方式へ戻してから、筋書き（DEMO_D_SCRIPT）を通す
  document.getElementById('record-move')?.addEventListener('click', () => {
    playScript().catch((error) => console.warn('DEMO-D: 筋書きを通せない', error));
  });

  // 左面の回転・拡大ボタン（v3.0）。押すたびに 30° ／ 2 倍。動いている途中の筋書きは止める
  const turnButtons = {
    'turn-left': { rotateDeg: -BUTTON_TURN_DEG },
    'turn-right': { rotateDeg: BUTTON_TURN_DEG },
    'zoom-in': { zoomFactor: BUTTON_ZOOM_FACTOR },
    'zoom-out': { zoomFactor: 1 / BUTTON_ZOOM_FACTOR },
  };
  for (const [id, spec] of Object.entries(turnButtons)) {
    document.getElementById(id)?.addEventListener('click', () => {
      runtime.playing = false;
      turn({ ...spec, ms: BUTTON_MS }).catch((error) => console.warn('DEMO-D: 回せない', error));
    });
  }
  document.getElementById('turn-reset')?.addEventListener('click', () => {
    try { reset(); } catch (error) { console.warn('DEMO-D: 戻せない', error); }
  });

  // 方式ボタン（収録は page.click で押す）
  for (const button of document.querySelectorAll('#mode-buttons button[data-mode]')) {
    button.addEventListener('click', () => {
      try {
        setMode(button.dataset.mode);
      } catch (error) {
        console.warn('DEMO-D: 方式を切り替えられない', error);
      }
    });
  }

  // 絵図側が動いたら計測して現代地図側を方式に合わせる。右面を直接動かしても方式へ戻す
  left.on('change', () => {
    if (!runtime.syncing) applyMode();
  });
  right.on('change', () => {
    if (!runtime.syncing) applyMode();
  });

  // 最初の計測（右面は 5 点方式）
  applyMode();

  // 収録前の空撮り防止（要件書 §3）
  await Promise.all([
    left.ready({ minTiles: 1, timeoutMs: 30000 }),
    right.ready({ minTiles: 1, timeoutMs: 30000 }),
  ]);
  applyMode();
  resolveReady(snapshot());
}

main().catch((error) => {
  rejectReady(error);
  showFatal(error);
});

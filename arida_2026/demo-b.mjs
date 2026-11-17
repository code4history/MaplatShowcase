/**
 * DEMO-B v2「端を越えても、位置は連続したまま」（2026-10-24・語りの設計メモ §2 #11・§3）。
 *
 * 左: 館林御城図（〔日本古城絵図〕東山道之部・plain・国立国会図書館蔵。対応点の凸包＝実線・画像の四辺形（vertices_points の 4 点＝画像 wh を 5% 広げた矩形）＝破線）
 *     四辺形の内側は、四隅の予測点を対応点に加えた三角網で覆われ、四辺形の外は四隅から伸びる無限大の三角形で外挿される
 *     （事実表 §4.3 の訂正ブロック。「凸包と境界多角形の間を塗る」「36 方位ビン」「全対応点を内包するまで広げる」は使わない）
 * 右: 現代地図。**左でカーソルが指している点を変換した位置にピンを出し、右面はそれを追う。**
 * カーソルが凸包を越えても右のピンは飛ばず連続して動く。右面にはピンの軌跡（直近 N 点）を描く。
 *
 * 2026-11-01 発表者の指摘で改めた見せ方:
 *   - 三角網を**両面に**、域ごとの色で描く（右上の帯と同じ色）: 凸包の内の三角形（対応点だけ）＝緑・
 *     凸包の外で四辺形の内の三角形（四隅の予測点を使う）＝青・四辺形の外の無限大三角形（四隅から外へ伸びる扇）＝茶
 *   - いま変換に使っている三角形（または扇）を、最前面に黄の太縁＋半透明の塗りで出す（扇は画面の端まで塗る）
 *   - カーソルの軌跡を両面に残す（左は絵図の上、右は変換先）
 *   - 回転（Shift＋ドラッグ）は使わない ∴ 両面とも切る（`rotatable: false`）
 *
 * 収録フック: `window.__demoB = { ready, state(), dataName, screenOfImage(xy), imageAtStage(xy), centerOn(xy), zoomLeft(f),
 *                               hull(), boundary() }`
 *   state() → { zone: 'inside'|'extrap'|'outside', cursorImage, merc, samples, maxStepRatio, drawnTiles, vertexMode,
 *               dataName,
 *               activeZone, active, triangleIndex, fanIndex }
 *   maxStepRatio = 右ピンの画面移動量 ÷ 左カーソルの画面移動量 の最大（連続なら数倍を超えない）
 *   zone は凸包・四辺形での判定（帯の色）、activeZone／active は**実際に選んだ三角形・扇**からの判定
 *   active = { kind: 'triangle', index, keys, zone } | { kind: 'fan', fan, corners: [s, s+1], zone: 'outside' } | null
 */
import { createTwoPane } from './lib/twopane.mjs';
import { normalizeName } from './lib/data.mjs';
import { TinView } from './lib/tinview.mjs';
import { installCursor } from './lib/cursor.mjs';
import { hullOfPoints, classifyPoint, isInExtrapolation, fanIndexOf, triangleZoneOf } from './lib/extrap.mjs';
import { pointInTriangle } from './lib/geom.mjs';
import { transformPoint } from './lib/sync.mjs';
import { DECK_COLOR, withAlpha } from './lib/deck-colors.mjs';
import { BAND_TEXT } from './lib/zone-band.mjs';
import { toStage, layoutRect, layoutSize } from './lib/stage-fit.mjs';

/**
 * 域の色。**右上の帯（demo-b.html の #band）と同じ色**: 緑＝凸包の内・青＝凸包の外で四辺形の内・茶＝四辺形の外。
 * 三角網の辺・四辺形の破線・無限大三角形の半直線・凡例をこの 3 色で塗り分ける。
 */
export const ZONE_COLOR = Object.freeze({ inside: '#1B7A3D', extrap: '#1565C0', outside: '#5D4037' });
/** 四隅から外へ伸びる放射線の色（帯の茶 #5D4037 より濃い。v2.8 visual 17） */
export const FAN_COLOR = '#5A3A1E';

/** 三角網の線（辺・扇の半直線）。主役ではないので細め。デモ①（1.8px・0.9）より控えめ */
const NET_LINE = Object.freeze({ width: 1.6, alpha: 0.8 });

/** いま変換に使っている三角形・扇（デモ①の対象三角形と同じ: 黄の太縁＋半透明の塗り＋暗い縁取り） */
const ACTIVE_LOOK = Object.freeze({
  color: DECK_COLOR.amber, width: 4, fill: withAlpha(DECK_COLOR.amber, 0.3), halo: 'rgba(20, 16, 10, 0.85)', haloWidth: 7.5,
});

/**
 * 重ね表示の見た目。**資料 #10 の図 `imageBoundsView`（slides/src/arida-diagrams.mjs）の線種に揃える**:
 *   対応点＝ink の点・凸包＝ink の実線・画像の四辺形＝破線・四隅の予測点＝orange の丸。
 * 地図の上で読めるように、凸包・四辺形の線の下に白い縁取りを敷く。
 */
const B_STYLE = Object.freeze({
  hull: { color: DECK_COLOR.ink, width: 3 },
  boundary: { color: ZONE_COLOR.extrap, width: 3, dash: [12, 7] },
  gcp: { radius: 2.2, fill: DECK_COLOR.ink, stroke: null, lineWidth: 0 },
});

/** 軌跡の色（カーソルの輪・右のピンと同じ水色） */
const TRAIL_COLOR = 'rgba(0, 229, 255, 0.75)';

/**
 * 既定の題材。2026-11-01 発表者の指摘で奈良町絵図（birdeye・凸包が画像の 81%・歪みが強い）から館林御城図へ差し替えた:
 * 対応点の凸包が画像の約 62% で、左右に余白（左 7%・右 6%。上下は 2%）がある ∴ 凸包の外・四辺形の内（外挿域）が見える。
 * デモ①の改正鮮明廣島市實測地圖（`kaisei_hiroshima_jissoku`）と別の図にして使い回しを避ける。
 * `?data=<名前>` で別の題材も選べる（例: `?data=kaisei_hiroshima_jissoku`。危険な名前は既定へ戻す）。
 */
export const DEFAULT_DATA = 'tatebayashi_ojozu';

/** `?data=` を解く。安全な名前（`normalizeName`）だけを受け、危険な名前は既定へ戻す */
function pickDataName() {
  const requested = new URLSearchParams(window.location.search).get('data');
  if (!requested) return DEFAULT_DATA;
  try { return normalizeName(requested); } catch { return DEFAULT_DATA; }
}
const DATA_NAME = pickDataName();
const TRAIL_MAX = 240;

const runtime = {
  tp: null, hull: null, boundary: null, centroid: null, zone: 'inside', cursorImage: null, merc: null,
  trail: [], trailImage: [], samples: 0, maxStepRatio: 0, lastCursor: null, lastPin: null, vertexMode: null,
  /** 両面の三角網（`buildNet`）。hist＝絵図ピクセル・modern＝メルカトル */
  net: { hist: null, modern: null },
  /** いま変換に使っている三角形／扇（`findActive`） */
  active: null,
};

let resolveReady = () => {}; let rejectReady = () => {};
const readyPromise = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

function setBand(zone) {
  const band = document.getElementById('band');
  if (!band) return;
  band.dataset.zone = zone;
  // 文言は zone-band.mjs（収録の帯ゲートと共有。v2.9 N1）
  const t = BAND_TEXT[zone] ?? BAND_TEXT.outside;
  band.innerHTML = `${t.title}<small>${t.sub}</small>`;
}

/**
 * 1 面ぶんの三角網の形（座標は面の座標系）。`TinView` の三角形・辺をそのまま使い、域で分ける。
 *   edges.inside … 両端が対応点（・辺ノード）の辺 ／ edges.extrap … 四隅の予測点 b* に接する辺
 *   hull … 凸包（絵図側の凸包と**同じ対応点の番号**で結んだ多角形。右面では凸でなくてもよい）
 */
function buildNet(tin, hullIndices) {
  const isCorner = (key) => /^b\d+$/.test(key);
  const edges = { inside: [], extrap: [] };
  for (const e of tin.tinEdges) (isCorner(e.aKey) || isCorner(e.bKey) ? edges.extrap : edges.inside).push([e.a, e.b]);
  return {
    edges,
    triangles: tin.triangles,
    corners: tin.boundary,
    centroid: tin.centroid,
    hull: hullIndices.map((i) => tin.gcps[i]),
    gcps: tin.gcps,
  };
}

/** 面の座標 → canvas ピクセル（絵図面は画像ピクセル、地図面はメルカトル） */
function projectorOf(view, side) {
  return side === 'hist' ? (p) => view.imageToScreen(p) : (p) => view.mapToPixel(p);
}

/**
 * 扇（無限大三角形）の半直線の先。**画面の外まで**伸ばした canvas ピクセルを返す（画面空間で伸ばす ∴ 拡大しても切れない）。
 * 重心 → 隅の向きに、canvas の対角線の 3 倍＋重心の画面外への距離だけ伸ばす。
 */
function farScreenPoint(cS, vS, view) {
  const w = view.canvas?.width ?? 1200; const h = view.canvas?.height ?? 1600;
  const dx = vS[0] - cS[0]; const dy = vS[1] - cS[1]; const len = Math.hypot(dx, dy) || 1;
  const reach = Math.hypot(w, h) * 3 + Math.hypot(cS[0] - w / 2, cS[1] - h / 2);
  return [cS[0] + (dx / len) * reach, cS[1] + (dy / len) * reach];
}

/** 扇 s の多角形（canvas ピクセル）: 隅 s → 画面外 s → 二等分の向きの画面外 → 画面外 s+1 → 隅 s+1 */
function fanPolygon(net, s, view, project) {
  const n = net.corners.length;
  const cS = project(net.centroid);
  const a = project(net.corners[s]); const b = project(net.corners[(s + 1) % n]);
  const fa = farScreenPoint(cS, a, view); const fb = farScreenPoint(cS, b, view);
  const mid = [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2];
  const fm = farScreenPoint(cS, [cS[0] + (mid[0] - cS[0]), cS[1] + (mid[1] - cS[1])], view);
  return [a, fa, fm, fb, b];
}

/** canvas ピクセルの折れ線を、白い縁取り（任意）＋本線で描く */
function strokeScreen(ctx, pts, { color, width, dash = [], close = false, halo = true }, dpr) {
  if (pts.length < 2) return;
  const trace = () => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  if (halo) {
    ctx.setLineDash([]); ctx.lineWidth = (width + 3) * dpr; ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    trace(); ctx.stroke();
  }
  ctx.setLineDash(dash.map((d) => d * dpr)); ctx.lineWidth = width * dpr; ctx.strokeStyle = color;
  trace(); ctx.stroke();
  ctx.restore();
}

/** 辺の集まりを 1 本のパスで描く（数千本ある ∴ stroke は 1 回） */
function strokeSegments(ctx, segs, project, color, dpr) {
  ctx.save();
  ctx.beginPath();
  for (const [a, b] of segs) {
    const p = project(a); const q = project(b);
    ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
  }
  ctx.lineWidth = NET_LINE.width * dpr; ctx.strokeStyle = withAlpha(color, NET_LINE.alpha); ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/** いま使っている三角形／扇を最前面に（黄の太縁＋半透明の塗り） */
function drawActive(ctx, view, side, project, dpr) {
  const net = runtime.net[side]; const act = runtime.active;
  if (!net || !act) return;
  let pts; let close = true;
  if (act.kind === 'triangle') {
    const tri = net.triangles[act.index];
    if (!tri) return;
    pts = tri.points.map(project);
  } else {
    pts = fanPolygon(net, act.fan, view, project);
    close = false; // 画面の外側の辺は描かない（塗りは閉じる）
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = ACTIVE_LOOK.fill; ctx.fill();
  const outline = () => {
    ctx.beginPath();
    if (close) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    } else {
      // 扇: 半直線 2 本と四辺形の 1 辺（隅 s → 隅 s+1）
      const [a, fa, , fb, b] = pts;
      ctx.moveTo(fa[0], fa[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(fb[0], fb[1]);
    }
  };
  outline(); ctx.lineWidth = ACTIVE_LOOK.haloWidth * dpr; ctx.strokeStyle = ACTIVE_LOOK.halo; ctx.stroke();
  outline(); ctx.lineWidth = ACTIVE_LOOK.width * dpr; ctx.strokeStyle = ACTIVE_LOOK.color; ctx.stroke();
  ctx.restore();
}

/** 軌跡（水色の折れ線） */
function drawTrail(ctx, trail, project, dpr) {
  const pts = trail.map((m) => { try { return project(m); } catch { return null; } }).filter(Boolean);
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineWidth = 4 * dpr; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = TRAIL_COLOR;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke(); ctx.restore();
}

/**
 * 1 面の覆い（両面で同じ描き方。#10 の図の要素＋域の色分け）。下から:
 *   1. 三角網の辺（緑＝凸包の内・青＝凸包の外で四辺形の内）
 *   2. 四辺形の外の無限大三角形 … 重心から各隅を通って外へ伸びる半直線（茶）。
 *      隣り合う 2 本と四辺形の 1 辺に挟まれた扇が 1 つの無限大三角形
 *   3. 対応点の凸包（ink の実線）・画像の四辺形（青の破線）・四隅の予測点（orange の丸）
 *   4. いま使っている三角形／扇（最前面。黄）
 *   5. カーソルの軌跡（水色）
 */
function drawNetwork(ctx, view, side) {
  const net = runtime.net[side];
  if (!net) return;
  const dpr = view.dpr || 1;
  const project = projectorOf(view, side);
  strokeSegments(ctx, net.edges.inside, project, ZONE_COLOR.inside, dpr);
  strokeSegments(ctx, net.edges.extrap, project, ZONE_COLOR.extrap, dpr);
  if (net.centroid && net.corners.length >= 3) {
    const cS = project(net.centroid);
    ctx.save();
    ctx.beginPath();
    for (const v of net.corners) {
      const vS = project(v); const far = farScreenPoint(cS, vS, view);
      ctx.moveTo(vS[0], vS[1]); ctx.lineTo(far[0], far[1]);
    }
    // v2.8（visual 17）: 茶の放射線はベージュの地で見えなかった ∴ 3px・濃い茶 #5A3A1E（不透明）
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = FAN_COLOR;
    ctx.stroke();
    ctx.restore();
  }
  if (net.hull.length >= 3) strokeScreen(ctx, net.hull.map(project), { ...B_STYLE.hull, close: true }, dpr);
  if (net.corners.length >= 3) strokeScreen(ctx, net.corners.map(project), { ...B_STYLE.boundary, close: true }, dpr);
  for (const p of net.corners.map(project)) {
    ctx.save();
    ctx.beginPath(); ctx.arc(p[0], p[1], 10 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = DECK_COLOR.orange; ctx.fill();
    ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = DECK_COLOR.paper; ctx.stroke();
    ctx.restore();
  }
  drawActive(ctx, view, side, project, dpr);
  drawTrail(ctx, side === 'hist' ? runtime.trailImage : runtime.trail, project, dpr);
}

/** 右面の覆い: 変換先のピン（軌跡は drawNetwork が描く） */
function drawPin(ctx, view) {
  if (!runtime.merc) return;
  const dpr = view.dpr || 1;
  let p; try { p = view.mapToPixel(runtime.merc); } catch { return; }
  ctx.save();
  ctx.lineWidth = 6 * dpr; ctx.strokeStyle = 'rgba(6,12,22,.7)';
  ctx.beginPath(); ctx.arc(p[0], p[1], 14 * dpr, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#00e5ff';
  ctx.beginPath(); ctx.arc(p[0], p[1], 14 * dpr, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p[0] - 22 * dpr, p[1]); ctx.lineTo(p[0] + 22 * dpr, p[1]);
  ctx.moveTo(p[0], p[1] - 22 * dpr); ctx.lineTo(p[0], p[1] + 22 * dpr); ctx.stroke();
  ctx.restore();
}

/**
 * カーソルの絵図ピクセルで**実際に変換に使う要素**を探す: 三角網の三角形に入ればその三角形
 * （b* を含めば外挿域）、どれにも入らなければ（＝四辺形の外）重心からの方位で選ぶ扇。
 */
function findActive(img) {
  const net = runtime.net.hist;
  if (!net) return null;
  for (const tri of net.triangles) {
    const [a, b, c] = tri.points;
    if (img[0] < Math.min(a[0], b[0], c[0]) || img[0] > Math.max(a[0], b[0], c[0])
      || img[1] < Math.min(a[1], b[1], c[1]) || img[1] > Math.max(a[1], b[1], c[1])) continue;
    if (pointInTriangle(img, a, b, c, 1e-9)) {
      return { kind: 'triangle', index: tri.index, keys: [...tri.keys], zone: triangleZoneOf(tri.keys) };
    }
  }
  const s = fanIndexOf(img, net.centroid, net.corners);
  if (s === null) return null;
  return { kind: 'fan', fan: s, corners: [s, (s + 1) % net.corners.length], zone: 'outside' };
}

function classify(imageXy) {
  const inHull = classifyPoint(imageXy, runtime.hull) === 'inside';
  if (inHull) return 'inside';
  return isInExtrapolation(imageXy, runtime.hull, runtime.boundary) ? 'extrap' : 'outside';
}

/** 収録面座標（CSS px）のカーソルを 1 サンプル処理する */
function sample(stageXy) {
  const tp = runtime.tp;
  if (!tp) return;
  // v3.5: 収録面のレイアウト座標で比べる（スマホでは #stage を縮尺 k で縮めている）
  const leftRect = layoutRect(tp.left.canvas, tp.stage);
  const inLeft = stageXy[0] >= leftRect.x && stageXy[0] < leftRect.x + leftRect.w;
  if (!inLeft) return;
  let img; try { img = tp.imageAtStage(stageXy); } catch { return; }
  let merc; try { merc = transformPoint(tp.mt, img, false); } catch { return; }
  runtime.cursorImage = img; runtime.merc = merc;
  const zone = classify(img);
  if (zone !== runtime.zone) { runtime.zone = zone; setBand(zone); }
  runtime.active = findActive(img);
  runtime.trail.push(merc); if (runtime.trail.length > TRAIL_MAX) runtime.trail.shift();
  runtime.trailImage.push(img); if (runtime.trailImage.length > TRAIL_MAX) runtime.trailImage.shift();
  // 連続性: 右ピンの画面移動量 ÷ 左カーソルの画面移動量。**追従（再中心化）の前**に測る
  const pinScreen = tp.screenOfMerc(merc);
  // 右面はピンを追う（中心＝ピン）
  const vp = tp.right.getViewpoint();
  tp.right.setViewpoint({ ...vp, center: merc }, { silent: true });
  if (runtime.lastCursor && runtime.lastPin && pinScreen) {
    const dc = Math.hypot(stageXy[0] - runtime.lastCursor[0], stageXy[1] - runtime.lastCursor[1]);
    const dp = Math.hypot(pinScreen[0] - runtime.lastPin[0], pinScreen[1] - runtime.lastPin[1]);
    if (dc >= 1) runtime.maxStepRatio = Math.max(runtime.maxStepRatio, dp / dc);
  }
  runtime.lastCursor = [stageXy[0], stageXy[1]];
  runtime.samples += 1;
  tp.redraw();
  // 追従後のピン位置（＝右面の中心）を次回の基準にする
  runtime.lastPin = tp.screenOfMerc(merc);
}

function snapshot() {
  return {
    zone: runtime.zone, cursorImage: runtime.cursorImage, merc: runtime.merc, samples: runtime.samples,
    maxStepRatio: runtime.maxStepRatio, drawnTiles: runtime.tp ? runtime.tp.drawnTiles() : null,
    vertexMode: runtime.vertexMode, dataName: DATA_NAME,
    activeZone: runtime.active?.zone ?? null,
    active: runtime.active ? JSON.parse(JSON.stringify(runtime.active)) : null,
    triangleIndex: runtime.active?.kind === 'triangle' ? runtime.active.index : null,
    fanIndex: runtime.active?.kind === 'fan' ? runtime.active.fan : null,
  };
}

window.__demoB = {
  ready: readyPromise,
  dataName: DATA_NAME,
  state: () => snapshot(),
  screenOfImage: (xy) => runtime.tp?.screenOfImage(xy) ?? null,
  imageAtStage: (xy) => runtime.tp?.imageAtStage(xy) ?? null,
  centerOn: (xy) => runtime.tp?.centerOn(xy),
  classify: (xy) => (runtime.hull ? classify(xy) : null),
  zoomLeft: (f) => runtime.tp?.zoomLeft(f),
  hull: () => runtime.hull,
  boundary: () => runtime.boundary,
  resetStats: () => { runtime.samples = 0; runtime.maxStepRatio = 0; runtime.lastCursor = null; runtime.lastPin = null; runtime.trail = []; runtime.trailImage = []; },
};

async function main() {
  const stage = document.getElementById('stage');
  const tp = await createTwoPane({
    dataName: DATA_NAME, stage,
    leftCanvas: document.getElementById('map-left'), rightCanvas: document.getElementById('map-right'),
    syncRightToLeft: false,
    rotatable: false, // このデモは回転を使わない（2026-11-01 発表者の指摘）
  });
  runtime.tp = tp;
  runtime.vertexMode = tp.data.vertexMode ?? tp.data.compiled?.vertexMode ?? null;
  document.getElementById('source').textContent = tp.sourceText();

  // 凸包（絵図座標）と境界多角形（vertices_points の絵図側）
  runtime.hull = hullOfPoints(tp.data.points);
  const vertices = tp.data.vertices ?? tp.data.compiled?.vertices_points ?? [];
  runtime.boundary = vertices.map((v) => (Array.isArray(v[0]) ? v[0] : v));

  // 扇の要（重心）。公開版は重心からの方位角で扇形三角形を選ぶ（事実表 §4.3・geometry.ts decideUseVertex）
  const c = tp.data.centroid ?? tp.data.compiled?.centroid_point ?? null;
  runtime.centroid = Array.isArray(c?.[0]) ? c[0] : c;

  // 両面の三角網。凸包は絵図側で決め、右面は同じ対応点の番号で結ぶ
  const histTin = new TinView(tp.data, {
    side: 'hist', style: B_STYLE,
    layers: { gcps: true, edges: false, tin: false, constraint: false, edgeNodes: false, kinks: false, hull: false, boundary: false, extrap: false },
  });
  const modernTin = new TinView(tp.data, {
    side: 'modern', style: B_STYLE,
    layers: { gcps: true, edges: false, tin: false, constraint: false, edgeNodes: false, kinks: false, hull: false, boundary: false, extrap: false },
  });
  const indexOf = new Map(histTin.gcps.map((p, i) => [`${p[0]},${p[1]}`, i]));
  const hullIndices = runtime.hull.map((p) => indexOf.get(`${p[0]},${p[1]}`)).filter((i) => Number.isInteger(i));
  runtime.net.hist = buildNet(histTin, hullIndices);
  runtime.net.modern = buildNet(modernTin, hullIndices);

  tp.left.addOverlay(histTin.overlay());
  tp.left.addOverlay((ctx, view) => drawNetwork(ctx, view, 'hist'));
  // カーソルが指している絵図の点（右のピンと同じ水色の輪）。実カーソルの真下に出る
  tp.left.addOverlay((ctx, view) => {
    if (!runtime.cursorImage) return;
    let q; try { q = view.imageToScreen(runtime.cursorImage); } catch { return; }
    const dpr = view.dpr || 1;
    ctx.save();
    ctx.lineWidth = 5 * dpr; ctx.strokeStyle = 'rgba(6,12,22,.6)';
    ctx.beginPath(); ctx.arc(q[0], q[1], 10 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = '#00e5ff';
    ctx.beginPath(); ctx.arc(q[0], q[1], 10 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  tp.right.addOverlay(modernTin.overlay());
  tp.right.addOverlay((ctx, view) => drawNetwork(ctx, view, 'modern'));
  tp.right.addOverlay(drawPin);

  installCursor(stage);
  // v3.5: 画面座標 → 収録面座標は縮尺 k で割る（stage-fit.mjs）。指で触れた瞬間（pointerdown）も 1 サンプル取る
  document.addEventListener('pointermove', (e) => sample(toStage(stage, e.clientX, e.clientY)), true);
  document.addEventListener('pointerdown', (e) => sample(toStage(stage, e.clientX, e.clientY)), true);
  /**
   * v3.5（スマホ）: タッチには hover が無い ∴ **指でなぞるとカーソルの代わりに追従**させる。
   * 左面をドラッグすると地図がパンして指の下の絵図の点が動かない（なぞりと衝突する）∴ 粗いポインタ・
   * タッチ・ペンでは左面のパンを止め、なぞり優先にする（この面はパンしなくてよい。引き継ぎ書 §5）。
   * マウスの操作（収録・PC）はそのまま。
   */
  const coarse = () => window.matchMedia?.('(pointer: coarse)').matches;
  tp.left.canvas.parentElement.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen' || (coarse() && e.pointerType !== 'mouse')) {
      e.stopPropagation(); // MapView（canvas）へ届けない ∴ パンしない
    }
  }, true);

  // 手で触るとき: 画像の四辺形の外まで見える引き（収録は自前で寄せる）。題材の縦横比が違っても同じ見え方になるよう、
  // 四辺形が左面の幅の 78%・高さの 62% に収まる最大の倍率に合わせる（館林御城図は横長 ∴ 幅で決まり、左右に外が見える）
  {
    tp.zoomLeft(0.6);
    const quadScreen = () => runtime.boundary.map((p) => tp.screenOfImage(p)).filter(Boolean);
    const q = quadScreen();
    if (q.length === 4) {
      const w = Math.max(...q.map((p) => p[0])) - Math.min(...q.map((p) => p[0]));
      const h = Math.max(...q.map((p) => p[1])) - Math.min(...q.map((p) => p[1]));
      const { w: paneW0, h: paneH0 } = layoutSize(tp.left.canvas); // v3.5: 縮尺 k の影響を受けない寸法
      const paneW = paneW0 || 600;
      const paneH = paneH0 || 800;
      const f = Math.min((paneW * 0.78) / w, (paneH * 0.62) / h);
      if (Number.isFinite(f) && f > 0) tp.zoomLeft(f);
    }
    // 四辺形の中心を左面の中心に置き、上辺が右上の帯（下端 ≈ 130 px）に掛かるときだけ下げる
    const c = runtime.boundary.reduce((acc, p) => [acc[0] + p[0] / 4, acc[1] + p[1] / 4], [0, 0]);
    tp.centerOn(c);
    const top = Math.min(...quadScreen().map((p) => p[1]));
    const a = tp.screenOfImage(c); const b = tp.screenOfImage([c[0], c[1] + 1000]);
    const scale = a && b ? (b[1] - a[1]) / 1000 : 0;
    if (scale > 0 && top < 150) tp.centerOn([c[0], c[1] - (150 - top) / scale]);
  }
  setBand('inside');
  tp.redraw();
  resolveReady(snapshot());
}

main().catch((e) => {
  rejectReady(e);
  const f = document.getElementById('fatal');
  if (f) { f.style.display = 'grid'; f.textContent = String(e?.stack || e); }
});

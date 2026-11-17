/**
 * DEMO-C v3「交差点から交差点まで歩く」（2026-11-01・人間の新しい筋書き）。
 *
 * 奈良町絵図の碁盤の目で、交差点 A → 交差点 B の道を 1 本選び（`demo-c.pick.json`・`scripts/pick-demo-c.mjs`）、
 * その一角の**交差点の対応点だけ**（12 個）で三角網を張る。
 *   制約なし … 対応点だけ（`naramachi_yasui_bunko.grid-none`）。三角網の辺が道をまたぐ。
 *   制約あり … 同じ対応点＋道の対応線 1 本（`naramachi_yasui_bunko.grid-edge`）。道が三角網の辺になる。
 * 「スタート」で絵図の道を A→B に歩く印（墨の丸に白の「歩」）を動かし、現代地図にその位置を
 * **制約なし（赤）と制約あり（橙）の 2 つ同時に**写して軌跡を残す。「現代地図側を歩く」はその逆向き。
 * 制約なしは途中で道から外れ、制約ありは道の上に乗り続ける。モードの切替は三角網の表示だけを変える。
 *
 * 外れ＝写した印から相手面の道の線までの距離。現代地図は地上 m（メルカトル × cos φ）、絵図は px。
 * 道の両面の長さの比で m ⇄ px を換算し、パネルには両方を出す。
 *
 * 地図の土台（タイル・両面の同期）は元データ `naramachi_yasui_bunko` の変換を使う（12 点の変換で同期すると
 * 一角の外で画面が飛ぶ）。印の変換だけを派生データ 2 本で行う。回転は使わない（`rotatable: false`）。
 *
 * 収録フック: `window.__demoC = { ready, setMode('none'|'edge'), state(), start(), startReverse(), focusPlace(),
 *                               screenOfImage, screenOfMerc, centerOn, zoomLeft, roadImage(), roadMerc(), marksScreen() }`
 *   start() / startReverse() は歩き終えたときの state() で resolve する Promise。
 */
import { createTwoPane, createTransform } from './lib/twopane.mjs';
import { loadCompiled } from './lib/data.mjs';
import { TinView } from './lib/tinview.mjs';
import { Panel } from './lib/panel.mjs';
import { installCursor } from './lib/cursor.mjs';
import { transformPoint } from './lib/sync.mjs';
import { DECK_COLOR, withAlpha } from './lib/deck-colors.mjs';
import { classifyEdgeNodes } from './lib/edge-nodes.mjs';
import { distToPolyline, groundScaleAt, pointAlong, polylineLength, walkDeviation } from './lib/walk.mjs';

const DATA_BASE = 'naramachi_yasui_bunko';
/** 印の色は資料 #12 と同じ: 制約なし＝赤・制約あり＝橙 */
const COLOR = { none: DECK_COLOR.red, edge: DECK_COLOR.orange };
const ROAD_COLOR = DECK_COLOR.ink;
const CONSTRAINT_COLOR = '#1B7A3D'; // 制約辺の緑（デモ②の「三角網の中」と同じ。赤・橙の軌跡や青の辺と紛れない）
const NET_LINE = Object.freeze({ width: 1.6, alpha: 0.8 });
const CONSTRAINT_WIDTH = 4; // 道の点線（2.5px）より太くして、緑が点線に埋もれないようにする
const MARK = Object.freeze({ gcp: DECK_COLOR.ink, node: DECK_COLOR.indigo, halo: DECK_COLOR.paper });
/** 歩く時間（ミリ秒） */
export const WALK_MS = 5000;
/** 道の A–B が左面で占める長さ（CSS px） */
const FOCUS_SPAN_PX = 480;
/** 道を画面の中心から下へずらす量（CSS px。左上のパネル・右上の凡例を避ける） */
const FOCUS_DOWN_PX = 90;

const runtime = {
  tp: null, pick: null, mode: 'none',
  mt: { none: null, edge: null }, data: { none: null, edge: null },
  road: { img: [], merc: [] }, gs: 1, pxPerM: 1,
  nets: { none: { hist: null, modern: null }, edge: { hist: null, modern: null } },
  marks: { none: null, edge: null },
  /** 全行程の外れ（標本は 2 px ごと）。表示の「最大」はここから「いままでに通った分」を取る ∴ フレームの間隔に依らない */
  expected: { forward: { none: null, edge: null }, backward: { none: null, edge: null } },
  walk: { dir: null, t: 0, running: false, src: null, marks: { none: null, edge: null }, trails: { none: [], edge: [] },
    cur: { none: null, edge: null }, max: { none: null, edge: null } },
  walksDone: [],
  panel: null, values: {},
};
let resolveReady = () => {}; let rejectReady = () => {};
const readyPromise = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

const safe = (fn) => (p) => { try { return fn(p); } catch { return null; } };

function strokePath(ctx, pts, color, width, dpr, dash = []) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(dash.map((d) => d * dpr));
  for (const [w, c] of [[(width + 3) * dpr, 'rgba(255,255,255,0.85)'], [width * dpr, color]]) {
    ctx.lineWidth = w; ctx.strokeStyle = c;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** 3 種の点の印（対応点＝墨丸・データ指定の中間点＝藍四角・自動生成の中間点＝白抜き菱形） */
function drawMarks(ctx, pts, kind, r, dpr) {
  if (pts.length === 0) return;
  ctx.save();
  ctx.beginPath();
  for (const [x, y] of pts) {
    if (kind === 'gcp') { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    else if (kind === 'given') { const h = r * 0.9; ctx.rect(x - h, y - h, h * 2, h * 2); }
    else { const h = r * 1.25; ctx.moveTo(x, y - h); ctx.lineTo(x + h, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h, y); ctx.closePath(); }
  }
  const edgeW = Math.max(1, r * 0.38);
  if (kind === 'auto') {
    ctx.lineWidth = edgeW + 2 * dpr; ctx.strokeStyle = MARK.halo; ctx.stroke();
    ctx.fillStyle = MARK.halo; ctx.fill();
    ctx.lineWidth = edgeW; ctx.strokeStyle = MARK.node; ctx.stroke();
  } else {
    ctx.lineWidth = edgeW; ctx.strokeStyle = MARK.halo; ctx.stroke();
    ctx.fillStyle = kind === 'gcp' ? MARK.gcp : MARK.node; ctx.fill();
  }
  ctx.restore();
}

/** 写した印（色の丸に白の縁） */
function drawDot(ctx, p, color, r, dpr) {
  if (!p) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(p[0], p[1], r * dpr, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = DECK_COLOR.paper; ctx.stroke();
  ctx.restore();
}

/** 歩く印（墨の丸に白の「歩」）。v2.9（visual 1 の残り）: 字 12 → 16px、丸を直径 20 → 26px */
function drawWalker(ctx, p, dpr) {
  if (!p) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(p[0], p[1], 13 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = DECK_COLOR.ink; ctx.fill();
  ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = DECK_COLOR.paper; ctx.stroke();
  ctx.fillStyle = DECK_COLOR.paper;
  ctx.font = `700 ${16 * dpr}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('歩', p[0], p[1] + 0.5 * dpr);
  ctx.restore();
}

/** 交差点の名札（A・B） */
function drawLabel(ctx, p, text, dpr) {
  if (!p) return;
  ctx.save();
  ctx.font = `700 ${16 * dpr}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const x = p[0]; const y = p[1] + 24 * dpr;
  ctx.lineWidth = 4 * dpr; ctx.strokeStyle = DECK_COLOR.paper; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = DECK_COLOR.ink; ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * 1 面ぶんの重ね描き。side は hist（絵図）/ modern（現代地図）。
 * 道の線 → 三角網（いまのモード）→ 対応点・中間点 → A・B → 軌跡と印（この面が写す側のとき）→ 歩く印（この面を歩くとき）
 */
function overlay(side) {
  return (ctx, view) => {
    const dpr = view.dpr || 1;
    const project = safe(side === 'hist' ? (p) => view.imageToScreen(p) : (m) => view.mapToPixel(m));
    const toScreen = (arr) => arr.map(project).filter(Boolean);
    // 道の線を先に描き、制約辺（緑）がその上に見えるようにする
    const road = side === 'hist' ? runtime.road.img : runtime.road.merc;
    strokePath(ctx, toScreen(road), ROAD_COLOR, 2.5, dpr, [3, 5]);
    const net = runtime.nets[runtime.mode][side];
    if (net) net.draw(ctx, view);
    const marks = runtime.marks[runtime.mode]?.[side];
    if (marks) {
      drawMarks(ctx, toScreen(marks.auto), 'auto', 5 * dpr, dpr);
      drawMarks(ctx, toScreen(marks.given), 'given', 5 * dpr, dpr);
      drawMarks(ctx, toScreen(marks.gcp), 'gcp', 6.5 * dpr, dpr);
    }
    drawLabel(ctx, project(road[0]), 'A', dpr);
    drawLabel(ctx, project(road[road.length - 1]), 'B', dpr);
    const w = runtime.walk;
    if (!w.dir) return;
    const target = w.dir === 'forward' ? 'modern' : 'hist';
    if (side === target) {
      strokePath(ctx, toScreen(w.trails.none), COLOR.none, 4, dpr);
      strokePath(ctx, toScreen(w.trails.edge), COLOR.edge, 4, dpr);
      drawDot(ctx, project(w.marks.none), COLOR.none, 9, dpr);
      drawDot(ctx, project(w.marks.edge), COLOR.edge, 6.5, dpr);
    } else {
      drawWalker(ctx, project(w.src), dpr);
    }
  };
}

/** 凡例の印（SVG）。canvas の印と同じ形・色 */
function legendIcon(kind) {
  const body = {
    tin: `<path d="M1 7 H29" stroke="${withAlpha(DECK_COLOR.blue, NET_LINE.alpha)}" stroke-width="4"/>`,
    constraint: `<path d="M1 7 H29" stroke="${withAlpha(CONSTRAINT_COLOR, NET_LINE.alpha)}" stroke-width="2"/>`,
    road: `<path d="M1 7 H29" stroke="${ROAD_COLOR}" stroke-width="2.5" stroke-dasharray="3 4"/>`,
    gcp: `<circle cx="15" cy="7" r="5" fill="${MARK.gcp}" stroke="#fff" stroke-width="1.8"/>`,
    given: `<rect x="10.5" y="2.5" width="9" height="9" fill="${MARK.node}" stroke="#fff" stroke-width="1.6"/>`,
    auto: `<path d="M15 1 L21 7 L15 13 L9 7 Z" fill="#fff" stroke="${MARK.node}" stroke-width="2"/>`,
    walker: `<circle cx="15" cy="7" r="6.5" fill="${DECK_COLOR.ink}"/><text x="15" y="10.5" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">歩</text>`,
    none: `<path d="M1 7 H18" stroke="${COLOR.none}" stroke-width="3.5"/><circle cx="23" cy="7" r="5" fill="${COLOR.none}" stroke="#fff" stroke-width="1.5"/>`,
    edge: `<path d="M1 7 H18" stroke="${COLOR.edge}" stroke-width="3.5"/><circle cx="23" cy="7" r="4.2" fill="${COLOR.edge}" stroke="#fff" stroke-width="1.5"/>`,
  }[kind];
  return `<svg viewBox="0 0 30 14" aria-hidden="true">${body}</svg>`;
}

/** 凡例（右面の左上・20px。v2.8 で 14px から）。中間点の行はその種類の点があるときだけ出す */
function setLegend(mode) {
  const el = document.getElementById('legend');
  if (!el) return;
  const row = (kind, text) => `<div class="row" data-kind="${kind}">${legendIcon(kind)}<span>${text}</span></div>`;
  const counts = countMarks(runtime.marks[mode]);
  const has = (k) => counts && (counts.hist[k] > 0 || counts.modern[k] > 0);
  // v2.8（visual 1）: 20px にしたぶん語を短くし、行間を詰めて外形を保つ（意味は変えない）
  const rows = [row('gcp', '対応点（交差点）')];
  if (has('given')) rows.push(row('given', '制約辺の途中の点（指定）'));
  if (has('auto')) rows.push(row('auto', '制約辺の途中の点（自動）'));
  rows.push(row('tin', mode === 'none' ? '三角網の辺' : '三角網の辺（一般）'));
  if (mode === 'edge') rows.push(row('constraint', '制約辺（道）'));
  rows.push(row('road', '道の線（A–B の対応線）'), row('walker', '歩く印'),
    row('none', '制約なしの印と軌跡'), row('edge', '制約ありの印と軌跡'));
  el.innerHTML = `<div class="ttl">${mode === 'none' ? '交差点だけの分割' : '道を辺にした分割'}（両面共通）</div>`
    + rows.join('') + '<div class="note">外れ＝印と道の線の距離</div>';
}

/** 道 A–B を左面に収め（約 480 px）、パネル・凡例を避けて少し下に置く。右面は同期で同じ場所へ寄る */
function focusPlace() {
  const tp = runtime.tp;
  const li = runtime.road.img;
  if (!tp || li.length < 2) return snapshot();
  const mid = pointAlong(li, 0.5);
  tp.centerOn(mid);
  const span = () => { const a = tp.screenOfImage(li[0]); const b = tp.screenOfImage(li[li.length - 1]); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0; };
  for (let i = 0; i < 40 && span() < FOCUS_SPAN_PX / 1.15; i += 1) tp.zoomLeft(1.15);
  for (let i = 0; i < 40 && span() > FOCUS_SPAN_PX * 1.15; i += 1) tp.zoomLeft(1 / 1.15);
  const s = span();
  if (s > 0) tp.zoomLeft(FOCUS_SPAN_PX / s);
  const a = tp.screenOfImage(mid); const b = tp.screenOfImage([mid[0], mid[1] + 100]);
  const scale = a && b ? (b[1] - a[1]) / 100 : 0;
  tp.centerOn(scale > 0 ? [mid[0], mid[1] - FOCUS_DOWN_PX / scale] : mid);
  return snapshot();
}

function setMode(mode) {
  if (mode !== 'none' && mode !== 'edge') throw new RangeError(`mode は none か edge: ${mode}`);
  runtime.mode = mode;
  for (const b of document.querySelectorAll('#mode-buttons button[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  setLegend(mode);
  runtime.tp.redraw();
  return snapshot();
}

/**
 * v2.9（visual N3）: パネルを 200×180px 以内に収めるため、数値は**歩いている面の単位だけ**にした
 * （現代地図を写す行き＝m、絵図を写す帰り＝px）。v2.8 は「33.5 m／210 px」を 2 行目に置き、約 300×247px で絵図を隠した。
 */
const fmt = (v) => {
  if (!v) return '—';
  return runtime.walk.dir === 'backward' ? `${Math.round(v.px)} px` : `${v.m.toFixed(1)} m`;
};

function updatePanel() {
  const w = runtime.walk;
  runtime.values.curNone.numEl.textContent = fmt(w.cur.none);
  runtime.values.maxNone.numEl.textContent = fmt(w.max.none);
  runtime.values.curEdge.numEl.textContent = fmt(w.cur.edge);
  runtime.values.maxEdge.numEl.textContent = fmt(w.max.edge);
}

/** いまの t での 1 歩（印・軌跡・外れ）。dir は forward（絵図を歩く）/ backward（現代地図を歩く） */
function stepTo(t) {
  const w = runtime.walk;
  const forward = w.dir === 'forward';
  const srcLine = forward ? runtime.road.img : runtime.road.merc;
  const dstLine = forward ? runtime.road.merc : runtime.road.img;
  w.t = t;
  w.src = pointAlong(srcLine, t);
  for (const mode of ['none', 'edge']) {
    const q = transformPoint(runtime.mt[mode], w.src, !forward);
    w.marks[mode] = q;
    w.trails[mode].push(q);
    const d = distToPolyline(q, dstLine);
    w.cur[mode] = forward ? { m: d * runtime.gs, px: d * runtime.gs * runtime.pxPerM } : { px: d, m: d / runtime.pxPerM };
    // 最大＝全行程の標本（2 px ごと）のうち、いままでに通った分の最大と、いまの値の大きい方
    const exp = runtime.expected[w.dir][mode];
    let best = 0;
    for (const s of exp.samples) { if (s.t > t) break; if (s.d > best) best = s.d; }
    const cur = forward ? w.cur[mode].m : w.cur[mode].px;
    best = Math.max(best, cur);
    w.max[mode] = forward ? { m: best, px: best * runtime.pxPerM } : { px: best, m: best / runtime.pxPerM };
  }
  updatePanel();
  runtime.tp.redraw();
}

function setWalkButtons(disabled) {
  for (const b of document.querySelectorAll('#walk-buttons button')) b.disabled = disabled;
}

/** 歩く（requestAnimationFrame で WALK_MS かけて A→B）。歩き終えたら state() で resolve */
function walk(dir) {
  const w = runtime.walk;
  if (w.running) return Promise.reject(new Error('歩いている途中'));
  Object.assign(w, { dir, t: 0, running: true, src: null, marks: { none: null, edge: null }, trails: { none: [], edge: [] },
    cur: { none: null, edge: null }, max: { none: null, edge: null } });
  setWalkButtons(true);
  return new Promise((resolve, reject) => {
    let t0 = null;
    const frame = (now) => {
      try {
        if (t0 === null) t0 = now;
        const t = Math.min(1, (now - t0) / WALK_MS);
        stepTo(t);
        if (t < 1) { requestAnimationFrame(frame); return; }
        w.running = false;
        runtime.walksDone.push(dir);
        setWalkButtons(false);
        resolve(snapshot());
      } catch (e) { w.running = false; setWalkButtons(false); reject(e); }
    };
    requestAnimationFrame(frame);
  });
}

function countMarks(marks) {
  if (!marks) return null;
  const side = (m) => ({ gcp: m.gcp.length, given: m.given.length, auto: m.auto.length });
  return { hist: side(marks.hist), modern: side(marks.modern) };
}

const summary = (r) => (r ? { max: r.max, mean: r.mean } : null);

function snapshot() {
  const w = runtime.walk;
  const e = runtime.expected;
  return {
    mode: runtime.mode,
    edgeIndex: runtime.pick?.edgeIndex ?? null,
    pointA: runtime.pick?.pointA ?? null,
    pointB: runtime.pick?.pointB ?? null,
    points: runtime.data.none?.compiled?.points?.length ?? null,
    constraintEdges: runtime.data.edge?.compiled?.edges?.length ?? null,
    walk: { dir: w.dir, progress: w.t, running: w.running },
    deviation: { none: { cur: w.cur.none, max: w.max.none }, edge: { cur: w.cur.edge, max: w.max.edge } },
    walksDone: [...runtime.walksDone],
    // 全行程の外れ（順方向＝m・逆方向＝px）。収録の sidecar とゲートに使う
    devNone: summary(e.forward.none), devEdge: summary(e.forward.edge),
    backNone: summary(e.backward.none), backEdge: summary(e.backward.edge),
    pxPerM: runtime.pxPerM,
    pointKinds: countMarks(runtime.marks[runtime.mode]),
    drawnTiles: runtime.tp ? runtime.tp.drawnTiles() : null,
  };
}

window.__demoC = {
  ready: readyPromise,
  setMode: (m) => setMode(m),
  state: () => snapshot(),
  start: () => walk('forward'),
  startReverse: () => walk('backward'),
  focusPlace: () => focusPlace(),
  screenOfImage: (xy) => runtime.tp?.screenOfImage(xy) ?? null,
  screenOfMerc: (m) => runtime.tp?.screenOfMerc(m) ?? null,
  centerOn: (xy) => runtime.tp?.centerOn(xy),
  zoomLeft: (f) => runtime.tp?.zoomLeft(f),
  roadImage: () => runtime.road.img,
  roadMerc: () => runtime.road.merc,
  /** 収録面座標での歩く印と 2 つの写した印 */
  marksScreen: () => {
    const w = runtime.walk; const tp = runtime.tp;
    if (!w.dir || !tp) return null;
    const src = w.dir === 'forward' ? tp.screenOfImage(w.src) : tp.screenOfMerc(w.src);
    const dst = (q) => (q ? (w.dir === 'forward' ? tp.screenOfMerc(q) : tp.screenOfImage(q)) : null);
    return { walker: src, none: dst(w.marks.none), edge: dst(w.marks.edge) };
  },
};

async function main() {
  const stage = document.getElementById('stage');
  const tp = await createTwoPane({
    dataName: DATA_BASE, stage, rotatable: false,
    leftCanvas: document.getElementById('map-left'), rightCanvas: document.getElementById('map-right'),
  });
  runtime.tp = tp;
  document.getElementById('source').textContent = tp.sourceText();

  const pick = await (await fetch('./data/demo-c.pick.json')).json();
  runtime.pick = pick;
  for (const mode of ['none', 'edge']) {
    runtime.data[mode] = await loadCompiled(pick.data[mode]);
    runtime.mt[mode] = createTransform(runtime.data[mode].compiled);
  }
  // 道の線＝元データの対応線 edges[pick.edgeIndex]（両端の対応点＋中間ノード）
  const edge = tp.data.compiled.edges[pick.edgeIndex];
  if (!edge) throw new Error(`edges[${pick.edgeIndex}] が無い`);
  const P = tp.data.compiled.points;
  runtime.road.img = [P[edge.startEnd[0]][0], ...(edge.illstNodes ?? []), P[edge.startEnd[1]][0]];
  runtime.road.merc = [P[edge.startEnd[0]][1], ...(edge.mercNodes ?? []), P[edge.startEnd[1]][1]];
  runtime.gs = groundScaleAt(runtime.road.merc[0][1]);
  runtime.pxPerM = polylineLength(runtime.road.img) / (polylineLength(runtime.road.merc) * runtime.gs);
  // 全行程の外れ（標本は絵図で 2 px ごと。pick-demo-c.mjs の値と同じ定義）
  for (const mode of ['none', 'edge']) {
    const mt = runtime.mt[mode];
    runtime.expected.forward[mode] = walkDeviation(runtime.road.img, (p) => transformPoint(mt, p, false), runtime.road.merc,
      { step: 2, scale: runtime.gs });
    runtime.expected.backward[mode] = walkDeviation(runtime.road.merc, (m) => transformPoint(mt, m, true), runtime.road.img,
      { step: 2 / runtime.pxPerM / runtime.gs });
  }

  // 三角網（一般の辺＝青・制約辺＝緑。デモ①②と同じ太さ・不透明度）。右面にも forw の三角形を現代地図の座標で描く
  const layers = { gcps: false, edges: false, tin: true, constraint: true, edgeNodes: false, kinks: false, hull: false, boundary: false, extrap: false };
  const style = {
    tin: { color: withAlpha(DECK_COLOR.blue, NET_LINE.alpha), width: NET_LINE.width },
    constraint: { color: withAlpha(CONSTRAINT_COLOR, NET_LINE.alpha), width: CONSTRAINT_WIDTH },
    constraintHighlight: { color: withAlpha(CONSTRAINT_COLOR, NET_LINE.alpha), width: CONSTRAINT_WIDTH },
  };
  const forwOnly = (data) => ({ ...data, tins: Array.isArray(data.tins) ? data.tins.slice(0, 1) : data.tins });
  for (const mode of ['none', 'edge']) {
    for (const side of ['hist', 'modern']) {
      runtime.nets[mode][side] = new TinView(forwOnly(runtime.data[mode]), { side, layers: { ...layers, constraint: mode === 'edge' }, style });
    }
    const data = runtime.data[mode];
    const origins = classifyEdgeNodes(data.compiled);
    const nodes = data.compiled.edgeNodes ?? [];
    const out = {};
    for (const [side, col] of [['hist', 0], ['modern', 1]]) {
      out[side] = {
        gcp: data.compiled.points.map((p) => p[col]),
        given: nodes.filter((_, n) => origins[n][side] === 'given').map((p) => p[col]),
        auto: nodes.filter((_, n) => origins[n][side] === 'auto').map((p) => p[col]),
      };
    }
    runtime.marks[mode] = out;
  }
  tp.left.addOverlay(overlay('hist'));
  tp.right.addOverlay(overlay('modern'));

  // 小さいパネル（数値 4 行。説明は凡例へ）
  const panel = new Panel(stage, { corner: 'tl', width: 200 });
  panel.el.classList.add('demo-c-panel');
  panel.el.style.top = '58px'; // v2.8: 面の札が 20px になったぶん下げた
  /*
   * v2.9（visual N3）: ラベルと数値を同じ行に置いた 4 行（ラベル 20px・数値 28px・外形 200×180px 以内）。
   * 「制約なし／制約あり」の語は、凡例と同じ色の印（赤＝制約なし・橙＝制約あり）に置き換えて幅を詰めた。
   */
  const chip = (mode, text) => (h) => {
    h.labelEl.innerHTML = `<i class="chip" style="background:${COLOR[mode]}"></i>${text}`;
    h.labelEl.title = `${mode === 'none' ? '制約なし' : '制約あり'} ${text}`;
    return h;
  };
  runtime.values.curNone = chip('none', '外れ')(panel.value('制約なし 外れ', null, '', 1));
  runtime.values.maxNone = chip('none', '最大')(panel.value('制約なし 最大', null, '', 1));
  runtime.values.curEdge = chip('edge', '外れ')(panel.value('制約あり 外れ', null, '', 1));
  runtime.values.maxEdge = chip('edge', '最大')(panel.value('制約あり 最大', null, '', 1));
  runtime.panel = panel;
  updatePanel();

  installCursor(stage);
  for (const b of document.querySelectorAll('#mode-buttons button[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
  document.getElementById('focus-place')?.addEventListener('click', () => focusPlace());
  document.getElementById('walk-start')?.addEventListener('click', () => { walk('forward').catch(() => {}); });
  document.getElementById('walk-reverse')?.addEventListener('click', () => { walk('backward').catch(() => {}); });
  setMode('none');
  focusPlace();
  resolveReady(snapshot());
}

main().catch((e) => {
  rejectReady(e);
  const f = document.getElementById('fatal');
  if (f) { f.style.display = 'grid'; f.textContent = String(e?.stack || e); }
});

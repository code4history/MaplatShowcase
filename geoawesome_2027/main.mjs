/**
 * Geoawesome 2027 — "Every map is a projection"（約 3 分の自動デモ。字幕は英語のみ）
 *
 * 筋: 会社と Maplat → 古地図の歪みは情報（FOSS4G 2026 のナラティブ）→ 実例（広島のビューア）
 *     → 技術 2 点（同じ関数を逆に読む往復・制約辺）→ 提案「どの地図もそれぞれの投影」（MaplatCore Pro のワープ）
 *     → 2027 年に向けて → 締め
 *
 * 部品: 地図面・三角網・変換は ../arida_2026/（ARIDA 2026 講演デモ。AEROTOYOTA202611 の export）をそのまま使う。
 *       広島の実例は ../app/（公開中の Maplat アプリ一式）を embed.html で iframe に読む。
 *       Pro のワープは非公開のコードなので、ここでは収録済みの assets/warp.mp4 を流す
 *       （収録ページは NayutaProducts/GEOAWESOME/pro-warp。Showcase には Pro のコードを置かない）。
 *
 * 再生: 開くと自動で始まり、終わると頭から繰り返す。Space で一時停止、→ で次の場面。
 * 収録: ?rec=1 で自動再生しない。収録スクリプトが window.__geo.ready を待って window.__geo.run() を呼ぶ。
 *       run() は各場面の開始時刻（ms）を返す（音楽の合わせに使う）。
 */
import { MapView, imageScaleToViewZoom } from '../arida_2026/lib/mapview.mjs';
import { TinView } from '../arida_2026/lib/tinview.mjs';
import { normalizeCompiled } from '../arida_2026/lib/data.mjs';
import {
  SYNC_HIST_TO_MODERN, syncViewpoint, transformPoint, roundTripImagePoint, imagePixelToViewpointCenter,
} from '../arida_2026/lib/sync.mjs';
import { MapTransform } from '../arida_2026/vendor/maplat_transform.js';

const params = new URLSearchParams(location.search);
const REC = params.get('rec') === '1';
const W = 1920;
const H = 1080;
const PANE_W = 958;
const RIGHT_X = 962;
const GSI_STD = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
const GSI_ATTR = 'GSI Tiles';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');
const fx = $('#fx');
const SVGNS = 'http://www.w3.org/2000/svg';

// ------------------------------------------------------------------ 舞台の縮尺
function fit() {
  const k = Math.min(window.innerWidth / W, window.innerHeight / H);
  stage.style.setProperty('--k', String(k));
}
window.addEventListener('resize', fit);
fit();

// ------------------------------------------------------------------ 時間・一時停止・スキップ
let paused = false;
let skip = false;
class Skip extends Error {}
const rawSleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(ms) {
  const end = Date.now() + ms;
  for (;;) {
    while (paused) await rawSleep(100);
    if (skip) throw new Skip();
    const left = end - Date.now();
    if (left <= 0) return;
    await rawSleep(Math.min(50, left));
  }
}
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function tween(ms, fn, ease = easeInOut) {
  const start = performance.now();
  for (;;) {
    while (paused) await rawSleep(100);
    if (skip) throw new Skip();
    const t = Math.min(1, (performance.now() - start) / ms);
    fn(ease(t));
    if (t >= 1) return;
    await frame();
  }
}
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const linear = (t) => t;
if (!REC) {
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
    if (e.code === 'ArrowRight') skip = true;
  });
}

// ------------------------------------------------------------------ 字幕・見出し・出典
const capBox = $('#caption');
const capText = $('#caption span');
/** 読む時間: 1 語 0.27 秒＋0.7 秒（最短 3 秒） */
const readMs = (text) => Math.max(3000, text.split(/\s+/).length * 270 + 700);
async function say(text, ms = readMs(text)) {
  if (capBox.classList.contains('on')) {
    capBox.classList.remove('on');
    await wait(300);
  }
  capText.textContent = text;
  capBox.classList.add('on');
  await wait(ms);
}
/** 字幕を出したまま、ms 後に次へ進む（地図の動きと並行させる） */
function sayAsync(text) {
  capText.textContent = text;
  capBox.classList.add('on');
}
function capOff() { capBox.classList.remove('on'); }
function setTag(text) {
  const el = $('#tag');
  el.textContent = text || '';
  el.classList.toggle('on', Boolean(text));
}
function setCredit(text) { $('#credit').textContent = text || ''; }
function clearFx() { while (fx.firstChild) fx.removeChild(fx.firstChild); }
function svg(tag, attrs = {}, parent = fx) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent.appendChild(el);
  return el;
}

let current = null;
function showScene(id) {
  if (current) current.classList.remove('active');
  current = $(id);
  current.classList.add('active');
}

// ------------------------------------------------------------------ データ（ARIDA デモの data/ を読む）
const dataCache = new Map();
async function loadData(name) {
  if (!dataCache.has(name)) {
    dataCache.set(name, fetch(`../arida_2026/data/${name}.json`)
      .then((r) => { if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`); return r.json(); })
      .then((raw) => normalizeCompiled(name, raw)));
  }
  return dataCache.get(name);
}
function makeTransform(compiled) {
  const mt = new MapTransform();
  mt.setMapData({ compiled });
  return mt;
}
const en = (v) => (v && typeof v === 'object' ? v.en || v.ja || '' : v || '');

/** 現代地図の彩度を落とさない MapView（「変形した古地図」のタイルを元の色で見せる） */
class VividMapView extends MapView {
  _tile(key, url) {
    const entry = super._tile(key, url);
    if (entry.image && !entry._vivid) {
      entry._vivid = true;
      const image = entry.image;
      const prev = image.onload;
      image.onload = () => { prev?.(); entry.drawable = image; this.draw(); };
    }
    return entry;
  }
}

/** 古地図（左）と現代地図（右）の 2 面。左を動かすと右が追う */
function twoPane({ leftCanvas, rightCanvas, data, mt, rightTiles = GSI_STD, rightAttr = GSI_ATTR, vivid = false, rightMaxZoom = 18 }) {
  for (const c of [leftCanvas, rightCanvas]) { c.width = PANE_W; c.height = H; }
  const left = new MapView(leftCanvas, {
    kind: 'hist',
    tileUrl: data.raw?.url || `https://t.tilemap.jp/maplat/tiles/${data.tileSlug}/{z}/{x}/{y}.jpg`,
    width: data.width,
    height: data.height,
    attribution: en(data.raw?.attr) || en(data.title),
    dpr: 1,
    rotatable: false,
  });
  const Right = vivid ? VividMapView : MapView;
  const right = new Right(rightCanvas, {
    kind: 'modern',
    tileUrl: rightTiles,
    attribution: rightAttr,
    maxZoom: rightMaxZoom,
    viewpoint: { center: [0, 0], zoom: 14, rotation: 0 },
    dpr: 1,
    rotatable: false,
    background: '#0f1420',
  });
  const sync = () => {
    try { right.setViewpoint(syncViewpoint(mt, left.getViewpoint(), [PANE_W, H], SYNC_HIST_TO_MODERN), { silent: true }); } catch (e) { console.warn('sync', e); }
  };
  left.on('change', sync);
  const api = {
    left, right, mt, data,
    /** 絵図ピクセル xy を左面の中央に、scale（画面 px / 絵図 px）で */
    look(xy, scale) {
      left.setViewpoint({ center: imagePixelToViewpointCenter(mt, xy), zoom: imageScaleToViewZoom(scale, left.maxxy), rotation: 0 });
    },
    redraw() { left.draw(); right.draw(); },
    stageOfImage(xy) { const p = left.imageToScreen(xy); return [p[0], p[1]]; },
    stageOfMerc(m) { const p = right.mapToPixel(m); return [RIGHT_X + p[0], p[1]]; },
    async ready() { await Promise.all([left.ready({ minTiles: 1, timeoutMs: 20000 }), right.ready({ minTiles: 1, timeoutMs: 20000 })]).catch(() => {}); },
  };
  return api;
}

// ------------------------------------------------------------------ 広島の実例（公開中の Maplat アプリ）
const iframe = $('#maplat-frame');
function loadFrame() { if (!iframe.src) iframe.src = iframe.dataset.src; }
async function getApp(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const w = iframe.contentWindow;
    if (w?.maplatError) throw new Error(w.maplatError);
    if (w?.maplatApp?.core) {
      try { await w.maplatApp.core.changeMapSeq; } catch { /* 初期の切替が無いとき */ }
      return w.maplatApp;
    }
    await rawSleep(250);
  }
  throw new Error('Maplat did not start');
}
async function guard(label, fn) {
  try { return await fn(); } catch (e) {
    console.warn(`[geo] ${label} failed, retrying`, e?.message || e);
    try { await rawSleep(800); return await fn(); } catch (e2) { console.warn(`[geo] ${label} failed twice`, e2?.message || e2); }
  }
}
async function walk(core, points, totalMs, acc = 15) {
  const cum = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]; const [x2, y2] = points[i + 1];
    const kx = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    cum.push(cum[i] + Math.hypot((x2 - x1) * kx, y2 - y1));
  }
  const total = cum.at(-1) || 1;
  const at = (f) => {
    const target = total * Math.min(1, Math.max(0, f));
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < target) i++;
    const k = (target - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
    return [points[i][0] + (points[i + 1][0] - points[i][0]) * k, points[i][1] + (points[i + 1][1] - points[i][1]) * k];
  };
  const start = Date.now();
  for (;;) {
    const f = (Date.now() - start) / totalMs;
    try { core.setGPSMarker({ lnglat: at(f), acc }); } catch { /* 1 回落ちても続ける */ }
    if (f >= 1) return;
    await wait(80);
  }
}
/** 広島国際会議場 → 元安橋 → 原爆ドーム（OSM の歩行者網の上。../demo/demo.js と同じ経路） */
const HOME = [132.451219, 34.39204];
const ROUTE = [
  [132.451359, 34.391991], [132.451445, 34.392215], [132.451613, 34.392171],
  [132.452131, 34.393192], [132.452143, 34.393552], [132.452399, 34.39363],
  [132.452833, 34.393928], [132.453955, 34.394252], [132.453336, 34.395392],
  [132.45358, 34.39547],
];

// ------------------------------------------------------------------ 描画の小道具（SVG）
function marker(x, y, color, r = 11) {
  svg('circle', { cx: x, cy: y, r: r + 4, fill: 'rgba(0,0,0,0.45)' });
  return svg('circle', { cx: x, cy: y, r, fill: color, stroke: '#fff', 'stroke-width': 3 });
}
function label(x, y, text, color = '#fff', size = 34) {
  const t = svg('text', { x, y, fill: color, 'font-size': size, 'font-weight': 700, 'font-family': 'Inter, sans-serif', 'paint-order': 'stroke', stroke: 'rgba(0,0,0,0.75)', 'stroke-width': 6 });
  t.textContent = text;
  return t;
}
async function drawArrow(from, to, color, ms, bend = -120) {
  const mx = (from[0] + to[0]) / 2;
  const my = Math.min(from[1], to[1]) + bend;
  const d = `M${from[0]},${from[1]} Q${mx},${my} ${to[0]},${to[1]}`;
  const p = svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.95 });
  const len = p.getTotalLength();
  p.setAttribute('stroke-dasharray', `${len}`);
  p.setAttribute('stroke-dashoffset', `${len}`);
  await tween(ms, (t) => p.setAttribute('stroke-dashoffset', `${len * (1 - t)}`));
  return p;
}
/** カーソルを動かしてクリックの波紋を出す（操作が目に見えるように） */
async function clickAt(from, to, ms = 1100) {
  const g = svg('g');
  const cursor = svg('path', { d: 'M0,0 L0,34 L9,26 L15,40 L21,37 L15,24 L27,24 Z', fill: '#fff', stroke: '#111', 'stroke-width': 2 }, g);
  await tween(ms, (t) => g.setAttribute('transform', `translate(${from[0] + (to[0] - from[0]) * t},${from[1] + (to[1] - from[1]) * t})`));
  const ring = svg('circle', { cx: to[0], cy: to[1], r: 6, fill: 'none', stroke: '#fff', 'stroke-width': 4 });
  await tween(450, (t) => { ring.setAttribute('r', 6 + 34 * t); ring.setAttribute('opacity', 1 - t); }, linear);
  ring.remove();
  return { cursor: g };
}

// ------------------------------------------------------------------ 場面
const marks = {};
let t0 = 0;
const mark = (name) => { marks[name] = Math.round(performance.now() - t0); };

const CREDIT = {
  stick: 'Stick chart, Marshall Islands. Photo: Wikimedia user Mattes, CC BY-SA 3.0 — Staatliches Museum für Völkerkunde München',
  kyoto: '"Map of Kyoto", Genroku 9 (1696) — public domain, via Wikimedia Commons  |  © OpenStreetMap contributors',
  nara: '"Nara Famous Sightseeing Place Map", 1941 — public domain, via Wikimedia Commons',
  castle: 'Map of Hiroshima Castle and its precinct, 1640s — National Archives of Japan',
  kaisei: 'Survey map of Hiroshima City, 1896 — International Research Center for Japanese Studies  |  GSI Tiles',
  nara2: 'Naramachi map — Tenri Central Library (Yasui Bunko)  |  GSI Tiles',
  pro: 'Hiroshima maps: National Archives of Japan; International Research Center for Japanese Studies  |  Base map © OpenStreetMap contributors / OpenStreetMap Japan',
};

const SCENES = [
  {
    name: 'title',
    async run() {
      showScene('#s-title');
      await wait(5200);
    },
  },
  {
    name: 'intro',
    async run() {
      showScene('#s-intro');
      const items = [...document.querySelectorAll('.facts li')];
      items.forEach((li) => li.classList.remove('on'));
      const lit = (i) => items[i]?.classList.add('on');
      lit(0);
      await say('We are Nayuta, Inc., a small geospatial company in Japan — the home of Maplat.');
      lit(1);
      setTimeout(() => lit(2), 2600);
      await say('Maplat puts old and illustrated maps on the web without redrawing them. MaplatEditor lets anyone build such an app — no code needed.');
      capOff();
    },
  },
  {
    name: 'stick',
    async run() {
      showScene('#s-stick');
      setTag('Why old maps look like this');
      setCredit(CREDIT.stick);
      await wait(600);
      await say('A Marshall Islands stick chart: sticks for ocean swells, shells for islands. Poor at positions — exact at finding land.');
    },
  },
  {
    name: 'kyoto',
    async run() {
      showScene('#s-kyoto');
      setCredit(CREDIT.kyoto);
      // 点は FOSS4G 2026 トーク p.12 の実測値（画像に対する相対位置）
      const PTS = [
        { k: 'A', old: [0.40, 0.35], now: [0.588, 0.195] },
        { k: 'B', old: [0.33, 0.70], now: [0.512, 0.372] },
        { k: 'C', old: [0.20, 0.87], now: [0.147, 0.872] },
      ];
      const draw = (imgSel, svgSel, key, km) => {
        const img = $(imgSel);
        const s = $(svgSel);
        while (s.firstChild) s.removeChild(s.firstChild);
        const w = img.clientWidth; const h = img.clientHeight;
        s.setAttribute('viewBox', `0 0 ${w} ${h}`);
        const P = PTS.map((p) => [p[key][0] * w, p[key][1] * h]);
        const seg = (a, b, color, text) => {
          svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, 'stroke-width': 9, 'stroke-linecap': 'round' }, s);
          if (text) {
            const t = svg('text', { x: (a[0] + b[0]) / 2 + 18, y: (a[1] + b[1]) / 2, fill: color, 'font-size': 38, 'font-weight': 700, 'font-family': 'Inter', 'paint-order': 'stroke', stroke: 'rgba(0,0,0,0.85)', 'stroke-width': 7 }, s);
            t.textContent = text;
          }
        };
        seg(P[0], P[1], '#ffb02e', km ? '4 km' : '');
        seg(P[1], P[2], '#5aa9ff', km ? '11 km' : '');
        P.forEach((p, i) => {
          svg('circle', { cx: p[0], cy: p[1], r: 15, fill: '#fff', stroke: '#111', 'stroke-width': 3 }, s);
          const t = svg('text', { x: p[0] - 52, y: p[1] + 13, fill: '#fff', 'font-size': 40, 'font-weight': 700, 'font-family': 'Inter', 'paint-order': 'stroke', stroke: 'rgba(0,0,0,0.85)', 'stroke-width': 7 }, s);
          t.textContent = PTS[i].k;
        });
      };
      for (const s of ['#kyoto-old-svg', '#kyoto-now-svg']) { const e = $(s); while (e.firstChild) e.removeChild(e.firstChild); }
      await wait(700);
      draw('#kyoto-now', '#kyoto-now-svg', 'now', true);
      await say('Kyoto, 1696. On the ground, A to B is 4 km, and B to C is 11 km.');
      draw('#kyoto-old', '#kyoto-old-svg', 'old', false);
      await say('On the old map, A to B is drawn twice as long. The scale shifts about sixfold — the way people felt distance.');
    },
  },
  {
    name: 'nara',
    async run() {
      showScene('#s-nara');
      setCredit(CREDIT.nara);
      const img = $('#s-nara img');
      img.classList.remove('run');
      await frame();
      await frame();
      img.classList.add('run');
      await say('Nara, 1941. Accurate surveys existed by then — yet temples are drawn large, the hills are tilted, and no banks appear.');
    },
  },
  {
    name: 'warped',
    async prepare() {
      const data = await loadData('aki_hiroshima_castle');
      const mt = makeTransform(data.compiled);
      const tp = twoPane({
        leftCanvas: $('#w-left'), rightCanvas: $('#w-right'), data, mt,
        rightTiles: 'https://t.tilemap.jp/maplat/tiles/aki_hiroshima_castle-merc/{z}/{x}/{y}.png',
        rightAttr: 'Warped tiles, made with Maplat', vivid: true, rightMaxZoom: 18,
      });
      // 絵図 1 枚がほぼ収まる引き（変形した側の輪郭の曲がりが見える）
      tp.look([data.width / 2, data.height / 2], 0.036);
      // 右面（変形したタイル）は同期だと拡大しすぎる ∴ 同じ中心で少し引く
      const rv = tp.right.getViewpoint();
      tp.right.setViewpoint({ ...rv, zoom: rv.zoom - 0.55 }, { silent: true });
      this.vp0 = { left: tp.left.getViewpoint(), right: tp.right.getViewpoint() };
      this.tp = tp;
      await tp.ready();
    },
    async run() {
      showScene('#s-warped');
      setCredit(CREDIT.castle);
      const tp = this.tp;
      tp.left.setViewpoint(this.vp0.left, { silent: true });
      tp.right.setViewpoint(this.vp0.right, { silent: true });
      await say('The usual fix: warp the old map until it fits the modern one.');
      const vp = tp.left.getViewpoint();
      const rv = tp.right.getViewpoint();
      const z0 = vp.zoom;
      const sayP = say('Positions line up — but the drawing is bent out of shape.', 4600);
      await tween(4500, (t) => {
        tp.left.setViewpoint({ ...vp, zoom: z0 + 0.12 * t }, { silent: true });
        tp.right.setViewpoint({ ...rv, zoom: rv.zoom + 0.12 * t }, { silent: true });
      });
      await sayP;
    },
  },
  {
    name: 'key',
    async run() {
      showScene('#s-key');
      setTag('');
      setCredit('');
      await say('The gap between an old map and today is not an error to remove. It is information.', 5000);
    },
  },
  {
    name: 'live',
    async prepare() {
      loadFrame();
      this.app = await getApp();
      const core = this.app.core;
      await guard('viewpoint:home', () => core.setViewpoint({ longitude: HOME[0], latitude: HOME[1], mercZoom: 16.6 }));
      try { core.setGPSMarker(null); core.setTransparency(0); } catch { /* 初回 */ }
    },
    async run() {
      showScene('#s-live');
      setTag('');
      setCredit('');
      const core = this.app.core;
      const chip = $('#gps-chip');
      await say('Hiroshima in the 1640s, in the Maplat viewer.', 2800);
      chip.classList.add('on');
      await guard('gps:appear', () => core.setGPSMarker({ lnglat: ROUTE[0], acc: 30 }));
      sayAsync('Your GPS position appears on the original drawing. Walk, and it moves across the old map.');
      await guard('viewpoint:walk', () => core.setViewpoint({ longitude: 132.4527, latitude: 34.3937, mercZoom: 16.9 }));
      await walk(core, ROUTE, 9000, 20);
      await say('The image is never warped. Only your position is transformed — live, in the browser.', 4000);
      sayAsync('Fade the drawing, and the modern city appears underneath.');
      await tween(2000, (t) => { try { core.setTransparency(Math.round(75 * t)); } catch { /* */ } });
      await wait(1300);
      await tween(1500, (t) => { try { core.setTransparency(Math.round(75 * (1 - t))); } catch { /* */ } });
      await wait(200);
      chip.classList.remove('on');
      capOff();
    },
  },
  {
    name: 'tin',
    async prepare() {
      const data = await loadData('kaisei_hiroshima_jissoku');
      const mt = makeTransform(data.compiled);
      const tp = twoPane({ leftCanvas: $('#t-left'), rightCanvas: $('#t-right'), data, mt });
      const layers = { gcps: true, edges: false, tin: true, constraint: true, edgeNodes: false, kinks: false, hull: false, boundary: false, extrap: false };
      const style = {
        tin: { color: 'rgba(40, 120, 255, 0.75)', width: 1.4 },
        constraint: { color: 'rgba(30, 150, 80, 0.9)', width: 1.8 },
        gcp: { radius: 3, fill: '#111', stroke: '#fff', lineWidth: 1 },
        tinHighlight: { color: 'rgba(255, 200, 40, 1)', width: 4, fill: 'rgba(255, 200, 40, 0.28)' },
      };
      const histTin = new TinView(data, { side: 'hist', layers, style });
      const modernTin = new TinView(data, { side: 'modern', layers, style });
      this.tins = { histTin, modernTin };
      this.showTin = false;
      tp.left.addOverlay((ctx, view) => { if (this.showTin) histTin.draw(ctx, view); });
      tp.right.addOverlay((ctx, view) => { if (this.showTin) modernTin.draw(ctx, view); });
      // ARIDA デモ A の点（strict で往復誤差がほぼ 0 の点のうち画像中央に最も近い点）
      this.point = [3700, 2000];
      tp.look(this.point, 0.42);
      this.tp = tp;
      await tp.ready();
    },
    async run() {
      showScene('#s-tin');
      setTag('How it works');
      setCredit(CREDIT.kaisei);
      const tp = this.tp;
      const { histTin, modernTin } = this.tins;
      histTin.clearHighlight(); modernTin.clearHighlight();
      this.showTin = false;
      tp.redraw();
      const readout = $('#rt-readout');
      readout.classList.remove('on');
      await say('Under the hood: control points shared by the old map and the modern one.', 3500);
      this.showTin = true;
      tp.redraw();
      await say('They form one triangulation: same connections on both sides, different shapes.', 3800);
      // 往復: 左をクリック → 右の対応点 → 戻る
      const rt = roundTripImagePoint(tp.mt, this.point);
      histTin.highlightAt(this.point);
      modernTin.highlightAt(rt.merc);
      tp.redraw();
      const p = tp.stageOfImage(this.point);
      const q = tp.stageOfMerc(rt.merc);
      const back = tp.stageOfImage(rt.back);
      sayAsync('Click a point on the old map. It goes to its triangle’s partner on the modern map…');
      const { cursor } = await clickAt([p[0] - 260, p[1] + 220], p);
      marker(p[0], p[1], '#35d0ff');
      await wait(300);
      cursor.remove();
      await drawArrow(p, q, '#ffb02e', 1400);
      marker(q[0], q[1], '#ffb02e');
      await wait(1100);
      sayAsync('…and the same function, read backwards, brings it home.');
      await drawArrow(q, back, '#a98bff', 1400, -60);
      marker(back[0], back[1], '#a98bff', 7);
      readout.textContent = `Round trip error: ${rt.errorPx.toFixed(3)} px`;
      readout.classList.add('on');
      await wait(2600);
      await say('Many tools fit the way back separately, so a round trip drifts. Here it is exact by construction.', 4800);
      readout.classList.remove('on');
      clearFx();
    },
  },
  {
    name: 'edge',
    async prepare() {
      const [base, none, edge, pick] = await Promise.all([
        loadData('naramachi_yasui_bunko'),
        loadData('naramachi_yasui_bunko.grid-none'),
        loadData('naramachi_yasui_bunko.grid-edge'),
        fetch('../arida_2026/data/demo-c.pick.json').then((r) => r.json()),
      ]);
      const mt = makeTransform(base.compiled);
      const tp = twoPane({ leftCanvas: $('#e-left'), rightCanvas: $('#e-right'), data: base, mt });
      this.mtNone = makeTransform(none.compiled);
      this.mtEdge = makeTransform(edge.compiled);
      const pts = base.compiled.points;
      this.road = {
        img: [pts[pick.pointA][0], pts[pick.pointB][0]],
        merc: [pts[pick.pointA][1], pts[pick.pointB][1]],
      };
      const layers = { gcps: true, edges: false, tin: true, constraint: true, edgeNodes: false, kinks: false, hull: false, boundary: false, extrap: false };
      const style = {
        tin: { color: 'rgba(40, 120, 255, 0.85)', width: 2 },
        constraint: { color: 'rgba(47, 179, 107, 1)', width: 6 },
        gcp: { radius: 7, fill: '#111', stroke: '#fff', lineWidth: 2 },
      };
      this.nets = {
        none: { hist: new TinView(none, { side: 'hist', layers, style }), modern: new TinView(none, { side: 'modern', layers, style }) },
        edge: { hist: new TinView(edge, { side: 'hist', layers, style }), modern: new TinView(edge, { side: 'modern', layers, style }) },
      };
      this.mode = 'none';
      this.trails = { none: [], edge: [] };
      this.walker = null;
      const [a, b] = this.road.img;
      const [ma, mb] = this.road.merc;
      tp.left.addOverlay((ctx, view) => {
        this.nets[this.mode].hist.draw(ctx, view);
        const A = view.imageToScreen(a); const B = view.imageToScreen(b);
        ctx.save();
        ctx.setLineDash([16, 12]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,20,20,0.9)';
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
        ctx.restore();
        if (this.walker) {
          const P = view.imageToScreen(this.walker);
          ctx.beginPath(); ctx.arc(P[0], P[1], 14, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
          ctx.lineWidth = 5; ctx.strokeStyle = '#111'; ctx.stroke();
        }
      });
      tp.right.addOverlay((ctx, view) => {
        this.nets[this.mode].modern.draw(ctx, view);
        const A = view.mapToPixel(ma); const B = view.mapToPixel(mb);
        ctx.save();
        ctx.setLineDash([16, 12]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,20,20,0.9)';
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
        ctx.restore();
        for (const [k, color] of [['none', '#ff5a4f'], ['edge', '#2fb36b']]) {
          const tr = this.trails[k];
          if (tr.length < 2) continue;
          ctx.save();
          ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
          ctx.beginPath();
          tr.forEach((m, i) => { const P = view.mapToPixel(m); if (i) ctx.lineTo(P[0], P[1]); else ctx.moveTo(P[0], P[1]); });
          ctx.stroke();
          const P = view.mapToPixel(tr.at(-1));
          ctx.beginPath(); ctx.arc(P[0], P[1], 13, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
          ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.restore();
        }
      });
      // 道の中点を左面の中央に、道が左面で約 560 px になる縮尺で
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 40];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      tp.look(mid, 560 / len);
      this.tp = tp;
      await tp.ready();
    },
    async walkRoad(kind, ms) {
      const [a, b] = this.road.img;
      const mt = kind === 'none' ? this.mtNone : this.mtEdge;
      this.trails[kind] = [];
      await tween(ms, (t) => {
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        this.walker = p;
        try { this.trails[kind].push(transformPoint(mt, p, false)); } catch { /* 範囲外の 1 点 */ }
        this.tp.redraw();
      }, linear);
    },
    async run() {
      showScene('#s-edge');
      setCredit(CREDIT.nara2);
      const lg = { none: $('.lg-none'), edge: $('.lg-edge') };
      lg.none.classList.remove('on'); lg.edge.classList.remove('on');
      this.mode = 'none'; this.trails = { none: [], edge: [] }; this.walker = null;
      this.tp.redraw();
      await say('A straight street between two control points. Triangle edges cut across it.', 3800);
      lg.none.classList.add('on');
      sayAsync('Walk along it: at each edge it crosses, the transformed path bends off the real street.');
      await this.walkRoad('none', 4400);
      await wait(900);
      this.mode = 'edge';
      this.walker = null;
      this.tp.redraw();
      lg.edge.classList.add('on');
      await say('So we pin the street itself as a triangle edge.', 2600);
      sayAsync('An edge always maps to an edge: straight lines stay straight, in both directions.');
      await this.walkRoad('edge', 4400);
      await wait(1600);
      capOff();
    },
  },
  {
    name: 'proj',
    async prepare() {
      const v = $('#warp-video');
      if (v.readyState < 2) await new Promise((r) => { v.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 15000); });
      v.pause();
      v.currentTime = 0;
    },
    async run() {
      showScene('#s-proj');
      setTag('A proposal');
      setCredit(CREDIT.pro);
      const v = $('#warp-video');
      const title = $('#proj-title');
      const chip = $('#pro-chip');
      v.currentTime = 0;
      title.classList.add('on');
      await wait(2200);
      title.classList.remove('on');
      await wait(200);
      try { await v.play(); } catch (e) { console.warn('video', e); }
      chip.classList.add('on');
      // 字幕の切れ目は warp.mp4 の各段（pro-warp の marks）に合わせる: sheer 3.0s / toMercator 9.5s / backToDrawing 16.0s / toOtherMap 21.4s / crossfade 25.0s / end 30.0s
      const at = async (sec) => { while (v.currentTime < sec && !v.ended) await wait(50); };
      sayAsync('Here the 1640s map is shown in its own space. The modern map around it bends to fit the drawing.');
      await at(9.4);
      sayAsync('Mercator is just one more projection. Maplat moves continuously between them.');
      await at(16.0);
      sayAsync('So we propose treating every historical map as a projection of its own — defined by its mapmaker.');
      await at(21.3);
      sayAsync('Then one old map can travel straight into another’s space: from the 1640s to 1896.');
      await at(29.8);
      capOff();
      chip.classList.remove('on');
      await wait(300);
    },
  },
  {
    name: 'next',
    async run() {
      showScene('#s-next');
      setTag('');
      setCredit('');
      const items = [...document.querySelectorAll('.next li')];
      items.forEach((li) => li.classList.remove('on'));
      for (const li of items) { li.classList.add('on'); await wait(850); }
      await say('In 2027: projection-aware data, IIIF, a hosted editor and AI tooling — and we’d love your ideas on 3D.', 5200);
      capOff();
    },
  },
  {
    name: 'outro',
    async run() {
      showScene('#s-outro');
      await say('Thank you, Geoawesome — and thank you for watching.', 3800);
      capOff();
      await wait(1000);
    },
  },
];

// ------------------------------------------------------------------ 起動
async function prepareAll() {
  loadFrame();
  for (const s of SCENES) {
    if (s.prepare) {
      try { await s.prepare(); } catch (e) { console.error(`[geo] prepare ${s.name} failed`, e); s.broken = true; }
    }
  }
  await document.fonts.ready;
}

/** 確認用: ?from=<場面名> でその場面から始める */
const FROM = params.get('from');

async function run() {
  t0 = performance.now();
  let started = !FROM;
  for (const s of SCENES) {
    if (!started && s.name === FROM) started = true;
    if (!started || s.broken) continue;
    mark(s.name);
    skip = false;
    try {
      await s.run();
    } catch (e) {
      if (!(e instanceof Skip)) console.error(`[geo] ${s.name}`, e);
      capOff();
    }
    clearFx();
  }
  mark('end');
  return { ...marks };
}

/** 2 周目以降のために、実例（Maplat アプリ）の状態を初めに戻す。地図面の場面は run() の頭で自分で戻す
 * （prepare をやり直すと同じ canvas に MapView が二重にでき、古い方がタイルの読み込みで描き重ねる） */
async function reset() {
  const core = SCENES.find((s) => s.name === 'live')?.app?.core;
  if (core) {
    try { core.setGPSMarker(null); core.setTransparency(0); } catch { /* */ }
    await guard('reset:viewpoint', () => core.setViewpoint({ longitude: HOME[0], latitude: HOME[1], mercZoom: 16.6 }));
  }
}

const ready = prepareAll();
window.__geo = { ready, run, marks };

if (!REC) {
  showScene('#s-title');
  ready.then(async () => {
    for (;;) {
      await run();
      await reset();
    }
  });
}

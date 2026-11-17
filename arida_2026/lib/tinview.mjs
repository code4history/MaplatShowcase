/**
 * 三角網・対応線・凸包・境界多角形・外挿領域の描画層（m3 T3b・計画 §3 / §5.1 の 2・§5.3 の 2）。
 *
 *   import { TinView } from './lib/tinview.mjs';
 *   const tin = new TinView(data, { side: 'hist' });   // data = loadCompiled(...) の戻り値
 *   mapView.addOverlay(tin.overlay());                 // overlay() が (ctx, view) => void を返す
 *   tin.setLayer('extrap', false);                     // 層の表示切替（再描画は呼び出し側）
 *   tin.highlightAt([1234.5, 4321.0]);                 // その点を含む三角形と接する対応線を太線に
 *   new TinView(data, { style: { constraint: { width: 3 } } }); // 見た目の差し替え（DEMO-C）
 *
 * **座標系**: `side: 'hist'` は絵図の画像ピクセル（`compiled.points[i][0]`）、
 * `side: 'modern'` はメルカトル（`compiled.points[i][1]`）。描画は `MapView` の
 * `view.imageToScreen`（hist）／`view.mapToPixel`（modern）で canvas ピクセルへ投影する。
 *
 * **データの読み方**（`demos/data/*.json` を実測して決めた。詳細は `T3b.md` の「読む範囲」）:
 *   - `compiled.points[i]` … `[絵図座標, メルカトル座標]`
 *   - `compiled.edgeNodes[i]` … 同じ形（辺の中間ノード）
 *   - `compiled.vertices_points[i]` … 同じ形（境界多角形の頂点。**4 点**）
 *   - `compiled.centroid_point` … 同じ形（重心）
 *   - `compiled.tins_points[k]` … 三角形の配列。頂点トークンは
 *       `数値` = `points` の index / `e12・edgeNode12` = `edgeNodes[12]` /
 *       `b3・bbox3` = `vertices_points[3]` / `c` = 重心
 *     （どの表記も `MaplatTin` の `createPoint(... index)` と同じ意味）
 *   - `compiled.edges[i]` … `[illstNodes, mercNodes, startEnd]` または
 *       `{ illstNodes, mercNodes, startEnd }`。`startEnd` は `points` の index 2 つ
 *   - `compiled.kinks_points` … `[x, y]` の配列。**メルカトル（bakw）座標**で保存される
 *     （`getCompiled()` が `kinks.bakw` を書くため）。hist 面に出すときは `kinkToImage` が要る。
 *
 * **層**: `gcps`（黒点）・`edges`（対応線。全本を細線 α0.35）・`tin`（薄灰）・
 * `constraint`（制約辺。赤）・`edgeNodes`（灰点）・`kinks`（橙丸）・`hull`（実線）・
 * `boundary`（破線）・`extrap`（凸包の外かつ境界多角形の内を薄青）。
 */
import {
  centroidOf,
  convexHull,
  distance,
  isPoint,
  pointInTriangle,
  pointOnSegment,
} from './geom.mjs';

/** `setLayer(name, bool)` が受ける層の名前（T3b の委任文と同じ並び） */
export const TIN_LAYERS = Object.freeze([
  'gcps',
  'edges',
  'tin',
  'constraint',
  'edgeNodes',
  'kinks',
  'hull',
  'boundary',
  'extrap',
]);

/** 既定の表示（全層 ON）。収録側は必要な層だけ落とす */
export const DEFAULT_TIN_LAYERS = Object.freeze({
  gcps: true,
  edges: true,
  tin: true,
  constraint: true,
  edgeNodes: true,
  kinks: true,
  hull: true,
  boundary: true,
  extrap: true,
});

/**
 * 対応線・三角網の見た目（**canvas ピクセル**。dpr は呼び出し時に掛ける）。
 *
 * `radius`・`fill`・`stroke`・`lineWidth` を持つものは点（丸）、`color`・`width` を持つものは線。
 * 収録ページは `options.style` で**一部のキーだけ**差し替えられる（DEMO-C の「制約辺を赤の太線・
 * 辺ノードを白丸」）。配列（`dash`）は丸ごと差し替える。
 */
export const DEFAULT_TIN_STYLE = Object.freeze({
  tin: { color: 'rgba(110, 110, 110, 0.45)', width: 1 },
  // 対象の三角形。**全層の上に最後に描く**（制約辺に隠れない）。`fill`・`halo` は既定 null（塗り・縁取りなし）
  tinHighlight: { color: 'rgba(255, 235, 59, 0.95)', width: 3, fill: null, halo: null, haloWidth: 0 },
  constraint: { color: 'rgba(229, 57, 53, 0.72)', width: 1.6 },
  constraintHighlight: { color: 'rgba(255, 82, 82, 0.98)', width: 3 },
  edge: { color: 'rgba(229, 57, 53, 0.35)', width: 1 },
  edgeHighlight: { color: 'rgba(255, 82, 82, 0.95)', width: 2.5 },
  hull: { color: 'rgba(79, 195, 247, 0.95)', width: 1.6 },
  boundary: { color: 'rgba(255, 213, 79, 0.95)', width: 1.4, dash: [7, 5] },
  extrap: 'rgba(33, 150, 243, 0.16)',
  gcp: { radius: 1.5, fill: '#111111', stroke: null, lineWidth: 0 },
  edgeNode: { radius: 0.9, fill: 'rgba(70, 70, 70, 0.9)', stroke: null, lineWidth: 0 },
  kink: { radius: 4, fill: '#fb8c00', stroke: 'rgba(255, 255, 255, 0.9)', lineWidth: 1.5 },
});

/** `options.style` のキー（未知のキーは打ち間違い ∴ 落とす） */
const STYLE_KEYS = Object.freeze(Object.keys(DEFAULT_TIN_STYLE));

/**
 * 既定スタイルに `overrides` を**浅く 1 段だけ**重ねる（キーごとに `{...base, ...override}`）。
 * 入力は書き換えない。
 */
function resolveStyle(overrides) {
  const style = {};
  for (const key of STYLE_KEYS) {
    const base = DEFAULT_TIN_STYLE[key];
    const extra = overrides?.[key];
    style[key] = base && typeof base === 'object' && !Array.isArray(base)
      ? { ...base, ...(extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {}) }
      : (extra === undefined ? base : extra);
  }
  return style;
}

/** 線分上判定の許容差（座標単位）。中間ノードは線形補間で作られている ∴ 厳密でよい */
const ON_PATH_EPS = 1e-6;

// ---------------------------------------------------------------------------
// データの正規化（**canvas を触らない**。テストはここだけで数える）
// ---------------------------------------------------------------------------

/** `[絵図座標, メルカトル座標]` の入れ子から side の座標を採る */
function pointSetOf(value, column, label) {
  if (!Array.isArray(value) || !Array.isArray(value[column])) {
    throw new TypeError(`${label} が [絵図座標, メルカトル座標] の形でない: ${JSON.stringify(value)}`);
  }
  const point = value[column];
  if (!isPoint(point)) {
    throw new TypeError(`${label}[${column}] が有限の [x, y] でない: ${JSON.stringify(point)}`);
  }
  return [point[0], point[1]];
}

/** `centroid_point` は入れ子だが、素の `[x, y]` で保存されたデータも受ける（side を問わず同じ点） */
function centroidPointOf(value, column, label) {
  if (!Array.isArray(value)) return null;
  if (Array.isArray(value[0])) return pointSetOf(value, column, label);
  return isPoint(value) ? [value[0], value[1]] : null;
}

/**
 * 三角形の頂点トークンを `{ kind, index, key }` に読む。
 * 数値・`e12`・`edgeNode12`・`b3`・`bbox3`・`c` を受ける。
 */
export function parseTinToken(token) {
  if (typeof token === 'number') {
    if (!Number.isInteger(token)) throw new TypeError(`三角形の頂点 index が整数でない: ${token}`);
    return { kind: 'points', index: token, key: `p${token}` };
  }
  if (typeof token !== 'string') {
    throw new TypeError(`三角形の頂点トークンが数値でも文字列でもない: ${JSON.stringify(token)}`);
  }
  let found = /^(\d+)$/.exec(token);
  if (found) return { kind: 'points', index: Number(found[1]), key: `p${found[1]}` };
  found = /^(?:edgeNode|e)(\d+)$/.exec(token);
  if (found) return { kind: 'edgeNodes', index: Number(found[1]), key: `e${found[1]}` };
  found = /^(?:bbox|b)(\d+)$/.exec(token);
  if (found) return { kind: 'vertices', index: Number(found[1]), key: `b${found[1]}` };
  if (token === 'c' || token === 'centroid') return { kind: 'centroid', index: 0, key: 'c' };
  throw new Error(`知らない三角形の頂点トークン: ${JSON.stringify(token)}`);
}

/** `compiled.edges[i]` の 2 つの保存形式を同じ形にそろえる */
function edgeParts(edge, index) {
  if (Array.isArray(edge) && edge.length >= 3) {
    return { illstNodes: edge[0], mercNodes: edge[1], startEnd: edge[2] };
  }
  if (edge && typeof edge === 'object' && Array.isArray(edge.startEnd)) {
    return {
      illstNodes: Array.isArray(edge.illstNodes) ? edge.illstNodes : [],
      mercNodes: Array.isArray(edge.mercNodes) ? edge.mercNodes : [],
      startEnd: edge.startEnd,
    };
  }
  throw new TypeError(`edges[${index}] の形が分からない: ${JSON.stringify(edge)}`);
}

/** ノード列（`[[x, y], ...]`）を複製して検証する */
function nodeListOf(nodes, label) {
  if (!Array.isArray(nodes)) throw new TypeError(`${label} が配列でない`);
  return nodes.map((node, index) => {
    if (!isPoint(node)) {
      throw new TypeError(`${label}[${index}] が有限の [x, y] でない: ${JSON.stringify(node)}`);
    }
    return [node[0], node[1]];
  });
}

/**
 * `TinView` が使う配列を `data` から作る（**キャンバス非依存**）。
 * `counts` はテストと収録前 assert の両方が読む。
 */
function buildModel(data, side, options) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('TinView には loadCompiled の戻り値を渡す');
  }
  if (side !== 'hist' && side !== 'modern') {
    throw new TypeError(`side は 'hist' か 'modern': ${String(side)}`);
  }
  if (!Array.isArray(data.points) || data.points.length === 0) {
    throw new Error('データに points が無い（TinView は座標が要る）');
  }
  const column = side === 'hist' ? 0 : 1;

  const gcps = data.points.map((point, index) => pointSetOf(point, column, `points[${index}]`));
  const edgeNodes = (Array.isArray(data.compiled?.edgeNodes) ? data.compiled.edgeNodes : [])
    .map((point, index) => pointSetOf(point, column, `edgeNodes[${index}]`));
  const boundary = (Array.isArray(data.vertices) ? data.vertices : [])
    .map((point, index) => pointSetOf(point, column, `vertices_points[${index}]`));
  const centroid = centroidPointOf(data.centroid, column, 'centroid_point');

  // --- 対応線（compiled.edges） ------------------------------------------------
  const edges = (Array.isArray(data.edges) ? data.edges : []).map((edge, index) => {
    const { illstNodes, mercNodes, startEnd } = edgeParts(edge, index);
    if (!Array.isArray(startEnd) || startEnd.length < 2
      || !Number.isInteger(startEnd[0]) || !Number.isInteger(startEnd[1])) {
      throw new TypeError(`edges[${index}].startEnd が 2 つの整数 index でない: ${JSON.stringify(startEnd)}`);
    }
    const start = startEnd[0];
    const end = startEnd[1];
    if (start < 0 || start >= gcps.length || end < 0 || end >= gcps.length) {
      throw new RangeError(`edges[${index}] の startEnd が points の範囲外: ${start}, ${end}`);
    }
    // side のノード列。空なら直線（両側のノード数はデータによって揃わない）
    const nodes = nodeListOf(side === 'hist' ? illstNodes : mercNodes, `edges[${index}].nodes`);
    return {
      index,
      start,
      end,
      startKey: `p${start}`,
      endKey: `p${end}`,
      /** 端点＋中間ノード（side の座標）。描画と「接する」判定に使う */
      path: [gcps[start], ...nodes, gcps[end]],
      nodes,
    };
  });

  // --- 三角網（compiled.tins_points） -----------------------------------------
  // strict は [0]（forw）だけ、loose は [1]（bakw）も持つ。modern 面は [1] を優先。
  const rows = Array.isArray(data.tins) ? data.tins : [];
  const rowIndex = side === 'modern' && Array.isArray(rows[1]) && rows[1].length > 0 ? 1 : 0;
  const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
  const triangles = row.map((tokens, index) => {
    if (!Array.isArray(tokens) || tokens.length < 3) {
      throw new TypeError(`tins_points[${rowIndex}][${index}] が三角形でない: ${JSON.stringify(tokens)}`);
    }
    const keys = [];
    const points = tokens.slice(0, 3).map((token) => {
      const parsed = parseTinToken(token);
      keys.push(parsed.key);
      if (parsed.kind === 'points') {
        if (parsed.index >= gcps.length) {
          throw new RangeError(`三角形の頂点 points[${parsed.index}] が範囲外`);
        }
        return gcps[parsed.index];
      }
      if (parsed.kind === 'edgeNodes') {
        if (parsed.index >= edgeNodes.length) {
          throw new RangeError(`三角形の頂点 edgeNodes[${parsed.index}] が範囲外`);
        }
        return edgeNodes[parsed.index];
      }
      if (parsed.kind === 'vertices') {
        if (parsed.index >= boundary.length) {
          throw new RangeError(`三角形の頂点 vertices_points[${parsed.index}] が範囲外`);
        }
        return boundary[parsed.index];
      }
      if (!centroid) throw new Error('三角形が重心 c を参照しているが centroid_point が無い');
      return centroid;
    });
    return {
      index,
      tokens,
      keys,
      points,
      /** 三角形の重心（ハイライトの検証・ラベル位置に使える） */
      center: centroidOf(points),
    };
  });

  // --- 三角形の辺（重複を除く） ------------------------------------------------
  const tinEdgeMap = new Map();
  for (const triangle of triangles) {
    for (let i = 0; i < 3; i += 1) {
      const aKey = triangle.keys[i];
      const bKey = triangle.keys[(i + 1) % 3];
      const [first, second] = aKey <= bKey ? [aKey, bKey] : [bKey, aKey];
      const key = `${first}|${second}`;
      if (tinEdgeMap.has(key)) continue;
      tinEdgeMap.set(key, {
        key,
        aKey: first,
        bKey: second,
        a: first === aKey ? triangle.points[i] : triangle.points[(i + 1) % 3],
        b: first === aKey ? triangle.points[(i + 1) % 3] : triangle.points[i],
      });
    }
  }

  // --- 凸包・kinks ------------------------------------------------------------
  // 要件書 §5 は「1002 点の illst 座標から凸包」を明記 ∴ side の座標で計算する
  const hull = convexHull(gcps);
  const kinks = (Array.isArray(data.compiled?.kinks_points) ? data.compiled.kinks_points : [])
    .map((point, index) => {
      if (!isPoint(point)) {
        throw new TypeError(`kinks_points[${index}] が有限の [x, y] でない: ${JSON.stringify(point)}`);
      }
      return [point[0], point[1]];
    });

  const counts = Object.freeze({
    gcps: gcps.length,
    edges: edges.length,
    tinEdges: tinEdgeMap.size,
    triangles: triangles.length,
    boundary: boundary.length,
    edgeNodes: edgeNodes.length,
    kinks: kinks.length,
    hull: hull.length,
  });

  return {
    side,
    column,
    tinsRow: rowIndex,
    gcps,
    edgeNodes,
    boundary,
    centroid,
    edges,
    triangles,
    tinEdges: [...tinEdgeMap.values()],
    hull,
    kinks,
    counts,
    kinkToImage: typeof options.kinkToImage === 'function' ? options.kinkToImage : null,
  };
}

/** 三角形の 3 辺のキー（太線判定用） */
function sideKeysOf(triangle) {
  const keys = [];
  for (let i = 0; i < 3; i += 1) {
    const a = triangle.keys[i];
    const b = triangle.keys[(i + 1) % 3];
    keys.push(a <= b ? `${a}|${b}` : `${b}|${a}`);
  }
  return new Set(keys);
}

/** 点が折れ線の上にあるか（許容差つき） */
function pointOnPath(point, path) {
  if (path.length === 1) return distance(point, path[0]) <= ON_PATH_EPS;
  for (let i = 0; i + 1 < path.length; i += 1) {
    if (pointOnSegment(point, path[i], path[i + 1], ON_PATH_EPS)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

export class TinView {
  /**
   * @param {object} data `loadCompiled()` の戻り値
   * @param {{
   *   side?: 'hist'|'modern',
   *   layers?: Record<string, boolean>,
   *   style?: Record<string, unknown>,
   *   kinkToImage?: (mercatorPoint: [number, number]) => [number, number],
   * }} [options]
   *   `kinkToImage` は `kinks_points`（メルカトル座標）を hist 面へ出すための変換。
   *   渡さないとき、hist 面の kinks 層は**何も描かない**（別の場所に描いて嘘をつかない）。
   *   `style` は `DEFAULT_TIN_STYLE` のキーだけを受け、`{ color, width }` などを上書きする。
   */
  constructor(data, options = {}) {
    const side = options.side ?? 'hist';
    const model = buildModel(data, side, options);
    Object.assign(this, model);
    this.source = data;

    if (options.style !== undefined) {
      if (!options.style || typeof options.style !== 'object' || Array.isArray(options.style)) {
        throw new TypeError('style オプションはオブジェクトで渡す');
      }
      for (const key of Object.keys(options.style)) {
        if (!STYLE_KEYS.includes(key)) {
          throw new RangeError(`知らないスタイルのキー: ${key}（${STYLE_KEYS.join(' / ')}）`);
        }
      }
    }
    /** 見た目（`options.style` を重ねたもの。`draw` は毎回これを読む） */
    this.style = resolveStyle(options.style);

    this.layerNames = TIN_LAYERS;
    this.layers = { ...DEFAULT_TIN_LAYERS };
    if (options.layers && typeof options.layers === 'object') {
      for (const [name, visible] of Object.entries(options.layers)) {
        this.setLayer(name, visible);
      }
    }

    /** @type {{ triangleIndex: number, triangle: object, sideKeys: Set<string>, edges: Set<number> }|null} */
    this.highlight = null;

    /** 描画回数（目視デバッグ用。収録の assert には使わない） */
    this.drawCount = 0;
  }

  // --- 層の表示切替 ---------------------------------------------------------

  /** 層を表示／非表示にする。**再描画は呼び出し側**（`mapView.draw()`） */
  setLayer(name, visible) {
    if (!TIN_LAYERS.includes(name)) {
      throw new RangeError(`知らない層: ${String(name)}（${TIN_LAYERS.join(' / ')}）`);
    }
    this.layers[name] = Boolean(visible);
    return this;
  }

  /** 層の表示状態 */
  getLayer(name) {
    if (!TIN_LAYERS.includes(name)) {
      throw new RangeError(`知らない層: ${String(name)}（${TIN_LAYERS.join(' / ')}）`);
    }
    return this.layers[name];
  }

  /** 層を反転する（目視用のトグル） */
  toggleLayer(name) {
    return this.setLayer(name, !this.getLayer(name));
  }

  /** 全層をまとめて ON/OFF */
  setAllLayers(visible) {
    for (const name of TIN_LAYERS) this.layers[name] = Boolean(visible);
    return this;
  }

  // --- ハイライト -----------------------------------------------------------

  /**
   * `point`（side の座標）を含む三角形を探し、その三角形の辺と、三角形に接する
   * 対応線を太線にする。見つからなければハイライトを解除して `null` を返す。
   *
   * 「接する」は、**対応線の折れ線（端点＋中間ノード）が三角形の頂点を通る**ことで判定する。
   * 三角形の頂点が `edgeNode` でも、その座標は制約辺の折れ線上にある ∴ 幾何判定で拾える。
   *
   * @param {[number, number]} point
   * @returns {{ triangleIndex: number, edges: number[] }|null}
   */
  highlightAt(point) {
    if (!isPoint(point)) {
      throw new TypeError(`highlightAt には有限の [x, y] を渡す: ${JSON.stringify(point)}`);
    }
    for (const triangle of this.triangles) {
      const [a, b, c] = triangle.points;
      if (!pointInTriangle(point, a, b, c)) continue;

      const keySet = new Set(triangle.keys);
      const edgeHits = new Set();
      for (const edge of this.edges) {
        // 端点が三角形の頂点なら即決（大多数はこちら）
        if (keySet.has(edge.startKey) || keySet.has(edge.endKey)) {
          edgeHits.add(edge.index);
          continue;
        }
        // edgeNode の頂点は対応線の折れ線上にある ∴ 座標で拾う
        if (triangle.points.some((vertex) => pointOnPath(vertex, edge.path))) {
          edgeHits.add(edge.index);
        }
      }

      this.highlight = {
        triangleIndex: triangle.index,
        triangle,
        sideKeys: sideKeysOf(triangle),
        edges: edgeHits,
      };
      return { triangleIndex: triangle.index, edges: [...edgeHits] };
    }

    this.highlight = null;
    return null;
  }

  /** ハイライトを解除する */
  clearHighlight() {
    this.highlight = null;
    return this;
  }

  // --- 描画 -----------------------------------------------------------------

  /**
   * `MapView.addOverlay` に渡す関数を返す。
   * @returns {(ctx: CanvasRenderingContext2D, view: object) => void}
   */
  overlay() {
    return (ctx, view) => this.draw(ctx, view);
  }

  /** side の座標 → canvas ピクセル。使えない面に貼られたら**黙って描かずに**落とす */
  _projector(view) {
    if (!view || typeof view !== 'object') {
      throw new TypeError('overlay の view が無い');
    }
    if (this.side === 'hist') {
      if (view.kind !== 'hist' || typeof view.imageToScreen !== 'function') {
        throw new Error(`TinView(side:'hist') は古地図 MapView の imageToScreen が要る（kind=${String(view.kind)}）`);
      }
      return (point) => view.imageToScreen(point);
    }
    if (typeof view.mapToPixel !== 'function') {
      throw new Error("TinView(side:'modern') は MapView の mapToPixel が要る");
    }
    return (point) => view.mapToPixel(point);
  }

  /** 折れ線を**いまの path に**足す（`beginPath` は呼ばない ∴ バッチできる） */
  _addPolyline(ctx, project, points) {
    const first = project(points[0]);
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < points.length; i += 1) {
      const point = project(points[i]);
      ctx.lineTo(point[0], point[1]);
    }
  }

  /** 折れ線の path を作る（stroke/fill は呼び出し側） */
  _tracePath(ctx, project, points, { close = false } = {}) {
    ctx.beginPath();
    this._addPolyline(ctx, project, points);
    if (close) ctx.closePath();
  }

  /** 外挿領域 = 境界多角形 − 凸包（even-odd）。境界と凸包の両方を 1 つの path に入れる */
  _drawExtrap(ctx, project) {
    if (this.hull.length < 3 || this.boundary.length < 3) return;
    ctx.beginPath();
    const boundary = this.boundary;
    let point = project(boundary[0]);
    ctx.moveTo(point[0], point[1]);
    for (let i = 1; i < boundary.length; i += 1) {
      point = project(boundary[i]);
      ctx.lineTo(point[0], point[1]);
    }
    ctx.closePath();
    const hull = this.hull;
    point = project(hull[0]);
    ctx.moveTo(point[0], point[1]);
    for (let i = 1; i < hull.length; i += 1) {
      point = project(hull[i]);
      ctx.lineTo(point[0], point[1]);
    }
    ctx.closePath();
    ctx.fillStyle = this.style.extrap;
    // even-odd で「境界の内側かつ凸包の外側」だけが塗られる（外側全部を塗らない）
    ctx.fill('evenodd');
  }

  /** 三角網（薄灰）。ハイライト中の三角形の辺は `_drawHighlightTriangle` が最後に描く */
  _drawTin(ctx, project, scale) {
    ctx.beginPath();
    for (const edge of this.tinEdges) {
      if (this.highlight && this.highlight.sideKeys.has(edge.key)) continue; // 最前面で描く
      const a = project(edge.a);
      const b = project(edge.b);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.strokeStyle = this.style.tin.color;
    ctx.lineWidth = this.style.tin.width * scale;
    ctx.stroke();
  }

  /**
   * 対象の三角形（`highlightAt` が選んだもの）。**全層の後に描く** ∴ 制約辺・対応線に隠れない。
   * `tinHighlight.fill` があれば半透明に塗り、`halo` があれば下地の太線で縁取る。
   */
  _drawHighlightTriangle(ctx, project, scale) {
    if (!this.highlight) return;
    const look = this.style.tinHighlight;
    const corners = this.highlight.triangle.points.map((point) => project(point));
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      ctx.lineTo(corners[1][0], corners[1][1]);
      ctx.lineTo(corners[2][0], corners[2][1]);
      ctx.closePath();
    };
    if (look.fill) {
      trace();
      ctx.fillStyle = look.fill;
      ctx.fill();
    }
    if (look.halo && look.haloWidth > 0) {
      trace();
      ctx.strokeStyle = look.halo;
      ctx.lineWidth = look.haloWidth * scale;
      ctx.stroke();
    }
    trace();
    ctx.strokeStyle = look.color;
    ctx.lineWidth = look.width * scale;
    ctx.stroke();
  }

  /** 制約辺（edges の折れ線。赤）。ハイライトで接する対応線は太線 */
  _drawConstraints(ctx, project, scale) {
    const highlighted = this.highlight ? this.highlight.edges : null;

    // 通常分は 1 本の path にまとめる（827 本でも stroke 1 回）
    ctx.beginPath();
    for (const edge of this.edges) {
      if (highlighted && highlighted.has(edge.index)) continue;
      this._addPolyline(ctx, project, edge.path);
    }
    ctx.strokeStyle = this.style.constraint.color;
    ctx.lineWidth = this.style.constraint.width * scale;
    ctx.stroke();

    if (!highlighted || highlighted.size === 0) return;
    ctx.beginPath();
    for (const edge of this.edges) {
      if (!highlighted.has(edge.index)) continue;
      this._addPolyline(ctx, project, edge.path);
    }
    ctx.strokeStyle = this.style.constraintHighlight.color;
    ctx.lineWidth = this.style.constraintHighlight.width * scale;
    ctx.stroke();
  }

  /** 対応線（全本を細線 α0.35。ハイライトで接する線だけ太線）。**
   * 注: 対応線は「対応点ペア」を結ぶ直線。折れ線（中間ノード）は制約辺層が描く。
   */
  _drawEdges(ctx, project, scale) {
    const highlighted = this.highlight ? this.highlight.edges : null;
    // 通常分は 1 つのバッチにまとめる（1472 本でも stroke 1 回）
    ctx.beginPath();
    for (const edge of this.edges) {
      if (highlighted && highlighted.has(edge.index)) continue;
      const a = project(edge.path[0]);
      const b = project(edge.path[edge.path.length - 1]);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.strokeStyle = this.style.edge.color;
    ctx.lineWidth = this.style.edge.width * scale;
    ctx.stroke();

    if (!highlighted || highlighted.size === 0) return;
    ctx.beginPath();
    for (const edge of this.edges) {
      if (!highlighted.has(edge.index)) continue;
      const a = project(edge.path[0]);
      const b = project(edge.path[edge.path.length - 1]);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.strokeStyle = this.style.edgeHighlight.color;
    ctx.lineWidth = this.style.edgeHighlight.width * scale;
    ctx.stroke();
  }

  /** 凸包（実線） */
  _drawHull(ctx, project, scale) {
    if (this.hull.length < 2) return;
    this._tracePath(ctx, project, this.hull, { close: this.hull.length >= 3 });
    ctx.strokeStyle = this.style.hull.color;
    ctx.lineWidth = this.style.hull.width * scale;
    ctx.stroke();
  }

  /** 境界多角形（破線） */
  _drawBoundary(ctx, project, scale) {
    if (this.boundary.length < 2) return;
    this._tracePath(ctx, project, this.boundary, { close: this.boundary.length >= 3 });
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash(this.style.boundary.dash);
    ctx.strokeStyle = this.style.boundary.color;
    ctx.lineWidth = this.style.boundary.width * scale;
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
  }

  /** 点のスタイルを `_drawDots` の引数へ直す（半径と線幅にだけ dpr を掛ける） */
  _dotStyle(name, scale) {
    const dot = this.style[name];
    return {
      radius: dot.radius * scale,
      fill: dot.fill,
      stroke: dot.stroke ?? null,
      lineWidth: (dot.lineWidth ?? 0) * scale,
    };
  }

  /** 点をまとめて描く（1 本の path で fill） */
  _drawDots(ctx, project, points, { radius, fill, stroke = null, lineWidth = 0 }) {
    if (points.length === 0) return;
    ctx.beginPath();
    for (const point of points) {
      const screen = project(point);
      ctx.moveTo(screen[0] + radius, screen[1]);
      ctx.arc(screen[0], screen[1], radius, 0, Math.PI * 2);
    }
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke !== null) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  /** kinks（橙丸）。hist 面は `kinkToImage` があるときだけ描く */
  _kinksForSide() {
    if (this.kinks.length === 0) return [];
    if (this.side === 'modern') return this.kinks;
    if (!this.kinkToImage) return [];
    return this.kinks.map((point, index) => {
      const converted = this.kinkToImage(point);
      if (!isPoint(converted)) {
        throw new TypeError(`kinkToImage が有限の [x, y] を返さない（kinks_points[${index}]）`);
      }
      return [converted[0], converted[1]];
    });
  }

  /**
   * 1 枚描く。`ctx` は `MapView` が変換なしで渡す（左上原点・canvas ピクセル）。
   * 呼び出し側は `mapView.addOverlay(tin.overlay())` で足りる。
   */
  draw(ctx, view) {
    if (!ctx || typeof ctx.beginPath !== 'function') {
      throw new TypeError('draw の ctx が Canvas 2D ではない');
    }
    const project = this._projector(view);
    const scale = Number.isFinite(view.dpr) && view.dpr > 0 ? view.dpr : 1;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (this.layers.extrap) this._drawExtrap(ctx, project);
    if (this.layers.tin) this._drawTin(ctx, project, scale);
    if (this.layers.constraint) this._drawConstraints(ctx, project, scale);
    if (this.layers.edges) this._drawEdges(ctx, project, scale);
    if (this.layers.hull) this._drawHull(ctx, project, scale);
    if (this.layers.boundary) this._drawBoundary(ctx, project, scale);
    if (this.layers.edgeNodes) {
      this._drawDots(ctx, project, this.edgeNodes, this._dotStyle('edgeNode', scale));
    }
    if (this.layers.gcps) {
      this._drawDots(ctx, project, this.gcps, this._dotStyle('gcp', scale));
    }
    if (this.layers.kinks) {
      const kinks = this._kinksForSide();
      this._drawDots(ctx, project, kinks, this._dotStyle('kink', scale));
    }
    // 対象の三角形は最前面（tin 層が ON のときだけ。三角網を出さない面で三角形だけ浮かせない）
    if (this.layers.tin) this._drawHighlightTriangle(ctx, project, scale);
    ctx.restore();
    this.drawCount += 1;
  }
}

/**
 * 制約辺の中間点（`compiled.edgeNodes`）の出どころを判定する。純関数・DOM 無し（DEMO-C の 3 種の点）。
 *
 * **根拠**: MaplatTin の辺ノード生成（`MaplatTin/src/tin.ts` の `generateEdgeNodes` 相当の箇所、
 * vendor `demos/vendor/maplat_tin.js` の同じ箇所。2026-11-01 に読んで同じ手順であることを確かめた）。
 *   1. 制約辺 `edges[i] = [illstNodes, mercNodes, startEnd]` の中間ノードが両側とも空なら、辺ノードを作らない。
 *   2. 両側の折れ線に両端の対応点を足し、各節点の「始点からの長さの比」（累積長 ÷ 全長）を出す。
 *   3. 絵図側（idx 0）の中間節点を先に順に処理し、現代地図側の折れ線で**同じ比の点**を探す。
 *      比がちょうど一致する節点があればそれを相方にし（その節点に handled を付ける）、
 *      無ければ前後の節点の間を比で線形補間した点を相方にする（＝**自動生成**）。
 *   4. 次に現代地図側（idx 1）の中間節点のうち handled でないものを同じ手順で処理する（絵図側が補間される）。
 *   5. 全部を比の昇順に並べ、`edgeNodes` に `[絵図座標, 現代地図座標]` で順に積む（辺の順・比の順）。
 * ∴ 各辺ノードの各側は「データで指定された節点（given）」か「対応面側で補間された点（auto）」のどちらか。
 *   比が両側でちょうど一致したものだけ両側とも given になる。
 *
 * この手順を同じ演算順で再現し、生成した座標が `compiled.edgeNodes` と一致することを確かめてから返す
 * （一致しなければ例外。推測で分けない）。
 */

/** `edges[i]` の 2 つの保存形式（配列／オブジェクト）を `[illstNodes, mercNodes, startEnd]` にそろえる */
function edgeTriple(edge, index) {
  if (Array.isArray(edge) && edge.length >= 3) return [edge[0] ?? [], edge[1] ?? [], edge[2]];
  if (edge && typeof edge === 'object' && Array.isArray(edge.startEnd)) {
    return [edge.illstNodes ?? [], edge.mercNodes ?? [], edge.startEnd];
  }
  throw new TypeError(`edges[${index}] の形が分からない`);
}

/** 節点列 → `[node, 区間長, 累積長, 比]`（MaplatTin と同じ演算順） */
function segmentItems(nodes) {
  const lengths = nodes.map((node, index, arr) => {
    if (index === 0) return 0;
    const prev = arr[index - 1];
    return Math.sqrt(Math.pow(node[0] - prev[0], 2) + Math.pow(node[1] - prev[1], 2));
  });
  const accum = lengths.reduce((acc, len, idx) => {
    if (idx === 0) return [0];
    acc.push(acc[idx - 1] + len);
    return acc;
  }, []);
  return accum.map((a, idx, arr) => ({ node: nodes[idx], ratio: a / arr[arr.length - 1], handled: false }));
}

/**
 * MaplatTin の辺ノード生成を再現し、各辺ノードの出どころを返す。
 *
 * @param {{ points: Array<[[number, number], [number, number]]>, edges?: unknown[] }} compiled
 * @returns {Array<{ edge: number, hist: 'given'|'auto', modern: 'given'|'auto',
 *                   histPoint: [number, number], modernPoint: [number, number] }>}
 *   `edgeNodes` と同じ並び（index が辺ノードの番号 `e{n}`）
 */
export function generateEdgeNodeOrigins(compiled) {
  const out = [];
  const edges = Array.isArray(compiled?.edges) ? compiled.edges : [];
  edges.forEach((raw, i) => {
    const [illst0, merc0, startEnd] = edgeTriple(raw, i);
    if (illst0.length === 0 && merc0.length === 0) return;
    const illst = [compiled.points[startEnd[0]][0], ...illst0, compiled.points[startEnd[1]][0]];
    const merc = [compiled.points[startEnd[0]][1], ...merc0, compiled.points[startEnd[1]][1]];
    const segments = [segmentItems(illst), segmentItems(merc)];
    const items = [];
    segments.forEach((segment, idx) => {
      const other = segments[idx ? 0 : 1];
      // filter は flatMap の前に全部評価される（MaplatTin も同じ）∴ handled はここで先に読む
      const targets = segment.filter((item, index) => !(index === 0 || index === segment.length - 1 || item.handled));
      for (const item of targets) {
        let counterpart;
        for (let k = 0; k < other.length; k += 1) {
          const curr = other[k]; const next = other[k + 1];
          if (curr.ratio === item.ratio) { curr.handled = true; counterpart = { exact: curr }; break; }
          if (curr.ratio < item.ratio && next && next.ratio > item.ratio) { counterpart = { curr, next }; break; }
        }
        if (!counterpart) continue;
        let otherPoint;
        let otherGiven;
        if (counterpart.exact) {
          otherPoint = counterpart.exact.node; otherGiven = true;
        } else {
          const { curr, next } = counterpart;
          const t = (item.ratio - curr.ratio) / (next.ratio - curr.ratio);
          otherPoint = [(next.node[0] - curr.node[0]) * t + curr.node[0], (next.node[1] - curr.node[1]) * t + curr.node[1]];
          otherGiven = false;
        }
        items.push(idx === 0
          ? { histPoint: item.node, modernPoint: otherPoint, hist: 'given', modern: otherGiven ? 'given' : 'auto', ratio: item.ratio }
          : { histPoint: otherPoint, modernPoint: item.node, hist: otherGiven ? 'given' : 'auto', modern: 'given', ratio: item.ratio });
      }
    });
    // MaplatTin と同じ比較関数（同値は 1 を返す）で並べる
    items.sort((a, b) => (a.ratio < b.ratio ? -1 : 1));
    for (const it of items) {
      out.push({ edge: i, hist: it.hist, modern: it.modern, histPoint: [it.histPoint[0], it.histPoint[1]], modernPoint: [it.modernPoint[0], it.modernPoint[1]] });
    }
  });
  return out;
}

/** 座標の一致（JSON を往復した倍精度は厳密に一致するが、相対 1e-12 まで許す） */
function samePoint(a, b) {
  const tol = (v) => 1e-12 * Math.max(1, Math.abs(v));
  return Math.abs(a[0] - b[0]) <= tol(a[0]) && Math.abs(a[1] - b[1]) <= tol(a[1]);
}

/**
 * `compiled.edgeNodes` の各点の出どころを判定する（再現した生成結果と座標で突き合わせる）。
 * 個数・座標が 1 つでも食い違えば例外（データが別の手順で作られた ∴ 分けられない）。
 *
 * @returns {Array<{ edge: number, hist: 'given'|'auto', modern: 'given'|'auto' }>} `edgeNodes` と同じ並び
 */
export function classifyEdgeNodes(compiled) {
  const actual = Array.isArray(compiled?.edgeNodes) ? compiled.edgeNodes : [];
  const generated = generateEdgeNodeOrigins(compiled);
  if (generated.length !== actual.length) {
    throw new Error(`辺ノードの個数が再現と食い違う: edgeNodes ${actual.length} / 再現 ${generated.length}`);
  }
  return generated.map((g, n) => {
    const [h, m] = actual[n];
    if (!samePoint(g.histPoint, h) || !samePoint(g.modernPoint, m)) {
      throw new Error(`edgeNodes[${n}] の座標が再現と食い違う（edges[${g.edge}]）`);
    }
    return { edge: g.edge, hist: g.hist, modern: g.modern };
  });
}

/**
 * 面ごとの 3 種の点の個数。`gcp` は対応点、`given` はデータで指定された中間点、`auto` は対応面側で自動生成された中間点。
 * @param {number} gcpCount
 * @param {Array<{ hist: string, modern: string }>} origins `classifyEdgeNodes` の戻り値
 */
export function pointKindCounts(gcpCount, origins) {
  const side = (key) => ({
    gcp: gcpCount,
    given: origins.filter((o) => o[key] === 'given').length,
    auto: origins.filter((o) => o[key] === 'auto').length,
  });
  return { hist: side('hist'), modern: side('modern') };
}

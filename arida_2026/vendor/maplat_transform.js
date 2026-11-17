function st(r, t, e = {}) {
  const n = { type: "Feature" };
  return (e.id === 0 || e.id) && (n.id = e.id), e.bbox && (n.bbox = e.bbox), n.properties = t || {}, n.geometry = r, n;
}
function X(r, t, e = {}) {
  if (!r)
    throw new Error("coordinates is required");
  if (!Array.isArray(r))
    throw new Error("coordinates must be an Array");
  if (r.length < 2)
    throw new Error("coordinates must be at least 2 numbers long");
  if (!Z(r[0]) || !Z(r[1]))
    throw new Error("coordinates must contain numbers");
  return st({
    type: "Point",
    coordinates: r
  }, t, e);
}
function W(r, t, e = {}) {
  for (const o of r) {
    if (o.length < 4)
      throw new Error(
        "Each LinearRing of a Polygon must have 4 or more Positions."
      );
    if (o[o.length - 1].length !== o[0].length)
      throw new Error("First and last Position are not equivalent.");
    for (let i = 0; i < o[o.length - 1].length; i++)
      if (o[o.length - 1][i] !== o[0][i])
        throw new Error("First and last Position are not equivalent.");
  }
  return st({
    type: "Polygon",
    coordinates: r
  }, t, e);
}
function V(r, t = {}) {
  const e = { type: "FeatureCollection" };
  return t.id && (e.id = t.id), t.bbox && (e.bbox = t.bbox), e.features = r, e;
}
function Z(r) {
  return !isNaN(r) && r !== null && !Array.isArray(r);
}
function dt(r) {
  if (!r)
    throw new Error("coord is required");
  if (!Array.isArray(r)) {
    if (r.type === "Feature" && r.geometry !== null && r.geometry.type === "Point")
      return [...r.geometry.coordinates];
    if (r.type === "Point")
      return [...r.coordinates];
  }
  if (Array.isArray(r) && r.length >= 2 && !Array.isArray(r[0]) && !Array.isArray(r[1]))
    return [...r];
  throw new Error("coord must be GeoJSON Point or an Array of numbers");
}
function J(r) {
  if (Array.isArray(r))
    return r;
  if (r.type === "Feature") {
    if (r.geometry !== null)
      return r.geometry.coordinates;
  } else if (r.coordinates)
    return r.coordinates;
  throw new Error(
    "coords must be GeoJSON Feature, Geometry Object or an Array"
  );
}
function ht(r) {
  return r.type === "Feature" ? r.geometry : r;
}
const N = 11102230246251565e-32, E = 134217729, lt = (3 + 8 * N) * N;
function Y(r, t, e, n, o) {
  let i, s, d, a, c = t[0], m = n[0], u = 0, h = 0;
  m > c == m > -c ? (i = c, c = t[++u]) : (i = m, m = n[++h]);
  let g = 0;
  if (u < r && h < e)
    for (m > c == m > -c ? (s = c + i, d = i - (s - c), c = t[++u]) : (s = m + i, d = i - (s - m), m = n[++h]), i = s, d !== 0 && (o[g++] = d); u < r && h < e; )
      m > c == m > -c ? (s = i + c, a = s - i, d = i - (s - a) + (c - a), c = t[++u]) : (s = i + m, a = s - i, d = i - (s - a) + (m - a), m = n[++h]), i = s, d !== 0 && (o[g++] = d);
  for (; u < r; )
    s = i + c, a = s - i, d = i - (s - a) + (c - a), c = t[++u], i = s, d !== 0 && (o[g++] = d);
  for (; h < e; )
    s = i + m, a = s - i, d = i - (s - a) + (m - a), m = n[++h], i = s, d !== 0 && (o[g++] = d);
  return (i !== 0 || g === 0) && (o[g++] = i), g;
}
function yt(r, t) {
  let e = t[0];
  for (let n = 1; n < r; n++) e += t[n];
  return e;
}
function D(r) {
  return new Float64Array(r);
}
const mt = (3 + 16 * N) * N, gt = (2 + 12 * N) * N, xt = (9 + 64 * N) * N * N, U = D(4), j = D(8), K = D(12), Q = D(16), A = D(4);
function bt(r, t, e, n, o, i, s) {
  let d, a, c, m, u, h, g, x, y, l, f, p, w, M, T, b, _, v;
  const S = r - o, C = e - o, B = t - i, P = n - i;
  M = S * P, h = E * S, g = h - (h - S), x = S - g, h = E * P, y = h - (h - P), l = P - y, T = x * l - (M - g * y - x * y - g * l), b = B * C, h = E * B, g = h - (h - B), x = B - g, h = E * C, y = h - (h - C), l = C - y, _ = x * l - (b - g * y - x * y - g * l), f = T - _, u = T - f, U[0] = T - (f + u) + (u - _), p = M + f, u = p - M, w = M - (p - u) + (f - u), f = w - b, u = w - f, U[1] = w - (f + u) + (u - b), v = p + f, u = v - p, U[2] = p - (v - u) + (f - u), U[3] = v;
  let k = yt(4, U), F = gt * s;
  if (k >= F || -k >= F || (u = r - S, d = r - (S + u) + (u - o), u = e - C, c = e - (C + u) + (u - o), u = t - B, a = t - (B + u) + (u - i), u = n - P, m = n - (P + u) + (u - i), d === 0 && a === 0 && c === 0 && m === 0) || (F = xt * s + lt * Math.abs(k), k += S * m + P * d - (B * c + C * a), k >= F || -k >= F)) return k;
  M = d * P, h = E * d, g = h - (h - d), x = d - g, h = E * P, y = h - (h - P), l = P - y, T = x * l - (M - g * y - x * y - g * l), b = a * C, h = E * a, g = h - (h - a), x = a - g, h = E * C, y = h - (h - C), l = C - y, _ = x * l - (b - g * y - x * y - g * l), f = T - _, u = T - f, A[0] = T - (f + u) + (u - _), p = M + f, u = p - M, w = M - (p - u) + (f - u), f = w - b, u = w - f, A[1] = w - (f + u) + (u - b), v = p + f, u = v - p, A[2] = p - (v - u) + (f - u), A[3] = v;
  const ct = Y(4, U, 4, A, j);
  M = S * m, h = E * S, g = h - (h - S), x = S - g, h = E * m, y = h - (h - m), l = m - y, T = x * l - (M - g * y - x * y - g * l), b = B * c, h = E * B, g = h - (h - B), x = B - g, h = E * c, y = h - (h - c), l = c - y, _ = x * l - (b - g * y - x * y - g * l), f = T - _, u = T - f, A[0] = T - (f + u) + (u - _), p = M + f, u = p - M, w = M - (p - u) + (f - u), f = w - b, u = w - f, A[1] = w - (f + u) + (u - b), v = p + f, u = v - p, A[2] = p - (v - u) + (f - u), A[3] = v;
  const ut = Y(ct, j, 4, A, K);
  M = d * m, h = E * d, g = h - (h - d), x = d - g, h = E * m, y = h - (h - m), l = m - y, T = x * l - (M - g * y - x * y - g * l), b = a * c, h = E * a, g = h - (h - a), x = a - g, h = E * c, y = h - (h - c), l = c - y, _ = x * l - (b - g * y - x * y - g * l), f = T - _, u = T - f, A[0] = T - (f + u) + (u - _), p = M + f, u = p - M, w = M - (p - u) + (f - u), f = w - b, u = w - f, A[1] = w - (f + u) + (u - b), v = p + f, u = v - p, A[2] = p - (v - u) + (f - u), A[3] = v;
  const ft = Y(ut, K, 4, A, Q);
  return Q[ft - 1];
}
function pt(r, t, e, n, o, i) {
  const s = (t - i) * (e - o), d = (r - o) * (n - i), a = s - d, c = Math.abs(s + d);
  return Math.abs(a) >= mt * c ? a : -bt(r, t, e, n, o, i, c);
}
function wt(r, t) {
  var e, n, o = 0, i, s, d, a, c, m, u, h = r[0], g = r[1], x = t.length;
  for (e = 0; e < x; e++) {
    n = 0;
    var y = t[e], l = y.length - 1;
    if (m = y[0], m[0] !== y[l][0] && m[1] !== y[l][1])
      throw new Error("First and last coordinates in a ring must be the same");
    for (s = m[0] - h, d = m[1] - g, n; n < l; n++) {
      if (u = y[n + 1], a = u[0] - h, c = u[1] - g, d === 0 && c === 0) {
        if (a <= 0 && s >= 0 || s <= 0 && a >= 0)
          return 0;
      } else if (c >= 0 && d <= 0 || c <= 0 && d >= 0) {
        if (i = pt(s, a, d, c, 0, 0), i === 0)
          return 0;
        (i > 0 && c > 0 && d <= 0 || i < 0 && c <= 0 && d > 0) && o++;
      }
      m = u, d = c, s = a;
    }
  }
  return o % 2 !== 0;
}
function L(r, t, e = {}) {
  if (!r)
    throw new Error("point is required");
  if (!t)
    throw new Error("polygon is required");
  const n = dt(r), o = ht(t), i = o.type, s = t.bbox;
  let d = o.coordinates;
  if (s && Mt(n, s) === !1)
    return !1;
  i === "Polygon" && (d = [d]);
  for (var a = 0; a < d.length; ++a) {
    const c = wt(n, d[a]);
    if (c === 0 && !e.ignoreBoundary) return !0;
    if (c) return !0;
  }
  return !1;
}
function Mt(r, t) {
  return t[0] <= r[0] && t[1] <= r[1] && t[2] >= r[0] && t[3] >= r[1];
}
function $(r, t) {
  for (let e = 0; e < t.features.length; e++)
    if (L(r, t.features[e]))
      return t.features[e];
}
function ot(r, t) {
  const e = t.geometry.coordinates[0][0], n = t.geometry.coordinates[0][1], o = t.geometry.coordinates[0][2], i = r.geometry.coordinates, s = t.properties.a.geom, d = t.properties.b.geom, a = t.properties.c.geom, c = [n[0] - e[0], n[1] - e[1]], m = [o[0] - e[0], o[1] - e[1]], u = [i[0] - e[0], i[1] - e[1]], h = [d[0] - s[0], d[1] - s[1]], g = [a[0] - s[0], a[1] - s[1]], x = (m[1] * u[0] - m[0] * u[1]) / (c[0] * m[1] - c[1] * m[0]), y = (c[0] * u[1] - c[1] * u[0]) / (c[0] * m[1] - c[1] * m[0]);
  return [
    x * h[0] + y * g[0] + s[0],
    x * h[1] + y * g[1] + s[1]
  ];
}
function _t(r, t, e) {
  const n = r.geometry.coordinates, o = e.geometry.coordinates, i = Math.atan2(n[0] - o[0], n[1] - o[1]), s = vt(i, t[0]);
  if (s === void 0)
    throw new Error("Unable to determine vertex index");
  const d = t[1][s];
  return ot(r, d.features[0]);
}
function Tt(r, t, e, n, o, i, s, d) {
  let a;
  if (s && (a = $(r, V([s]))), !a)
    if (e) {
      const c = r.geometry.coordinates, m = e.gridNum, u = e.xOrigin, h = e.yOrigin, g = e.xUnit, x = e.yUnit, y = e.gridCache, l = O(c[0], u, g, m), f = O(c[1], h, x, m), p = y[l] ? y[l][f] ? y[l][f] : [] : [], w = V(p.map((M) => t.features[M]));
      a = $(r, w);
    } else
      a = $(r, t);
  return d && d(a), a ? ot(r, a) : _t(r, n, o);
}
function O(r, t, e, n) {
  let o = Math.floor((r - t) / e);
  return o < 0 && (o = 0), o >= n && (o = n - 1), o;
}
function vt(r, t) {
  let e = H(r - t[0]), n = Math.PI * 2, o;
  for (let i = 0; i < t.length; i++) {
    const s = (i + 1) % t.length, d = H(r - t[s]), a = Math.min(Math.abs(e), Math.abs(d));
    e * d <= 0 && a < n && (n = a, o = i), e = d;
  }
  return o;
}
function H(r, t = !1) {
  const e = 2 * Math.PI, n = r - Math.floor(r / e) * e;
  return t ? n : n > Math.PI ? n - e : n;
}
function Ft(r) {
  const t = r.features;
  for (let e = 0; e < t.length; e++) {
    const n = t[e];
    `${n.properties.a.index}`.substring(0, 1) === "b" && `${n.properties.b.index}`.substring(0, 1) === "b" ? t[e] = {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            n.geometry.coordinates[0][2],
            n.geometry.coordinates[0][0],
            n.geometry.coordinates[0][1],
            n.geometry.coordinates[0][2]
          ]
        ]
      },
      properties: {
        a: {
          geom: n.properties.c.geom,
          index: n.properties.c.index
        },
        b: {
          geom: n.properties.a.geom,
          index: n.properties.a.index
        },
        c: {
          geom: n.properties.b.geom,
          index: n.properties.b.index
        }
      },
      type: "Feature"
    } : `${n.properties.c.index}`.substring(0, 1) === "b" && `${n.properties.a.index}`.substring(0, 1) === "b" && (t[e] = {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            n.geometry.coordinates[0][1],
            n.geometry.coordinates[0][2],
            n.geometry.coordinates[0][0],
            n.geometry.coordinates[0][1]
          ]
        ]
      },
      properties: {
        a: {
          geom: n.properties.b.geom,
          index: n.properties.b.index
        },
        b: {
          geom: n.properties.c.geom,
          index: n.properties.c.index
        },
        c: {
          geom: n.properties.a.geom,
          index: n.properties.a.index
        }
      },
      type: "Feature"
    });
  }
  return r;
}
function Dt(r) {
  const t = ["a", "b", "c", "a"].map(
    (i) => r.properties[i].geom
  ), e = r.geometry.coordinates[0], n = r.properties, o = {
    a: { geom: e[0], index: n.a.index },
    b: { geom: e[1], index: n.b.index },
    c: { geom: e[2], index: n.c.index }
  };
  return W([t], o);
}
function Et(r) {
  const t = [0, 1, 2, 0].map((n) => r[n][0][0]), e = {
    a: { geom: r[0][0][1], index: r[0][1] },
    b: { geom: r[1][0][1], index: r[1][1] },
    c: { geom: r[2][0][1], index: r[2][1] }
  };
  return W([t], e);
}
function G(r, t, e, n, o, i = !1, s) {
  const d = r.map(
    (a) => {
      (!s || s < 2.00703) && (a = At(a));
      const c = isFinite(a) ? t[a] : a === "c" ? n : (function() {
        const m = a.match(/^b(\d+)$/);
        if (m) return o[parseInt(m[1])];
        const u = a.match(/^e(\d+)$/);
        if (u) return e[parseInt(u[1])];
        throw new Error("Bad index value for indexesToTri");
      })();
      return i ? [[c[1], c[0]], a] : [[c[0], c[1]], a];
    }
  );
  return Et(d);
}
function At(r) {
  return typeof r == "number" ? r : r.replace(/^(c|e|b)(?:ent|dgeNode|box)(\d+)?$/, "$1$2");
}
function It(r, t) {
  return t && t >= 2.00703 || Array.isArray(r[0]) ? r : r.map((e) => [
    e.illstNodes,
    e.mercNodes,
    e.startEnd
  ]);
}
const it = 2.00704;
function St(r) {
  return !!(r.version !== void 0 || !r.tins && r.points && r.tins_points);
}
function Ct(r) {
  return {
    points: r.points,
    strictStatus: Pt(r),
    verticesParams: Ot(r),
    centroid: Rt(r),
    edges: It(r.edges || []),
    edgeNodes: r.edgeNodes || [],
    tins: kt(r),
    kinks: Xt(r.kinks_points),
    yaxisMode: r.yaxisMode ?? "invert",
    strictMode: r.strictMode ?? "auto",
    vertexMode: r.vertexMode,
    bounds: r.bounds,
    boundsPolygon: r.boundsPolygon,
    wh: r.wh,
    xy: r.xy ?? [0, 0]
  };
}
function Bt(r) {
  const t = Nt(r), e = t.tins;
  return {
    compiled: t,
    tins: e,
    points: Lt(e),
    strictStatus: t.strict_status,
    verticesParams: t.vertices_params,
    centroid: t.centroid,
    kinks: t.kinks
  };
}
function Pt(r) {
  return r.strict_status ? r.strict_status : r.kinks_points ? "strict_error" : r.tins_points.length === 2 ? "loose" : "strict";
}
function Ot(r) {
  const t = {
    forw: [r.vertices_params[0]],
    bakw: [r.vertices_params[1]]
  };
  return t.forw[1] = tt(r, !1), t.bakw[1] = tt(r, !0), t;
}
function tt(r, t) {
  const e = r.vertices_points.length;
  return Array.from({ length: e }, (n, o) => {
    const i = (o + 1) % e, s = G(
      ["c", `b${o}`, `b${i}`],
      r.points,
      r.edgeNodes || [],
      r.centroid_point,
      r.vertices_points,
      t,
      it
    );
    return V([s]);
  });
}
function Rt(r) {
  return {
    forw: X(r.centroid_point[0], {
      target: {
        geom: r.centroid_point[1],
        index: "c"
      }
    }),
    bakw: X(r.centroid_point[1], {
      target: {
        geom: r.centroid_point[0],
        index: "c"
      }
    })
  };
}
function kt(r) {
  const t = r.tins_points.length === 1 ? 0 : 1;
  return {
    forw: V(
      r.tins_points[0].map(
        (e) => G(
          e,
          r.points,
          r.edgeNodes || [],
          r.centroid_point,
          r.vertices_points,
          !1,
          r.version
        )
      )
    ),
    bakw: V(
      r.tins_points[t].map(
        (e) => G(
          e,
          r.points,
          r.edgeNodes || [],
          r.centroid_point,
          r.vertices_points,
          !0,
          r.version
        )
      )
    )
  };
}
function Xt(r) {
  if (r)
    return {
      bakw: V(
        r.map((t) => X(t))
      )
    };
}
function Nt(r) {
  return JSON.parse(
    JSON.stringify(r).replace('"cent"', '"c"').replace(/"bbox(\d+)"/g, '"b$1"')
  );
}
function Lt(r) {
  const t = [], e = r.forw.features;
  for (let n = 0; n < e.length; n++) {
    const o = e[n];
    ["a", "b", "c"].forEach((i, s) => {
      const d = o.geometry.coordinates[0][s], a = o.properties[i].geom, c = o.properties[i].index;
      typeof c == "number" && (t[c] = [d, a]);
    });
  }
  return t;
}
const Wt = it;
class I {
  /**
   * 各種モードの定数定義
   * すべてreadonlyで、型安全性を確保
   */
  static VERTEX_PLAIN = "plain";
  static VERTEX_BIRDEYE = "birdeye";
  static MODE_STRICT = "strict";
  static MODE_AUTO = "auto";
  static MODE_LOOSE = "loose";
  static STATUS_STRICT = "strict";
  static STATUS_ERROR = "strict_error";
  static STATUS_LOOSE = "loose";
  static YAXIS_FOLLOW = "follow";
  static YAXIS_INVERT = "invert";
  points = [];
  /** @deprecated 2.00704 以降、Transform はこのプロパティを設定も参照もしない。サブクラス（MaplatTin）は、旧 @maplat/transform と組まれたときの互換のため {} を入れる（t2 設計 §2.1） */
  pointsWeightBuffer;
  strict_status;
  vertices_params;
  centroid;
  edgeNodes;
  edges;
  tins;
  kinks;
  yaxisMode = I.YAXIS_INVERT;
  strictMode = I.MODE_AUTO;
  vertexMode = I.VERTEX_PLAIN;
  bounds;
  boundsPolygon;
  wh;
  xy;
  indexedTins;
  stateFull = !1;
  stateTriangle;
  stateBackward;
  /**
   * Optional properties for MaplatCore extension
   * These properties allow consuming applications to extend Transform instances
   * with additional metadata without requiring Module Augmentation
   */
  /** Layer priority for rendering order */
  priority;
  /** Layer importance for display decisions */
  importance;
  /** Bounds in XY (source) coordinate system */
  xyBounds;
  /** Bounds in Mercator (Web Mercator) coordinate system */
  mercBounds;
  constructor() {
  }
  /**
   * コンパイルされた設定を適用します
   *
   * @param compiled - コンパイルされた設定オブジェクト
   * @returns 変換に必要な主要なオブジェクトのセット
   *
   * 以下の処理を行います：
   * 1. バージョンに応じた設定の解釈
   * 2. 各種パラメータの復元
   * 3. TINネットワークの再構築
   * 4. インデックスの作成
   */
  setCompiled(t) {
    if (St(t)) {
      this.applyModernState(Ct(t));
      return;
    }
    this.applyLegacyState(Bt(t));
  }
  applyModernState(t) {
    this.points = t.points, this.strict_status = t.strictStatus, this.vertices_params = t.verticesParams, this.centroid = t.centroid, this.edges = t.edges, this.edgeNodes = t.edgeNodes || [], this.tins = t.tins, this.addIndexedTin(), this.kinks = t.kinks, this.yaxisMode = t.yaxisMode ?? I.YAXIS_INVERT, this.vertexMode = t.vertexMode ?? I.VERTEX_PLAIN, this.strictMode = t.strictMode ?? I.MODE_AUTO, t.bounds ? (this.bounds = t.bounds, this.boundsPolygon = t.boundsPolygon, this.xy = t.xy, this.wh = t.wh) : (this.bounds = void 0, this.boundsPolygon = void 0, this.xy = t.xy ?? [0, 0], t.wh && (this.wh = t.wh));
  }
  applyLegacyState(t) {
    this.tins = t.tins, this.addIndexedTin(), this.strict_status = t.strictStatus, this.vertices_params = t.verticesParams, this.centroid = t.centroid, this.kinks = t.kinks, this.points = t.points;
  }
  /**
   * TINネットワークのインデックスを作成します
   *
   * インデックスは変換処理を高速化するために使用されます。
   * グリッド形式のインデックスを作成し、各グリッドに
   * 含まれる三角形を記録します。
   */
  addIndexedTin() {
    const t = this.tins, e = t.forw, n = t.bakw, o = Math.ceil(Math.sqrt(e.features.length));
    if (o < 3) {
      this.indexedTins = void 0;
      return;
    }
    let i = [], s = [];
    const d = e.features.map((y) => {
      let l = [];
      return J(y)[0].map((f) => {
        i.length === 0 ? i = [Array.from(f), Array.from(f)] : (f[0] < i[0][0] && (i[0][0] = f[0]), f[0] > i[1][0] && (i[1][0] = f[0]), f[1] < i[0][1] && (i[0][1] = f[1]), f[1] > i[1][1] && (i[1][1] = f[1])), l.length === 0 ? l = [Array.from(f), Array.from(f)] : (f[0] < l[0][0] && (l[0][0] = f[0]), f[0] > l[1][0] && (l[1][0] = f[0]), f[1] < l[0][1] && (l[0][1] = f[1]), f[1] > l[1][1] && (l[1][1] = f[1]));
      }), l;
    }), a = (i[1][0] - i[0][0]) / o, c = (i[1][1] - i[0][1]) / o, m = d.reduce(
      (y, l, f) => {
        const p = O(l[0][0], i[0][0], a, o), w = O(l[1][0], i[0][0], a, o), M = O(l[0][1], i[0][1], c, o), T = O(l[1][1], i[0][1], c, o);
        for (let b = p; b <= w; b++) {
          y[b] || (y[b] = []);
          for (let _ = M; _ <= T; _++)
            y[b][_] || (y[b][_] = []), y[b][_].push(f);
        }
        return y;
      },
      []
    ), u = n.features.map((y) => {
      let l = [];
      return J(y)[0].map((f) => {
        s.length === 0 ? s = [Array.from(f), Array.from(f)] : (f[0] < s[0][0] && (s[0][0] = f[0]), f[0] > s[1][0] && (s[1][0] = f[0]), f[1] < s[0][1] && (s[0][1] = f[1]), f[1] > s[1][1] && (s[1][1] = f[1])), l.length === 0 ? l = [Array.from(f), Array.from(f)] : (f[0] < l[0][0] && (l[0][0] = f[0]), f[0] > l[1][0] && (l[1][0] = f[0]), f[1] < l[0][1] && (l[0][1] = f[1]), f[1] > l[1][1] && (l[1][1] = f[1]));
      }), l;
    }), h = (s[1][0] - s[0][0]) / o, g = (s[1][1] - s[0][1]) / o, x = u.reduce(
      (y, l, f) => {
        const p = O(l[0][0], s[0][0], h, o), w = O(l[1][0], s[0][0], h, o), M = O(l[0][1], s[0][1], g, o), T = O(l[1][1], s[0][1], g, o);
        for (let b = p; b <= w; b++) {
          y[b] || (y[b] = []);
          for (let _ = M; _ <= T; _++)
            y[b][_] || (y[b][_] = []), y[b][_].push(f);
        }
        return y;
      },
      []
    );
    this.indexedTins = {
      forw: {
        gridNum: o,
        xOrigin: i[0][0],
        yOrigin: i[0][1],
        xUnit: a,
        yUnit: c,
        gridCache: m
      },
      bakw: {
        gridNum: o,
        xOrigin: s[0][0],
        yOrigin: s[0][1],
        xUnit: h,
        yUnit: g,
        gridCache: x
      }
    };
  }
  /**
   * 座標変換を実行します
   *
   * @param apoint - 変換する座標
   * @param backward - 逆方向の変換かどうか
   * @param ignoreBounds - 境界チェックを無視するかどうか
   * @returns 変換後の座標、または境界外の場合はfalse
   *
   * @throws {Error} 逆方向変換が許可されていない状態での逆変換時
   */
  transform(t, e, n) {
    if (!this.tins)
      throw new Error("setCompiled() must be called before transform()");
    if (e && this.strict_status == I.STATUS_ERROR)
      throw new Error('Backward transform is not allowed if strict_status == "strict_error"');
    this.yaxisMode == I.YAXIS_FOLLOW && e && (t = [t[0], -1 * t[1]]);
    const o = X(t);
    if (this.bounds && !e && !n && !L(o, this.boundsPolygon))
      return !1;
    const i = e ? this.tins.bakw : this.tins.forw, s = e ? this.indexedTins.bakw : this.indexedTins.forw, d = e ? this.vertices_params.bakw : this.vertices_params.forw, a = e ? this.centroid.bakw : this.centroid.forw;
    let c, m;
    this.stateFull && (this.stateBackward == e ? c = this.stateTriangle : (this.stateBackward = e, this.stateTriangle = void 0), m = (h) => {
      this.stateTriangle = h;
    });
    let u = Tt(
      o,
      i,
      s,
      d,
      a,
      void 0,
      c,
      m
    );
    if (this.bounds && e && !n) {
      const h = X(u);
      if (!L(h, this.boundsPolygon)) return !1;
    } else this.yaxisMode == I.YAXIS_FOLLOW && !e && (u = [u[0], -1 * u[1]]);
    return u;
  }
}
const R = 20037508342789244e-9, Ut = [
  [0, 0],
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0]
];
function at(r, t) {
  return Math.floor(Math.min(r[0], r[1]) / 4) * R / 128 / Math.pow(2, t);
}
function Vt(r, t) {
  const e = [];
  for (let n = 0; n < r.length; n++) {
    const o = r[n], i = o[0] * Math.cos(t) - o[1] * Math.sin(t), s = o[0] * Math.sin(t) + o[1] * Math.cos(t);
    e.push([i, s]);
  }
  return e;
}
function rt(r, t, e, n) {
  const o = at(n, t);
  return Vt(Ut, e).map((d) => [
    d[0] * o + r[0],
    d[1] * o + r[1]
  ]);
}
function et(r, t) {
  const e = r[0], o = r.slice(1, 5).map((g) => [
    g[0] - e[0],
    g[1] - e[1]
  ]), i = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0]
  ];
  let s = 0, d = 0, a = 0;
  for (let g = 0; g < 4; g++) {
    const x = o[g], y = i[g], l = Math.sqrt(Math.pow(x[0], 2) + Math.pow(x[1], 2));
    s += l;
    const f = x[0] * y[1] - x[1] * y[0], p = Math.acos(
      (x[0] * y[0] + x[1] * y[1]) / l
    ), w = f > 0 ? -1 * p : p;
    d += Math.cos(w), a += Math.sin(w);
  }
  const c = s / 4, m = Math.atan2(a, d), u = Math.floor(Math.min(t[0], t[1]) / 4), h = Math.log(u * R / 128 / c) / Math.log(2);
  return { center: e, zoom: h, rotation: m };
}
function q(r, t) {
  const e = r[0] * (2 * R) / t - R, n = -1 * (r[1] * (2 * R) / t - R);
  return [e, n];
}
function nt(r, t) {
  const e = (r[0] + R) * t / (2 * R), n = (-r[1] + R) * t / (2 * R);
  return [e, n];
}
const z = 256;
class Yt {
  mainTin = null;
  subTins = [];
  _maxxy = 0;
  // ─── 初期化 ────────────────────────────────────────────────────────────────
  /**
   * 地図データ（コンパイル済み TIN + sub_maps）をロードする
   *
   * @param mapData - メイン TIN と sub_maps の情報
   */
  setMapData(t) {
    const e = new I();
    if (e.setCompiled(t.compiled), this.mainTin = e, t.maxZoom !== void 0)
      this._maxxy = Math.pow(2, t.maxZoom) * z;
    else if (t.compiled.wh) {
      const n = Math.max(t.compiled.wh[0], t.compiled.wh[1]), o = Math.ceil(Math.log2(n / z));
      this._maxxy = Math.pow(2, o) * z;
    }
    if (this.subTins = [], t.sub_maps)
      for (const n of t.sub_maps) {
        const o = new I();
        o.setCompiled(n.compiled);
        const i = n.bounds ?? n.compiled.bounds;
        if (!i)
          throw new Error(
            "SubMapData must have bounds or compiled.bounds to create xyBounds polygon"
          );
        const s = [...i, i[0]], d = s.map((a) => {
          const c = o.transform(a, !1);
          if (!c) throw new Error("Failed to transform sub-map bounds to mercator");
          return c;
        });
        this.subTins.push({
          tin: o,
          priority: n.priority,
          importance: n.importance,
          xyBounds: W([s]),
          mercBounds: W([d])
        });
      }
  }
  // ─── 処理2: submap TIN 選択付き変換 ───────────────────────────────────────
  /**
   * ピクセル座標 → メルカトル座標（最適レイヤー選択）
   *
   * @param xy - ピクセル座標 [x, y]
   * @returns メルカトル座標、または範囲外の場合は false
   */
  xy2Merc(t) {
    const e = this.xy2MercWithLayer(t);
    return e ? e[1] : !1;
  }
  /**
   * メルカトル座標 → ピクセル座標（最適レイヤー選択）
   *
   * @param merc - メルカトル座標 [x, y]
   * @returns ピクセル座標、または範囲外の場合は false
   */
  merc2Xy(t) {
    const e = this.merc2XyWithLayer(t), n = e[0] || e[1];
    return n ? n[1] : !1;
  }
  /**
   * ピクセル座標 → メルカトル座標（レイヤーID付き）
   * histmap_tin.ts xy2MercAsync_returnLayer() の同期版
   *
   * @param xy - ピクセル座標 [x, y]
   * @returns [レイヤーインデックス, メルカトル座標] または false
   */
  xy2MercWithLayer(t) {
    this._assertMapData();
    const e = this._getTinsSortedByPriority();
    for (let n = 0; n < e.length; n++) {
      const { index: o, isMain: i } = e[n];
      if (i || L(X(t), this.subTins[o - 1].xyBounds)) {
        const s = this._transformByIndex(t, o, !1);
        if (s === !1) continue;
        return [o, s];
      }
    }
    return !1;
  }
  /**
   * メルカトル座標 → ピクセル座標（複数レイヤー結果）
   * histmap_tin.ts merc2XyAsync_returnLayer() の同期版
   *
   * 現在は MaplatCore の仕様に合わせ、最大2レイヤーまで返す。
   * 3レイヤー以上返したい場合は、下記の .slice(0, 2) および .filter(i < 2) の
   * 上限値を増やすか、引数で上限を指定できるようにすること。
   *
   * @param merc - メルカトル座標 [x, y]
   * @returns 最大2要素の配列。各要素は [レイヤーインデックス, ピクセル座標] または undefined
   */
  merc2XyWithLayer(t) {
    return this._assertMapData(), this._getAllTinsWithIndex().map(({ index: s, tin: d, isMain: a }) => {
      const c = this._transformByIndex(t, s, !0);
      return c === !1 ? [d, s] : a || L(X(c), this.subTins[s - 1].xyBounds) ? [d, s, c] : [d, s];
    }).sort((s, d) => {
      const a = s[0].priority ?? 0, c = d[0].priority ?? 0;
      return a < c ? 1 : -1;
    }).reduce(
      (s, d, a, c) => {
        const m = d[0], u = d[1], h = d[2];
        if (!h) return s;
        for (let g = 0; g < a; g++) {
          const x = c[g][1], y = x === 0;
          if (c[g][2] && (y || L(X(h), this.subTins[x - 1].xyBounds)))
            if (s.length) {
              const l = !s[0], f = l ? s[1][2] : s[0][2], p = m.importance ?? 0, w = f.importance ?? 0;
              return l ? p < w ? s : [void 0, [u, h, m]] : [...s.filter(
                (b) => b !== void 0
              ), [u, h, m]].sort(
                (b, _) => (b[2].importance ?? 0) < (_[2].importance ?? 0) ? 1 : -1
              ).slice(0, 2);
            } else
              return [[u, h, m]];
        }
        return !s.length || !s[0] ? [[u, h, m]] : (s.push([u, h, m]), s.sort((g, x) => {
          const y = g[2].importance ?? 0, l = x[2].importance ?? 0;
          return y < l ? 1 : -1;
        }).filter((g, x) => x < 2));
      },
      []
    ).map((s) => {
      if (s)
        return [s[0], s[1]];
    });
  }
  /**
   * メルカトル座標 → 覆われていない対応層の一覧（GPS / POI の表示候補用）
   *
   * `merc2XyWithLayer` は視点換算・一般座標変換用で、本図を常に候補に含める。
   * GPS マーカー・POI ピンをどの層に描くかの判定には本メソッドを使う（MaplatTransform#9）。
   *
   * 1. 各層の TIN で逆変換し、sub_map は自身の `xyBounds` 内に入るものだけを対応層とする。
   *    本図（層 0）は紙の内外を判定せず常に対応層の候補とする（紙外の除外は呼び出し側が行う）
   * 2. 対応層の座標が、より priority の高い sub_map の `xyBounds` 内なら覆われている。
   *    その高 priority 層自身が当該地点に対応するかは関係しない。
   *    本図は priority 0 の sub_map の `xyBounds` 内でも覆われている
   * 3. 同じ priority の sub_map どうしは互いを覆わない
   * 4. 覆われていない対応層を importance 降順 → priority 降順 → 層番号昇順で並べ、上限を切らずに全件返す
   * 5. 覆われていない対応層が無ければ空配列（表現範囲外）。`undefined`（旧 hide 表現）は返さない
   *
   * @param merc - メルカトル座標 [x, y]
   * @returns [レイヤーインデックス, ピクセル座標] の配列（0 件以上・上限なし）
   */
  merc2XyVisibleLayers(t) {
    this._assertMapData();
    const e = this._getAllTinsWithIndex(), n = (a) => a === 0 ? 0 : this.subTins[a - 1].priority ?? 0, o = (a) => a === 0 ? 0 : this.subTins[a - 1].importance ?? 0, i = (a, c) => a === 0 || L(X(c), this.subTins[a - 1].xyBounds), s = [];
    for (const { index: a } of e) {
      const c = this._transformByIndex(t, a, !0);
      c !== !1 && i(a, c) && s.push({ index: a, xy: c });
    }
    const d = (a) => e.some(
      ({ index: c }) => c !== 0 && c !== a.index && (n(c) > n(a.index) || a.index === 0 && n(c) === 0) && i(c, a.xy)
    );
    return s.filter((a) => !d(a)).sort((a, c) => o(c.index) - o(a.index) || n(c.index) - n(a.index) || a.index - c.index).map((a) => [a.index, a.xy]);
  }
  /**
   * メルカトル5点 → システム座標（複数レイヤー）
   * histmap_tin.ts mercs2SysCoordsAsync_multiLayer() の同期版
   *
   * @param mercs - 5点のメルカトル座標配列（中心＋上下左右）
   * @returns 各レイヤーのシステム座標配列（または undefined）
   */
  mercs2SysCoords(t) {
    this._assertMapData();
    const e = this.merc2XyWithLayer(t[0]);
    let n = !1;
    return e.map((o, i) => {
      if (!o) {
        n = !0;
        return;
      }
      const s = o[0], d = o[1];
      return i !== 0 && !n ? [this.xy2SysCoordInternal(d)] : t.map((c, m) => m === 0 ? d : this._transformByIndex(c, s, !0)).map((c) => this.xy2SysCoordInternal(c));
    });
  }
  // ─── 処理3: ビューポート変換 ───────────────────────────────────────────────
  /**
   * ビューポート → TIN 適用後メルカトル5点
   * histmap_tin.ts viewpoint2MercsAsync() の同期版
   *
   * @param viewpoint - ビューポート（center, zoom, rotation）
   * @param size - 画面サイズ [width, height]
   * @returns TIN 変換後のメルカトル5点
   */
  viewpoint2Mercs(t, e) {
    this._assertMapData(), this._assertMaxxy();
    const o = rt(t.center, t.zoom, t.rotation, e).map((c) => nt(c, this._maxxy)), i = this.xy2MercWithLayer(o[0]);
    if (!i) throw new Error("viewpoint2Mercs: center point is out of bounds");
    const s = i[0], d = i[1];
    return o.map((c, m) => {
      if (m === 0) return d;
      const u = this._transformByIndex(c, s, !1);
      if (u === !1) throw new Error(`viewpoint2Mercs: point ${m} is out of bounds`);
      return u;
    });
  }
  /**
   * TIN 適用後メルカトル5点 → ビューポート
   * histmap_tin.ts mercs2ViewpointAsync() の同期版
   *
   * @param mercs - TIN 変換後のメルカトル5点
   * @param size - 画面サイズ [width, height]
   * @returns ビューポート（center, zoom, rotation）
   */
  mercs2Viewpoint(t, e) {
    this._assertMapData(), this._assertMaxxy();
    const n = this.merc2XyWithLayer(t[0]), o = n[0] || n[1];
    if (!o) throw new Error("mercs2Viewpoint: center point is out of bounds");
    const i = o[0], s = o[1], a = t.map((c, m) => {
      if (m === 0) return s;
      const u = this._transformByIndex(c, i, !0);
      if (u === !1) throw new Error(`mercs2Viewpoint: point ${m} is out of bounds`);
      return u;
    }).map((c) => q(c, this._maxxy));
    return et(a, e);
  }
  // ─── ユーティリティ（静的メソッド）────────────────────────────────────────
  /** zoom2Radius の静的ラッパー */
  static zoom2Radius(t, e) {
    return at(t, e);
  }
  /** mercViewpoint2Mercs の静的ラッパー */
  static mercViewpoint2Mercs(t, e, n, o) {
    return rt(t, e, n, o);
  }
  /** mercs2MercViewpoint の静的ラッパー */
  static mercs2MercViewpoint(t, e) {
    return et(t, e);
  }
  /** xy2SysCoord の静的ラッパー */
  static xy2SysCoord(t, e) {
    return q(t, e);
  }
  /** sysCoord2Xy の静的ラッパー */
  static sysCoord2Xy(t, e) {
    return nt(t, e);
  }
  // ─── 内部ヘルパー ──────────────────────────────────────────────────────────
  _assertMapData() {
    if (!this.mainTin)
      throw new Error("setMapData() must be called before transformation");
  }
  _assertMaxxy() {
    if (this._maxxy === 0)
      throw new Error(
        "MapData.maxZoom or compiled.wh must be set for viewpoint conversion (xy2SysCoord / sysCoord2Xy)"
      );
  }
  /**
   * レイヤーインデックスに対応する Transform インスタンスを返す（三角網描画などの用途）
   *
   * @param idx - 0 = メイン TIN、1以上 = sub_maps[idx-1]
   * @returns 対応する Transform、または範囲外の場合は null
   */
  getLayerTransform(t) {
    if (t === 0) return this.mainTin;
    const e = this.subTins[t - 1];
    return e ? e.tin : null;
  }
  /** レイヤー数を返す（メイン + sub 数） */
  get layerCount() {
    return 1 + this.subTins.length;
  }
  /**
   * viewpoint 変換に使用する最大ピクセル幅（2^maxZoom × 256）
   * stateToViewpoint / viewpointToState で zoom ↔ scale 変換に使用する
   * zoom = log2(scale × maxxy / 256) の関係
   */
  get maxxy() {
    return this._maxxy;
  }
  /** priority 降順でソートした [index, tin, isMain] の配列を返す */
  _getTinsSortedByPriority() {
    return this._getAllTinsWithIndex().sort((e, n) => {
      const o = e.tin.priority ?? 0, i = n.tin.priority ?? 0;
      return o < i ? 1 : -1;
    });
  }
  /** メイン TIN + 全 sub TIN を index 付きで返す */
  _getAllTinsWithIndex() {
    const t = [
      { index: 0, tin: this.mainTin, isMain: !0 }
    ];
    return this.subTins.forEach((e, n) => {
      e.tin.priority = e.priority, e.tin.importance = e.importance, t.push({ index: n + 1, tin: e.tin, isMain: !1 });
    }), t;
  }
  /**
   * 指定レイヤーインデックスで TIN 変換を実行する
   * index 0 → mainTin, index 1..n → subTins[index-1]
   */
  _transformByIndex(t, e, n) {
    if (e === 0)
      return this.mainTin.transform(t, n);
    const o = this.subTins[e - 1];
    return o ? o.tin.transform(t, n, !0) : !1;
  }
  /** 内部用 xy2SysCoord（_maxxy を使用） */
  xy2SysCoordInternal(t) {
    return q(t, this._maxxy);
  }
}
export {
  Ut as MERC_CROSSMATRIX,
  R as MERC_MAX,
  Yt as MapTransform,
  I as Transform,
  Dt as counterTri,
  Wt as format_version,
  rt as mercViewpoint2Mercs,
  et as mercs2MercViewpoint,
  It as normalizeEdges,
  Vt as rotateMatrix,
  Ft as rotateVerticesTriangle,
  nt as sysCoord2Xy,
  Tt as transformArr,
  q as xy2SysCoord,
  at as zoom2Radius
};

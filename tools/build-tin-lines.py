#!/usr/bin/env python3
"""安芸国広島城所絵図の TIN（三角網）を setLine 用の線分データへ変換する。

app/maps/aki_hiroshima_castle.json の compiled から:
  - constraints: 制約エッジ（points 端点 + edgeNodes 中間点の折れ線、merc 座標）
  - edges:       三角網の全エッジ（重複除去済み、merc 座標の2点線分）
を demo/assets/castle-tin.json に書き出す。

merc 座標を使う理由: MaplatCore の setVector は data.coordinates を
EPSG:3857 として merc2SysCoordAsync で絵図上へ変換する。頂点間は直線で
結ばれるが、TIN のエッジ自体が区分線形変換の単位なので、これで正確に
絵図上の三角網と一致する。
"""
import json, pathlib

root = pathlib.Path(__file__).resolve().parents[1]
src = json.load(open(root / "app/maps/aki_hiroshima_castle.json"))
c = src["compiled"]
points = c["points"]          # [[illstXY, mercXY], ...]
tris = c["tins_points"][0] if isinstance(c["tins_points"][0][0], list) else c["tins_points"]

edge_nodes = c.get("edgeNodes", [])
vertices = c.get("vertices_points", [])

def merc(i):
    """三角形頂点の merc 座標。'bN' = 外周 bbox 頂点、'eN' = 制約エッジ中間ノード。"""
    if isinstance(i, str):
        pool = vertices if i[0] == "b" else edge_nodes
        pt = pool[int(i[1:])]
    else:
        pt = points[i]
    return [round(pt[1][0], 2), round(pt[1][1], 2)]

constraints = []
constrained = set()
for e in c.get("edges", []):
    # e = [illst側中間点列, merc側中間点列, [端点idx, 端点idx]]。中間点は座標が直接入る
    mids = e[1] if len(e) > 1 else []
    a, b = e[2]
    chain = [merc(a)] + [[round(x, 2), round(y, 2)] for x, y in mids] + [merc(b)]
    constraints.append(chain)
    constrained.add(tuple(sorted((str(a), str(b)))))

edges = {}
for t in tris:
    for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
        k = tuple(sorted((str(a), str(b))))
        if k not in constrained and k not in edges:
            edges[k] = (a, b)

out = {
    "constraints": constraints,
    "edges": [[merc(a), merc(b)] for a, b in edges.values()],
}
dst = root / "demo/assets/castle-tin.json"
dst.write_text(json.dumps(out, separators=(",", ":")))
print(f"constraints: {len(constraints)} / tin edges: {len(out['edges'])} -> {dst} ({dst.stat().st_size:,}B)")

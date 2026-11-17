# Maplat Showcase

古地図を歪めずに現代地図と重ね合わせるビューア [Maplat](https://github.com/code4history/Maplat) のショーケース集。

Showcases for [Maplat](https://github.com/code4history/Maplat), the historical-map viewer that overlays old maps on the modern world **without distorting the original drawing**.

**▶ https://code4history.github.io/MaplatShowcase/**

## Showcases

| ページ | 内容 |
|---|---|
| [foss4g_hiroshima_2026.html](https://code4history.github.io/MaplatShowcase/foss4g_hiroshima_2026.html) | FOSS4G Hiroshima 2026 向け自動デモ。正保年間（1640s）の広島城下絵図と明治29年（1896）の実測図の上を GPS の現在地が歩き、宮島散策・ワープ比較・三角網（制約エッジ）の種明かしまでを約3分でループ上映する |
| [arida_2026/](https://code4history.github.io/MaplatShowcase/arida_2026/) | 動体計測研究会（ARIDA）2026-11-19 講演のデモ 4 本（往復変換・画像の縁を越える・制約辺の有無・5 点変換）。講演デッキの動画頁の QR がここの `demo-{a,b,c,d}.html` を指す。中身は AEROTOYOTA202611 の `demos/` から `demos/scripts/export-showcase.mjs` で複製したもの（`arida_2026/index.html` だけはここが正本）。手で直さない |

対応する実アプリ: https://s.maplat.jp/r/hiroshimamap/

## 構成

```
index.html                  ショーケースの入口
foss4g_hiroshima_2026.html  自動デモ本体（スライドショー + シナリオ駆動）
demo/                       シナリオエンジン・字幕・アセット
app/                        MaplatEditor からの書き出し一式（タイルは外部配信）
tools/                      TIN 可視化データ等の生成スクリプト
arida_2026/                 ARIDA 2026 講演のデモ 4 本（index.html は一覧。他は export-showcase.mjs の複製）
```

デモは Maplat アプリを同一オリジンの iframe に読み込み、`MaplatCore` の公開 API
（`setGPSMarker` / `setViewpoint` / `changeMap` / `setTransparency` / `setLine` など）で
シナリオ駆動する。詳細は `demo/demo.js` のコメントを参照。

## 権利表記

- 「安芸国広島城所絵図」: 国立公文書館蔵（Public Domain）
- 「改正鮮明廣島市實測地圖」: 国際日本文化研究センター蔵
- Maplat ロゴ・Maplat100 フォント・那由多ロゴ・FOSS4G Hiroshima 2026 ロゴは
  それぞれの権利者に帰属し、オープンライセンスの対象ではない

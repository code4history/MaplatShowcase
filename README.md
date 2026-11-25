# Maplat Showcase

古地図を歪めずに現代地図と重ね合わせるビューア [Maplat](https://github.com/code4history/Maplat) のショーケース集。

Showcases for [Maplat](https://github.com/code4history/Maplat), the historical-map viewer that overlays old maps on the modern world **without distorting the original drawing**.

**▶ https://code4history.github.io/MaplatShowcase/**

## Showcases

| ページ | 内容 |
|---|---|
| [foss4g_hiroshima_2026.html](https://code4history.github.io/MaplatShowcase/foss4g_hiroshima_2026.html) | FOSS4G Hiroshima 2026 向け自動デモ。正保年間（1640s）の広島城下絵図と明治29年（1896）の実測図の上を GPS の現在地が歩き、宮島散策・ワープ比較・三角網（制約エッジ）の種明かしまでを約3分でループ上映する |
| [geoawesome_2027/](https://code4history.github.io/MaplatShowcase/geoawesome_2027/) | Geoawesome 2027 のコミュニティ動画用の自動デモ（約 3 分・英語字幕）。古地図の歪みは情報 → 広島のビューア → 往復変換と制約辺 → 「どの地図もそれぞれの投影」の提案。地図面と三角網は `arida_2026/` の部品を使う。Pro のワープ場面は非公開コードなので収録済みの `assets/warp.mp4` を流す（収録元は NayutaProducts/GEOAWESOME/pro-warp）。`?rec=1` で自動再生を止め、`window.__geo.run()` で 1 周だけ走る（動画の収録用） |
| [arida_2026/](https://code4history.dev/MaplatShowcase/arida_2026/) | 動体計測研究会（ARIDA）2026-11-19 講演のデモ 4 本（往復変換・画像の縁を越える・制約辺の有無・5 点変換）。講演デッキの動画頁の QR がここの `demo-{a,b,c,d}.html` を指す。中身は AEROTOYOTA202611 の `demos/` から `demos/scripts/export-showcase.mjs` で複製したもの（`arida_2026/index.html` だけはここが正本）。手で直さない |

対応する実アプリ: https://s.maplat.jp/r/hiroshimamap/

## 構成

```
index.html                  ショーケースの入口
foss4g_hiroshima_2026.html  自動デモ本体（スライドショー + シナリオ駆動）
demo/                       シナリオエンジン・字幕・アセット
app/                        MaplatEditor からの書き出し一式（タイルは外部配信）
tools/                      TIN 可視化データ等の生成スクリプト
arida_2026/                 ARIDA 2026 講演のデモ 4 本（index.html は一覧。他は export-showcase.mjs の複製）
geoawesome_2027/            Geoawesome 2027 動画用の自動デモ（英語字幕。arida_2026/ の lib と data を読む）
```

デモは Maplat アプリを同一オリジンの iframe に読み込み、`MaplatCore` の公開 API
（`setGPSMarker` / `setViewpoint` / `changeMap` / `setTransparency` / `setLine` など）で
シナリオ駆動する。詳細は `demo/demo.js` のコメントを参照。

## 権利表記

- 「安芸国広島城所絵図」: 国立公文書館蔵（Public Domain）
- 「改正鮮明廣島市實測地圖」: 国際日本文化研究センター蔵
- geoawesome_2027 の図版: マーシャル諸島のスティックチャート（撮影 Wikimedia user Mattes・CC BY-SA 3.0・ミュンヘン国立民族学博物館蔵）、「京都大絵図」1696（PD）と同範囲の OSM（ODbL）、『南良名勝案内圖』1941（PD）。出典は画面に表示する
- Maplat ロゴ・Maplat100 フォント・那由多ロゴ・FOSS4G Hiroshima 2026 ロゴは
  それぞれの権利者に帰属し、オープンライセンスの対象ではない

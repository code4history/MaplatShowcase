/**
 * Maplat 紹介スライドショー: シナリオエンジン
 *
 * 仕組み:
 *   - demo/embed.html を同一オリジンの iframe で読み込み、その中の
 *     window.maplatApp（MaplatUi インスタンス）を親から直接操作する。
 *     地図操作 API は app.core（MaplatCore）側にある:
 *       setGPSMarker({lnglat, acc}) / setViewpoint({longitude, latitude, mercZoom})
 *       changeMap(mapID) / setTransparency(pct) / selectMarker(id) など
 *   - スライドは静止（一定秒表示）とライブ（シナリオ実行）の2種で、無限ループ。
 *   - 字幕は日英2段。操作キー: Space=一時停止 / →=次のスライドへスキップ
 */
"use strict";

// ---------------------------------------------------------------- utilities

const $ = sel => document.querySelector(sel);
const subtitleBox = $("#subtitle");
const subJa = $("#subtitle .sub-ja");
const subEn = $("#subtitle .sub-en");
const qrFloat = $("#app-qr");

let paused = false;
let skipRequested = false;

class SkipSlide extends Error { }

const rawSleep = ms => new Promise(r => setTimeout(r, ms));

/** 一時停止とスキップを織り込んだ待機（壁時計の締切ベース）。
 * バックグラウンドタブでは setTimeout が最低1秒へ絞られるため、
 * 反復回数ではなく Date.now() の締切で終了を判定する。 */
async function wait(ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    while (paused) await rawSleep(150);
    if (skipRequested) throw new SkipSlide();
    const remain = deadline - Date.now();
    if (remain <= 0) return;
    await rawSleep(Math.min(120, remain));
  }
}

function say(ja, en) {
  subJa.textContent = ja;
  subEn.textContent = en;
  subtitleBox.classList.add("visible");
}

function sayOff() {
  subtitleBox.classList.remove("visible");
}

document.addEventListener("keydown", e => {
  if (e.code === "Space") { paused = !paused; e.preventDefault(); }
  if (e.code === "ArrowRight") skipRequested = true;
});

// ---------------------------------------------------------- Maplat の取得

const frame = $("#maplat-frame");

/** ページが可視になってから Maplat を読み込む。
 * 非表示タブでは rAF が完全停止し、OpenLayers が 1 フレームも描けないまま
 * Maplat の初期化が壊れる（view の zoom が null のまま復帰しない）ことを実測済み。
 * 裏タブで開かれても、可視化された時点で初めて初期化が走るようにする。 */
function ensureFrameLoaded() {
  if (frame.src) return;
  if (document.visibilityState === "visible") {
    frame.src = frame.dataset.src;
    return;
  }
  document.addEventListener("visibilitychange", function onVis() {
    if (document.visibilityState === "visible" && !frame.src) {
      frame.src = frame.dataset.src;
      document.removeEventListener("visibilitychange", onVis);
    }
  });
}

/** iframe 内の Maplat インスタンスが立ち上がるのを待つ */
async function getApp(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const w = frame.contentWindow;
    if (w) {
      if (w.maplatError) throw new Error("Maplat init failed: " + w.maplatError);
      if (w.maplatApp && w.maplatApp.core) {
        const app = w.maplatApp;
        // 初期 changeMap の完了を待つ（キューが無ければ即時解決）
        try { await app.core.changeMapSeq; } catch (e) { }
        await rawSleep(1200); // タイル読み込み・view 確定の沈静化待ち
        return app;
      }
    }
    await rawSleep(250);
  }
  throw new Error("Maplat did not become ready in " + timeoutMs + "ms");
}

// ------------------------------------------------------ 地図操作ヘルパー

/** 2点間を等速補間しながら GPS マーカーを動かす（ダミー GPS 徒歩）。
 * 経過時間（壁時計）から折れ線上の現在位置を求めるので、
 * タイマーが間引かれても総所要時間と経路は保たれる。 */
async function walk(core, points, totalMs, acc = 15) {
  // 各区間長（equirectangular 近似）と累積長
  const cum = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const kx = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    cum.push(cum[i] + Math.hypot((x2 - x1) * kx, y2 - y1));
  }
  const total = cum[cum.length - 1] || 1;
  const pointAt = frac => {
    const target = total * Math.min(1, Math.max(0, frac));
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < target) i++;
    const segLen = cum[i + 1] - cum[i] || 1;
    const k = (target - cum[i]) / segLen;
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    return [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
  };
  const start = Date.now();
  for (;;) {
    const frac = (Date.now() - start) / totalMs;
    try { core.setGPSMarker({ lnglat: pointAt(frac), acc }); } catch (e) { /* 1 tick 落ちても歩行は続ける */ }
    if (frac >= 1) return;
    await wait(90);
  }
}

/** 透過度をなめらかに変える（経過時間ベース） */
async function fadeTransparency(core, from, to, totalMs) {
  const start = Date.now();
  for (;;) {
    const frac = Math.min(1, (Date.now() - start) / totalMs);
    try { core.setTransparency(Math.round(from + (to - from) * frac)); } catch (e) { }
    if (frac >= 1) return;
    await wait(90);
  }
}

/** POI 選択。namespaceID の形式差を吸収するため候補を順に試す */
function trySelectMarker(core, layerKey, poiId) {
  for (const id of [layerKey + "#" + poiId, poiId]) {
    try {
      const m = core.getMarker(id);
      if (m) { core.selectMarker(id); return true; }
    } catch (e) { /* 次の候補へ */ }
  }
  return false;
}

/** 1 つの地図操作の失敗でスライド全体を落とさないためのガード。
 * 埋め込みアプリ側には初期化タイミング依存の既知の不安定さがあるため、
 * 失敗はログして続行し、必要なら 1 回だけリトライする。 */
async function guard(label, fn, retryMs = 1000) {
  try { return await fn(); } catch (e) {
    console.warn("[demo] " + label + " failed, retrying:", e && e.message || e);
    try { await rawSleep(retryMs); return await fn(); } catch (e2) {
      console.warn("[demo] " + label + " failed twice, continuing:", e2 && e2.message || e2);
    }
  }
}

// ------------------------------------------------------------- シナリオ

// ---- 進行テンポ ----------------------------------------------------------
// 全体の再生速度倍率。1 = 設計値 / 2 = 2倍ゆっくり。
// 設計値のままでは「忙しくて読めない」ため（人間指摘 2026-08-27）。
const PACE = 2.4;
const wp = ms => wait(Math.round(ms * PACE));

const HOME = [132.451219, 34.39204];   // 広島国際会議場（アプリの homePosition）
const DOME = [132.45358, 34.39547];    // 原爆ドーム

// OSM の歩行者ネットワーク（Overpass 取得）を Dijkstra で解いた
// 会議場 → 元安橋 → 原爆ドームの徒歩経路。道路・園路の上だけを通る。
const ROUTE = [
  [132.451359, 34.391991], [132.451445, 34.392215], [132.451613, 34.392171],
  [132.452131, 34.393192], [132.452143, 34.393552], [132.452399, 34.39363],
  [132.452833, 34.393928], [132.453955, 34.394252], [132.453336, 34.395392],
  [132.45358, 34.39547]
];

// 厳島神社まわりの散策路（東回廊 → 本殿・拝殿 → 平舞台・大鳥居向き）。
// 明治図の「宮島ノ図」インセットもジオリファレンス済みなので、
// 実座標を動くだけでインセット上を歩く。
const MIYAJIMA = [132.3197, 34.2960];
const MIYAJIMA_WALK = [
  [132.32055, 34.29715],  // 入口・東回廊
  [132.31995, 34.29690],  // 客神社前
  [132.31930, 34.29654],  // 本殿・拝殿
  [132.31890, 34.29690]   // 平舞台（大鳥居を望む）
];

/** POI ポップアップを開く。namespaceID の形式差を候補で吸収する。
 * core.selectMarker はアイコン強調のみで、ダイアログを開くのは
 * UI 層の handleMarkerActionById（restore の openedMarker と同じ経路）。 */
async function openPoi(app, win, poiId) {
  const candidates = ["hiroshima#" + poiId, poiId, "foss4g2026-tourism#" + poiId];
  for (const id of candidates) {
    try {
      app.handleMarkerActionById(id);
      await rawSleep(900);
      if (win.document.querySelector(".modal.in, .modal.show")) return id;
    } catch (e) { /* 次の候補へ */ }
  }
  console.warn("[demo] openPoi: no candidate opened:", poiId);
  return null;
}

function closeModal(win) {
  const btn = win.document.querySelector(
    '.modal.in [data-dismiss="modal"], .modal.show [data-dismiss="modal"], .modal.in .close, .modal.show .close');
  if (btn) btn.click();
}

// TIN（三角網）表示。tools/build-tin-lines.py が生成した merc 座標の線分集合。
let tinData = null;
async function drawTin(core) {
  if (!tinData) tinData = await (await fetch("demo/assets/castle-tin.json")).json();
  let n = 0;
  const put = (coords, stroke) => {
    try { core.setLine({ coordinates: coords, stroke }); } catch (e) { }
  };
  for (const seg of tinData.edges) {          // 通常の三角網エッジ: 明るめの青
    put(seg, { color: "rgba(80, 165, 255, 0.85)", width: 1.6 });
    if (++n % 120 === 0) await rawSleep(30);  // 一括投入で UI を固めない
  }
  for (const chain of tinData.constraints) {  // 制約エッジ: 太い赤
    put(chain, { color: "rgba(215, 35, 35, 0.92)", width: 3 });
    if (++n % 120 === 0) await rawSleep(30);
  }
}

const SCENARIO = [
  {
    ja: "これは正保年間（1644〜48）に描かれた「安芸国広島城所絵図」。太田川の三角州に広がる城下町です。",
    en: "This is the 1640s pictorial map of Hiroshima Castle — the castle town spread across the delta of the Ota River.",
    run: async ctx => {
      await guard("viewpoint:wide", () => ctx.core.setViewpoint({ longitude: HOME[0], latitude: HOME[1], mercZoom: 15.5 }));
      await wp(5000);
    }
  },
  {
    ja: "いま、FOSS4G の会場・広島国際会議場に立っているとします。GPS の現在地が、この絵図の上に現れます。",
    en: "Suppose you are standing at the ICCH, the FOSS4G venue. Your GPS position appears on this 17th-century map.",
    run: async ctx => {
      await guard("viewpoint:home", () => ctx.core.setViewpoint({ longitude: HOME[0], latitude: HOME[1], mercZoom: 17 }));
      await wp(800);
      await guard("gps:appear", () => ctx.core.setGPSMarker({ lnglat: HOME, acc: 40 }));
      await wp(4500);
    }
  },
  {
    ja: "川を渡って、橋の向こうの原爆ドームまで歩いてみましょう。現在地は絵図の上で動きます。",
    en: "Cross the river and walk to the Atomic Bomb Dome beyond the bridge. Your position moves across the drawing.",
    run: async ctx => {
      await guard("viewpoint:walk", () => ctx.core.setViewpoint({ longitude: 132.4525, latitude: 34.3937, mercZoom: 16.2 }));
      await wp(600);
      await walk(ctx.core, ROUTE, Math.round(12000 * PACE), 25);
      await wp(1200);
    }
  },
  {
    ja: "現代の地図に切り替えます。現在地はそのまま——ここは原爆ドームのたもとです。",
    en: "Switch to the modern map. Your position stays put — at the foot of the Atomic Bomb Dome.",
    run: async ctx => {
      await guard("changeMap:gsi", () => ctx.core.changeMap("gsi"));
      await wp(1200);
      await guard("gps:dome", () => ctx.core.setGPSMarker({ lnglat: DOME, acc: 30 }));
      await wp(4000);
    }
  },
  {
    ja: "絵図に戻ります。地図と地図のあいだを、位置がそのまま行き来できるのが Maplat です。",
    en: "Back to the old map. Positions travel freely between maps — that is what Maplat does.",
    run: async ctx => {
      await guard("changeMap:castle", () => ctx.core.changeMap("aki_hiroshima_castle"));
      await wp(1200);
      await guard("gps:dome2", () => ctx.core.setGPSMarker({ lnglat: DOME, acc: 30 }));
      await wp(3500);
    }
  },
  {
    ja: "スポットの案内も絵図の上でそのまま。原爆ドームのマーカーを開いてみます。",
    en: "Points of interest live on the old map too. Let's open the marker for the Atomic Bomb Dome.",
    run: async ctx => {
      const opened = await openPoi(ctx.app, ctx.win, "atomic-bomb-dome");
      await wp(opened ? 5500 : 800);
      if (opened) { closeModal(ctx.win); await wp(600); }
    }
  },
  {
    ja: "絵図を透かすと、下の現代地図とぴったり重なっているのが分かります。",
    en: "Fade the drawing, and you can see how precisely it lies over the modern city beneath.",
    run: async ctx => {
      await fadeTransparency(ctx.core, 0, 70, Math.round(2200 * PACE));
      await wp(1800);
      await fadeTransparency(ctx.core, 70, 0, Math.round(1800 * PACE));
      await wp(700);
    }
  },
  {
    ja: "時代も渡れます。これは明治29年（1896）に広島で出版された実測図。地元の出版社・早速社の一枚です。",
    en: "You can travel between eras too. This is a survey map published in Hiroshima in 1896 by the local firm Hayami-sha.",
    run: async ctx => {
      await guard("changeMap:kaisei", () => ctx.core.changeMap("kaisei_hiroshima_jissoku"));
      await wp(1500);
      await guard("gps:kaisei", () => ctx.core.setGPSMarker({ lnglat: DOME, acc: 30 }));
      await wp(4500);
    }
  },
  {
    ja: "会場から足を延ばして、宮島を観光してみましょう。厳島神社と大鳥居の島へ、船で10分です。この絵図には宮島も描かれているので、絵図を使って現地を歩くことができます。",
    en: "Let's venture out to Miyajima — ten minutes by ferry to the island of Itsukushima Shrine and its great torii. This map depicts Miyajima too, so you can walk the island on it.",
    run: async ctx => {
      // 「宮島ノ図」インセットへ（ジオリファレンス済みなので実座標移動だけで着地）
      await guard("viewpoint:miyajima", () => ctx.core.setViewpoint({ longitude: MIYAJIMA[0], latitude: MIYAJIMA[1], mercZoom: 14.5 }));
      await wp(5000);
      // 厳島神社の海上社殿あたりをぶらぶら
      await guard("viewpoint:shrine", () => ctx.core.setViewpoint({ longitude: 132.3196, latitude: 34.2968, mercZoom: 16 }));
      await wp(800);
      await guard("gps:miyajima", () => ctx.core.setGPSMarker({ lnglat: MIYAJIMA_WALK[0], acc: 20 }));
      await wp(1200);
      await walk(ctx.core, MIYAJIMA_WALK, Math.round(16000 * PACE), 15);
      await wp(2500);
      // 帰路: 明治図のまま広島中心部へ戻す。
      // ここで地図を切り替えると宮島が絵図（正保）の範囲外のため
      // 「範囲外エラー」が出続ける（人間指摘 2026-08-27）。
      await guard("gps:clear-miyajima", () => ctx.core.setGPSMarker(null));
      await guard("viewpoint:back-home", () => ctx.core.setViewpoint({ longitude: HOME[0], latitude: HOME[1], mercZoom: 15 }));
      await wp(2000);
    }
  },
  {
    ja: "比較のために、最初に示した正保年間絵図を、Maplat の座標変換手法でメルカトルにワープしたタイルも収めてあります。ワープ方式は、位置は合いますが、絵図の美しさは歪みます。",
    en: "For comparison, the Shōhō map warped into Mercator tiles by Maplat's own transform. Warping keeps positions right — but the beauty of the drawing is deformed.",
    run: async ctx => {
      await guard("changeMap:merc", () => ctx.core.changeMap("aki_hiroshima_castle-merc"));
      await wp(1200);
      await guard("viewpoint:merc", () => ctx.core.setViewpoint({ longitude: DOME[0], latitude: DOME[1], mercZoom: 16 }));
      await wp(5500);
    }
  },
  {
    ja: "Maplat は絵図を一切歪めません。描かれたままの線の美しさが、そのまま残ります。",
    en: "Maplat itself never distorts the drawing. The beauty of the lines stays exactly as the mapmaker drew them.",
    run: async ctx => {
      await guard("changeMap:castle2", () => ctx.core.changeMap("aki_hiroshima_castle"));
      await wp(1200);
      await guard("viewpoint:beauty", () => ctx.core.setViewpoint({ longitude: DOME[0], latitude: DOME[1], mercZoom: 16.5 }));
      await wp(3500);
    }
  },
  {
    ja: "種明かしがこの三角網。赤い太線が道路などに沿わせた制約エッジ、青い細線が三角分割です。この区分線形の同相変換により、Thin Plate Spline のように点の間で歪むことなく、道筋まで一致します。",
    en: "Here is the trick: the triangulated network. Thick red lines are constraint edges along roads; thin blue lines are the triangulation. This piecewise-linear homeomorphism never bends between points the way thin plate splines do — whole streets stay aligned, warped or not.",
    run: async ctx => {
      await guard("viewpoint:tin", () => ctx.core.setViewpoint({ longitude: HOME[0], latitude: HOME[1], mercZoom: 15 }));
      await wp(600);
      await drawTin(ctx.core);
      await wp(10000);
      try { ctx.core.resetLine(); } catch (e) { }
      await wp(500);
    }
  }
];

/** ループ再突入時に地図の状態を初期に戻す */
async function resetDemo(core) {
  try { closeModal(frame.contentWindow); } catch (e) { }
  try { core.resetLine(); } catch (e) { }
  try { core.unselectMarker(); } catch (e) { }
  try { core.setTransparency(0); } catch (e) { }
  try { core.setGPSMarker(null); } catch (e) { }
  // すでに初期地図ならば changeMap は呼ばない
  // （同一地図への changeMap も全変換パスを通るため、初期化直後は不安定要因になる）
  const currentID = core.from && core.from.mapID;
  if (currentID && currentID !== "aki_hiroshima_castle") {
    await guard("reset:changeMap", () => core.changeMap("aki_hiroshima_castle"));
    await rawSleep(800);
  }
  await guard("reset:viewpoint", () => core.setViewpoint({ longitude: HOME[0], latitude: HOME[1], mercZoom: 17 }));
}

// ------------------------------------------------------------ スライド定義

const SLIDES = [
  { type: "static", el: "#slide-title", ms: Math.round(7000 * PACE) },
  { type: "live", el: "#slide-live" },
  { type: "static", el: "#slide-outro", ms: Math.round(8000 * PACE) }
];

function showSlide(idx) {
  document.querySelectorAll(".slide").forEach(el => el.classList.remove("active"));
  $(SLIDES[idx].el).classList.add("active");
  document.querySelectorAll("#dots span").forEach((d, i) => d.classList.toggle("on", i === idx));
  // アプリ QR はライブデモ中だけ出す（静止スライドは自前の QR / ロゴを持っている）。
  // qrFloat の存在確認は、会場での差し替え時に HTML と JS のキャッシュ世代がずれても
  // デモ本体が止まらないようにするための防壁（設計 §5 の逸脱理由）。
  if (qrFloat) qrFloat.classList.toggle("visible", SLIDES[idx].type === "live");
}

async function runSlide(idx) {
  const slide = SLIDES[idx];
  console.log("[demo]", Date.now() % 1000000, "slide", idx, slide.el);
  showSlide(idx);
  if (slide.type === "static") {
    sayOff();
    await wait(slide.ms);
    return;
  }
  // ライブデモ
  const loading = $(".slide.live .loading");
  let app;
  try {
    app = await getApp();
  } catch (e) {
    console.error(e);
    loading.querySelector(".loading-text").textContent = "Maplat の起動に失敗しました / Failed to start Maplat";
    await wait(8000);
    return;
  }
  console.log("[demo]", Date.now() % 1000000, "app ready");
  loading.classList.add("hidden");
  const ctx = { app, core: app.core, win: frame.contentWindow };
  if (runSlide.visited) {
    await resetDemo(ctx.core);   // 2 周目以降のみ初期状態へ戻す
  }
  runSlide.visited = true;
  for (let si = 0; si < SCENARIO.length; si++) {
    const step = SCENARIO[si];
    console.log("[demo]", Date.now() % 1000000, "step", si, step.ja.slice(0, 12));
    say(step.ja, step.en);
    await step.run(ctx);
  }
  sayOff();
  await wait(800);
}

/** 画面スリープ抑止（Screen Wake Lock API）。
 * キオスク上映中にディスプレイが消灯しないようにする。HTTPS + 可視タブでのみ有効で、
 * タブが不可視になるとOSに解放されるため、可視化のたびに取り直す。
 * 非対応ブラウザ（古いSafari等）では静かに何もしない——その場合はOS側の
 * スリープ設定（caffeinate / 電源設定）だけが頼りになる。 */
async function keepAwake() {
  if (!("wakeLock" in navigator)) return;
  const acquire = async () => {
    try {
      await navigator.wakeLock.request("screen");
      console.log("[demo] wake lock acquired");
    } catch (e) {
      console.warn("[demo] wake lock failed:", e && e.message || e);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") acquire();
  });
  await acquire();
}

async function main() {
  ensureFrameLoaded();
  keepAwake();
  // 進行ドットを生成
  const dots = $("#dots");
  SLIDES.forEach(() => dots.appendChild(document.createElement("span")));

  for (let i = 0; ; i = (i + 1) % SLIDES.length) {
    skipRequested = false;
    try {
      await runSlide(i);
    } catch (e) {
      if (!(e instanceof SkipSlide)) console.error(e);
      sayOff();
    }
  }
}

main();

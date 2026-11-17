/**
 * 収録面（#stage・1200×800 固定）を**狭い画面に収める**（v3.5・2026-11-17。MaplatShowcase の
 * `arida_2026/` で来場者が手元のスマホで開くため）。
 *
 *   k = min(1, 画面幅 / 1200, 画面高 / 800)
 *
 * - `k < 1` のときだけ `transform: translate(tx, ty) scale(k)`（`transform-origin: 0 0`）で縮め、画面の中央に置く
 * - `k = 1`（1200×800 以上の画面）では transform を付けない ∴ 収録（Playwright 1200×800）は変わらない
 * - 縮めても**レイアウト上の寸法は 1200×800 のまま**。画面座標（`clientX` / `getBoundingClientRect`）を
 *   収録面座標へ直すときは `toStage()` / `layoutRect()` を使う（k で割る）
 * - `--k`（数値）と `--tap`（タッチで押せるボタンの高さ。収録面の px）を #stage に出す
 */

/** 画面の大きさから縮尺を出す（純関数・テスト用） */
export function stageScaleFor(vw, vh, w = 1200, h = 800) {
  if (!(vw > 0) || !(vh > 0)) return 1;
  return Math.min(1, vw / w, vh / h);
}

/** いまの縮尺（描画上の幅 ÷ レイアウト上の幅）。transform が無ければ 1 */
export function stageScale(stage) {
  if (!stage) return 1;
  const w = stage.offsetWidth;
  const r = stage.getBoundingClientRect();
  return w > 0 && r.width > 0 ? r.width / w : 1;
}

/** 画面座標（clientX, clientY）→ 収録面（#stage 左上原点・レイアウト上の CSS px） */
export function toStage(stage, clientX, clientY) {
  const r = stage.getBoundingClientRect();
  const k = stageScale(stage);
  return [(clientX - r.left) / k, (clientY - r.top) / k];
}

/** 要素の収録面上の矩形（レイアウト上の CSS px）。縮めていても 1200×800 の座標で返す */
export function layoutRect(el, stage) {
  const r = el.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const k = stageScale(stage);
  return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
}

/** 要素のレイアウト上の大きさ（transform の影響を受けない）。canvas のビットマップ寸法を決めるのに使う */
export function layoutSize(el) {
  const w = el.clientWidth || el.offsetWidth || 0;
  const h = el.clientHeight || el.offsetHeight || 0;
  return { w, h };
}

/** #stage を画面に収める。resize・向きの変更に追随する */
export function fitStage(stage = document.getElementById('stage')) {
  if (!stage) return () => 1;
  const W = 1200;
  const H = 800;
  function apply() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const k = stageScaleFor(vw, vh, W, H);
    stage.style.setProperty('--k', String(k));
    // タッチで押せるボタンの高さ（収録面の px）。画面上で 36px に近づける。地図を覆いすぎないよう 72px で止める
    stage.style.setProperty('--tap', `${Math.min(72, Math.max(36, 36 / k))}px`);
    if (k < 1) {
      const tx = Math.max(0, (vw - W * k) / 2);
      const ty = Math.max(0, (vh - H * k) / 2);
      stage.style.transformOrigin = '0 0';
      stage.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    } else {
      stage.style.transform = '';
      stage.style.transformOrigin = '';
    }
    window.__stageScale = k;
    return k;
  }
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  return apply;
}

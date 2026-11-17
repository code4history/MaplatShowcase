/**
 * 確認ページのボタンが寄る点（収録シナリオと同じ点）。DOM を使わない ∴ node のテストから読める。
 *
 * DEMO-A: `slides/scripts/record/record-demo-a.mjs` の `pickDemoPoint()` が選ぶ点（絵図ピクセル）。
 * strict で往復誤差がほぼ 0、loose（`kaisei_hiroshima_jissoku.pairswap-loose`）で 100〜400 px ずれる点のうち、
 * 画像中央に最も近いもの。`demo-points.test.mjs` が収録側の計算と一致することを確かめる。
 */
export const DEMO_A_POINT = Object.freeze([3700, 2000]);

/** DEMO-A の題材（strict の元データと、対応点 1 組を入れ替えた loose の派生） */
export const DEMO_A_DATA = Object.freeze({
  strict: 'kaisei_hiroshima_jissoku',
  loose: 'kaisei_hiroshima_jissoku.pairswap-loose',
});

/**
 * DEMO-D の開始位置: 絵図の `points[181]` から**絵図ピクセルで +600, +400**・ホイール 1 段（1.15 倍）寄せた位置。
 * v2.9 までは「収録が絵図側を動かす量」だったが、v3.0（2026-11-08）で筋書きを「絵図を回して拡大する」に
 * 作り直したので、ここは**開始位置**になった（5 点方式の実残差がこの位置で小さい＝開始時に印が重なる。
 * `vp5.test.mjs` の「移動後」と同じ位置）。`record-demo-d.mjs` の `START_SHIFT` と同じ値（テストで一致を確かめる）。
 */
export const DEMO_D_START_SHIFT = Object.freeze({ deltaImage: Object.freeze([600, 400]), wheelSteps: 1 });

/**
 * DEMO-D の筋書き（v3.0・引き継ぎ書 2026-11-08 §1）。**字幕（`cues/demo-d.json`）の 1 行 ＝ ここの 1 段**。
 * 確認ページの「収録と同じ移動」（`playScript()`）と収録（`record-demo-d.mjs`）が同じ表を読む。
 *
 *   mode       … この段で押されている方式（帯の字幕と方式ボタンの押下状態を照合する）
 *   rotateDeg  … 絵図を回す角度（度。正＝右回り＝時計回り）
 *   zoomFactor … 絵図の倍率（2 ＝ 2 倍に拡大、0.5 ＝ 半分に縮小）
 *   ms         … 確認ページで回す・拡大する動きの長さ（ミリ秒）
 *   holdMs     … 確認ページで次の段へ移るまでの間（動きの後。全体 40 秒以内）
 */
export const DEMO_D_SCRIPT = Object.freeze([
  Object.freeze({ id: 'start', mode: 'one', rotateDeg: 0, zoomFactor: 1, ms: 0, holdMs: 4000 }),
  Object.freeze({ id: 'rotate1', mode: 'one', rotateDeg: 60, zoomFactor: 1, ms: 3000, holdMs: 3000 }),
  Object.freeze({ id: 'zoom1', mode: 'one', rotateDeg: 0, zoomFactor: 2, ms: 2500, holdMs: 2500 }),
  Object.freeze({ id: 'five', mode: 'five', rotateDeg: 0, zoomFactor: 1, ms: 0, holdMs: 5000 }),
  Object.freeze({ id: 'turn5', mode: 'five', rotateDeg: -90, zoomFactor: 0.5, ms: 9000, holdMs: 3000 }),
  Object.freeze({ id: 'back1', mode: 'one', rotateDeg: 0, zoomFactor: 1, ms: 0, holdMs: 6000 }),
]);

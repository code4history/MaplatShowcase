/**
 * 収録面に見えるカーソル（デモ v2・人間指摘 F-7「操作が画面に見えない」への対応）。
 *
 * Playwright の実カーソルは動画に映らない ∴ **document の pointer イベントに追随する
 * 大きめのカーソルを DOM で描く**。`page.mouse.move/down/up` がそのまま見える。
 *
 *   import { installCursor } from './lib/cursor.mjs';
 *   const cursor = installCursor(document.getElementById('stage'));
 *   cursor.label('クリック');     // カーソル脇の短い札（空で消す）
 *   cursor.state()              // { x, y, down, visible }
 *
 * - 移動: pointermove（capture）で追随。クリック: pointerdown で波紋、ドラッグ中は軌跡を描く。
 * - すべて `pointer-events: none` で地図の操作を奪わない。
 * - 収録前は非表示（最初の pointermove で現れる）∴ 画に不要なカーソルが残らない。
 * - **人が手で触るとき（自動操作でないブラウザ）は描かない**。実カーソルがそのまま見えるので、
 *   大きな輪が十字や点を隠さないようにする。判定は `navigator.webdriver`（Playwright では true）。
 * - **色は白と墨**（赤・橙を使わない）。DEMO-A の再変換点（赤丸）や矢印（橙）と見分けがつくように（2026-11-01）。
 *   `?cursor=1` で手動でも描く・`?cursor=0` で自動操作でも描かない（確認用のスクリーンショット）。
 *   描かないときも `window.__cursor` の API は同じ形で置く（収録のフック検査を壊さない）。
 */

import { toStage } from './stage-fit.mjs';

/** 収録用カーソルを描くか。`?cursor=0|1` が最優先、無ければ自動操作のときだけ描く */
export function cursorWanted(search = globalThis.location?.search ?? '', webdriver = globalThis.navigator?.webdriver) {
  const flag = new URLSearchParams(search).get('cursor');
  if (flag === '0') return false;
  if (flag === '1') return true;
  return webdriver === true;
}

const CSS = `
.demo-cursor-layer { position: absolute; inset: 0; pointer-events: none; z-index: 40; overflow: hidden; }
.demo-cursor-layer canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.demo-cursor { position: absolute; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px;
  transform: translate(0, 0); transition: transform 0.06s linear; will-change: transform; opacity: 0; }
.demo-cursor.visible { opacity: 1; }
.demo-cursor .ring { position: absolute; inset: 0; border-radius: 50%; border: 4px solid #ffffff;
  background: rgba(20, 24, 34, 0.16); box-shadow: 0 0 0 2px rgba(20,24,34,0.85), inset 0 0 0 2px rgba(20,24,34,0.85), 0 2px 10px rgba(0,0,0,0.45); }
.demo-cursor .dot { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px;
  border-radius: 50%; background: #ffffff; box-shadow: 0 0 0 2px rgba(20,24,34,0.9); }
.demo-cursor.down .ring { background: rgba(20, 24, 34, 0.38); transform: scale(0.85); }
.demo-cursor .label { position: absolute; left: 50px; top: 8px; white-space: nowrap; padding: 4px 10px;
  border-radius: 8px; background: rgba(20, 24, 34, 0.86); color: #fff; font-size: 22px; font-weight: 700;
  font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
.demo-cursor .label:empty { display: none; }
.demo-ripple { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%;
  border: 4px solid #ffffff; box-shadow: 0 0 0 2px rgba(20,24,34,0.7); opacity: 0.9; animation: demo-ripple 0.7s ease-out forwards; }
@keyframes demo-ripple { from { transform: scale(0.6); opacity: 0.9; } to { transform: scale(5); opacity: 0; } }
`;

/**
 * @param {HTMLElement} stage 収録面（position: relative の要素）
 * @param {{ trail?: boolean }} [options]
 */
export function installCursor(stage, { trail = true } = {}) {
  if (!stage) throw new TypeError('installCursor には stage 要素を渡す');
  if (window.__cursor) return window.__cursor; // 二重に置かない
  if (!cursorWanted()) {
    const state = { x: 0, y: 0, down: false, visible: false };
    const local = (e) => toStage(stage, e.clientX, e.clientY); // v3.5: 縮尺 k で割る
    document.addEventListener('pointermove', (e) => { [state.x, state.y] = local(e); }, true);
    const quiet = {
      label() {}, hide() {}, show() {},
      moveTo(x, y) { state.x = x; state.y = y; },
      state() { return { ...state }; },
      manual: true,
    };
    window.__cursor = quiet;
    return quiet;
  }
  if (!document.getElementById('demo-cursor-css')) {
    const style = document.createElement('style');
    style.id = 'demo-cursor-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const layer = document.createElement('div');
  layer.className = 'demo-cursor-layer';
  const canvas = document.createElement('canvas');
  layer.appendChild(canvas);
  const el = document.createElement('div');
  el.className = 'demo-cursor';
  el.innerHTML = '<div class="ring"></div><div class="dot"></div><div class="label"></div>';
  layer.appendChild(el);
  stage.appendChild(layer);
  const labelEl = el.querySelector('.label');

  const state = { x: 0, y: 0, down: false, visible: false, trail: [] };
  const rect = () => stage.getBoundingClientRect();

  function resize() {
    // v3.5: 軌跡の canvas は #stage の中（レイアウト寸法）。縮尺 k で縮んだ見かけの寸法は使わない
    canvas.width = Math.max(1, Math.round(stage.offsetWidth || rect().width));
    canvas.height = Math.max(1, Math.round(stage.offsetHeight || rect().height));
  }
  resize();
  window.addEventListener('resize', resize);

  function drawTrail() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!trail || state.trail.length < 2) return;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(state.trail[0][0], state.trail[0][1]);
    for (let i = 1; i < state.trail.length; i += 1) ctx.lineTo(state.trail[i][0], state.trail[i][1]);
    ctx.stroke();
  }

  function moveTo(x, y) {
    state.x = x; state.y = y;
    el.style.transform = `translate(${x}px, ${y}px)`;
    if (!state.visible) { state.visible = true; el.classList.add('visible'); }
    if (state.down && trail) { state.trail.push([x, y]); drawTrail(); }
  }
  function ripple(x, y) {
    const r = document.createElement('div');
    r.className = 'demo-ripple';
    r.style.left = `${x}px`; r.style.top = `${y}px`;
    layer.appendChild(r);
    setTimeout(() => r.remove(), 800);
  }
  function local(event) {
    return toStage(stage, event.clientX, event.clientY); // v3.5: 縮尺 k で割る
  }
  document.addEventListener('pointermove', (e) => { const [x, y] = local(e); moveTo(x, y); }, true);
  document.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    state.down = true; el.classList.add('down');
    state.trail = [[x, y]];
    moveTo(x, y);
    ripple(x, y);
  }, true);
  const up = (e) => {
    if (!state.down) return;
    state.down = false; el.classList.remove('down');
    if (e && typeof e.clientX === 'number') { const [x, y] = local(e); moveTo(x, y); }
    // 軌跡は 1.2 秒残してから消す（ドラッグの道筋が読めるように）
    setTimeout(() => { state.trail = []; drawTrail(); }, 1200);
  };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);

  const api = {
    label(text) { labelEl.textContent = text ?? ''; },
    hide() { state.visible = false; el.classList.remove('visible'); },
    show() { state.visible = true; el.classList.add('visible'); },
    /** 収録スクリプトから直接動かすとき（pointer イベントを経由しない場合） */
    moveTo,
    state() { return { x: state.x, y: state.y, down: state.down, visible: state.visible }; },
  };
  window.__cursor = api;
  return api;
}

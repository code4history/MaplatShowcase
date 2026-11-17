/**
 * 2 面（左: 古地図 / 右: 現代地図）の共通土台（デモ v2・2026-10-24）。
 * demo-a.mjs の boot() から MapView 2 面と同期の部分を切り出したもの。
 *
 *   const tp = await createTwoPane({ dataName: 'naramachi_yasui_bunko', stage, leftCanvas, rightCanvas });
 *   tp.left / tp.right（MapView）、tp.mt（MapTransform）、tp.data、tp.redraw()、tp.centerOn(imageXy)
 *   tp.screenOfImage(imageXy) → 収録面座標、tp.screenOfMerc(merc) → 収録面座標
 */
import { loadCompiled } from './data.mjs';
import { MapView, lonLatToMercator, titleText } from './mapview.mjs';
import {
  SYNC_HIST_TO_MODERN, SYNC_MODERN_TO_HIST, syncViewpoint, imagePixelToViewpointCenter,
} from './sync.mjs';
import { MapTransform } from '../vendor/maplat_transform.js';
import { layoutRect, layoutSize } from './stage-fit.mjs';

export const MODERN_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
export const MODERN_ATTRIBUTION = '地理院タイル';
const MODERN_PROVISIONAL = Object.freeze({ lonLat: [135.83, 34.68], zoom: 13 });

export function fitCanvas(canvas) {
  // v3.5: getBoundingClientRect は #stage の縮尺 k（スマホ）で縮んだ寸法を返す ∴ レイアウト上の寸法を使う
  const rect = layoutSize(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round((rect.w || canvas.width || 600) * dpr));
  const height = Math.max(1, Math.round((rect.h || canvas.height || 800) * dpr));
  canvas.width = width;
  canvas.height = height;
  return { width, height, dpr };
}

export function histTileUrl(data) {
  if (typeof data.raw?.url === 'string' && data.raw.url.includes('{z}')) return data.raw.url;
  return `https://t.tilemap.jp/maplat/tiles/${data.tileSlug}/{z}/{x}/{y}.jpg`;
}

export function histAttribution(data) {
  return titleText(data.raw?.attr) || titleText(data.title) || '古地図';
}

export function createTransform(compiled) {
  const mt = new MapTransform();
  mt.setMapData({ compiled });
  return mt;
}

/** 収録面（#stage）左上原点の CSS px へ、canvas ビットマップ座標を直す */
function toStage(canvas, stage, px) {
  // v3.5: 縮尺 k（スマホ）で縮めていても収録面のレイアウト座標で返す
  const r = layoutRect(canvas, stage);
  return [r.x + px[0] * (r.w / canvas.width), r.y + px[1] * (r.h / canvas.height)];
}

/**
 * @param {{dataName:string, stage:HTMLElement, leftCanvas:HTMLCanvasElement, rightCanvas:HTMLCanvasElement,
 *          syncLeftToRight?: boolean, syncRightToLeft?: boolean, rotatable?: boolean}} o
 *   rotatable … 既定 true。false で両面とも Shift＋ドラッグの回転を切る（DEMO-B）
 */
export async function createTwoPane({
  dataName, stage, leftCanvas, rightCanvas, syncLeftToRight = true, syncRightToLeft = true, rotatable = true,
}) {
  const data = await loadCompiled(dataName);
  const leftSize = fitCanvas(leftCanvas);
  const rightSize = fitCanvas(rightCanvas);
  const mt = createTransform(data.compiled);

  const left = new MapView(leftCanvas, {
    kind: 'hist',
    tileUrl: histTileUrl(data),
    width: data.width,
    height: data.height,
    attribution: histAttribution(data),
    title: data.title,
    dpr: leftSize.dpr,
    rotatable,
  });
  const right = new MapView(rightCanvas, {
    kind: 'modern',
    tileUrl: MODERN_TILE_URL,
    attribution: MODERN_ATTRIBUTION,
    viewpoint: { center: lonLatToMercator(MODERN_PROVISIONAL.lonLat), zoom: MODERN_PROVISIONAL.zoom, rotation: 0 },
    dpr: rightSize.dpr,
    rotatable,
  });

  const size = () => [Math.min(left.canvas.width, right.canvas.width), Math.min(left.canvas.height, right.canvas.height)];
  let syncing = false;
  function syncFrom(from, to, direction) {
    if (syncing) return;
    syncing = true;
    try {
      to.setViewpoint(syncViewpoint(mt, from.getViewpoint(), size(), direction), { silent: true });
    } catch (error) {
      console.warn(`twopane: 同期できない（${direction}）`, error);
    } finally {
      syncing = false;
    }
  }
  try { right.setViewpoint(syncViewpoint(mt, left.getViewpoint(), size(), SYNC_HIST_TO_MODERN), { silent: true }); } catch { /* 仮位置のまま */ }
  if (syncLeftToRight) left.on('change', () => syncFrom(left, right, SYNC_HIST_TO_MODERN));
  if (syncRightToLeft) right.on('change', () => syncFrom(right, left, SYNC_MODERN_TO_HIST));

  const api = {
    data, mt, left, right, stage, size,
    redraw() { left.draw(); right.draw(); },
    syncLeftToRight() { syncFrom(left, right, SYNC_HIST_TO_MODERN); },
    centerOn(imageXy) {
      const vp = left.getViewpoint();
      left.setViewpoint({ ...vp, center: imagePixelToViewpointCenter(mt, imageXy) });
      syncFrom(left, right, SYNC_HIST_TO_MODERN);
      api.redraw();
    },
    zoomLeft(factor) {
      const vp = left.getViewpoint();
      left.setViewpoint({ ...vp, zoom: vp.zoom + Math.log2(factor) });
      syncFrom(left, right, SYNC_HIST_TO_MODERN);
      api.redraw();
    },
    screenOfImage(imageXy) {
      try { return toStage(leftCanvas, stage, left.imageToScreen(imageXy)); } catch { return null; }
    },
    screenOfMerc(merc) {
      try { return toStage(rightCanvas, stage, right.mapToPixel(merc)); } catch { return null; }
    },
    /** 収録面座標 → 左面の絵図ピクセル */
    imageAtStage(xy) {
      const r = layoutRect(leftCanvas, stage); // v3.5: 収録面のレイアウト座標（k で割った値）
      const px = [(xy[0] - r.x) * (leftCanvas.width / r.w), (xy[1] - r.y) * (leftCanvas.height / r.h)];
      return left.screenToImage(px);
    },
    drawnTiles() { return { left: left.drawnTiles, right: right.drawnTiles }; },
    sourceText() { return `出典: ${histAttribution(data)} ／ ${MODERN_ATTRIBUTION}`; },
  };
  return api;
}

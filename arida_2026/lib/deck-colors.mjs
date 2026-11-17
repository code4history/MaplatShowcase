/**
 * 講演資料（`slides/src/theme.mjs` の `COLOR`）と同じ色。デモの印・線・凡例を資料の図
 * （#10 `imageBoundsView`・#12 `constrainedEdges`・#14 `fivePointView`）に揃えるために使う。
 * 値は `#` 付きの CSS 色。`deck-colors.test.mjs` が theme.mjs と一致することを確かめる。
 */
export const DECK_COLOR = Object.freeze({
  ink: '#312D2A',
  inkMuted: '#898989',
  paper: '#FFFFFF',
  indigo: '#6C7BDA',
  orange: '#F29111',
  amber: '#F9B22B',
  red: '#CC0404',
  blue: '#4087C8',
  // v2.8（visual 2・3・9・16）で theme.mjs に足した色。デモ B の 3 域・制約辺・5 点の「左」
  orangeText: '#C46A00',
  grayText: '#5E5E5E',
  green: '#1B7A3D',
  blueDeep: '#1565C0',
  brown: '#5D4037',
  purple: '#7B4FBF',
  teal: '#0097A7', // v2.9（visual 16 の残り）: 5 点の「下」
});

/** `#RRGGBB` に不透明度を付けた `rgba()` */
export function withAlpha(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 2 色を等分に混ぜた `#RRGGBB`（DEMO-A の「行きと帰りが重なる」両方向矢印の色） */
export function mixHex(a, b) {
  const x = Number.parseInt(a.slice(1), 16);
  const y = Number.parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round((((x >> shift) & 255) + ((y >> shift) & 255)) / 2);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * #14 `fivePointView` の 5 点の色（中心・上・右・下・左）。資料の `FIVE_POINT_MARKS` と同じ並び。
 * 左右の面で同じ色を使い、対応を読ませる。
 */
export const FIVE_POINT_COLORS = Object.freeze([
  DECK_COLOR.ink, DECK_COLOR.orange, DECK_COLOR.blue, DECK_COLOR.teal, DECK_COLOR.purple,
]);

/**
 * デモ②の右上の帯（`demo-b.html` の `#band`）の文言。**ページ（`demo-b.mjs` の setBand）と収録の harness
 * （`slides/scripts/record/record-demo-b.mjs` の帯ゲート）が同じ定数を見る**（v2.9 N1）。
 * 帯の DOM がサンプル時刻ごとに域（inside → extrap → outside）と一致しているかを、harness が文字で確かめる。
 */
export const BAND_TEXT = Object.freeze({
  inside: Object.freeze({ title: '対応点の凸包の内側', sub: '対応点から張った三角網で変換中' }),
  extrap: Object.freeze({ title: '凸包の外・画像の四辺形の内', sub: '画像の縁の四隅を予測して対応点に加えた三角網で変換中' }),
  outside: Object.freeze({ title: '画像の四辺形の外', sub: '四隅から伸びる無限大の三角形で外挿中' }),
});

/** 帯の文字（textContent）から域を逆引きする。どれにも合わなければ null */
export function zoneOfBandText(text) {
  const t = String(text ?? '');
  // 「画像の四辺形の外」は「凸包の外・画像の四辺形の内」と頭が違う ∴ 前方一致で一意に決まる
  for (const [zone, { title }] of Object.entries(BAND_TEXT)) if (t.startsWith(title)) return zone;
  return null;
}

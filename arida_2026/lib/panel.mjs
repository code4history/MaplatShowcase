/**
 * 数値パネル — canvas の上に重ねる**固定位置の `<div>`**（計画 §3・m3 T3c）。
 *
 *   import { Panel } from './lib/panel.mjs';
 *   const panel = new Panel(stage, { corner: 'tl', title: 'DEMO-A 往復' });
 *   panel.badge(mt.strict_status);            // strict / loose / error（実値 strict_error を受ける）
 *   panel.value('往復誤差', 0, 'px', 2);       // → 「往復誤差 0.00 px」
 *   panel.coords('絵図 (px)', [3210.5, 4120.25]);
 *
 * **設計書 §9.1 D-6 への対応**: 1200×800 の収録面を Zoom 共有で縮小しても読めるよう、
 * 数値（`.aero-panel__num`）は **36px**、ラベル・注記は **24px 以上** に固定する（v2.8 で 28・20 から上げた）
 * （`PANEL_FONT`。CSS はこの定数から組み立てる ∴ 数値と見た目がずれない）。
 * 背景は半透明の白・角丸・薄い影。**`pointer-events: none`** なので、パネルの上を
 * なぞっても地図のドラッグ／ホイールを奪わない。
 *
 * **テストとの関係**: DOM が要る部分（`Panel`）と、要らない整形（`formatNumber` など）を
 * 分けてある。`panel.test.mjs` は後者と `PANEL_CSS` の文字サイズ下限だけを `node --test` で見る
 * （ブラウザを起動しない・ポートを開かない = 計画 §4.1 の dsh の分担）。
 *
 * **数値を偽らない**（要件書 §3）: 数値が無い（`null`/`NaN`/非数）ときは `—` を出し、
 * 0 を代わりに置かない。バッジの未知の状態は `error`（＝安全側）に倒す。
 */

/**
 * 文字サイズ（px）。1200×800 の収録面で Zoom 共有の縮小に耐える下限（設計書 §9.1 D-6）。
 * v2.8（見た目のレビュー visual 1）: 動画はスライドの上で約 0.7 倍に映る ∴ 数値 28 → 36px・ラベル 20 → 24px に上げた。
 */
export const PANEL_FONT = Object.freeze({ numberPx: 36, labelPx: 24, badgePx: 28 });

/** 数値が無いときの表示。**0 で埋めない**（要件書 §3「数値を偽らない」） */
export const NULL_TEXT = '—';

/** パネルを置ける隅。`corner` はこの 4 つだけ */
export const PANEL_CORNERS = Object.freeze(['tl', 'tr', 'bl', 'br']);

/** 隅 → 位置（収録面の端から 16px）。`inset` を使わないのは古い Chromium でも確実に効かせるため */
const CORNER_STYLES = Object.freeze({
  tl: Object.freeze({ top: '16px', left: '16px' }),
  tr: Object.freeze({ top: '16px', right: '16px' }),
  bl: Object.freeze({ bottom: '16px', left: '16px' }),
  br: Object.freeze({ bottom: '16px', right: '16px' }),
});

/** 棒グラフの塗り色。意味は呼び出し側が `tone` で選ぶ（既定は info） */
const FILL = Object.freeze({
  info: '#2f6fdd',
  ok: '#1b7a3d',
  warn: '#d99a00',
  danger: '#c0392b',
});

/** バッジのトーン → CSS クラス */
const BADGE_CLASS = Object.freeze({
  ok: 'aero-panel__badge--ok',
  warn: 'aero-panel__badge--warn',
  danger: 'aero-panel__badge--danger',
});

/**
 * パネルの CSS。**文字サイズは `PANEL_FONT` から差し込む**（手で 28 と書かない）。
 * 1 ルール 1 行にしてあるのは `panel.test.mjs` が正規表現で px を読み取るため。
 */
export const PANEL_CSS = `
.aero-panel { position: absolute; box-sizing: border-box; z-index: 20; padding: 14px 18px; border-radius: 16px; background: rgba(255, 255, 255, 0.86); border: 1px solid rgba(255, 255, 255, 0.9); box-shadow: 0 2px 12px rgba(10, 20, 40, 0.22); color: #10151c; font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", system-ui, -apple-system, sans-serif; font-variant-numeric: tabular-nums; line-height: 1.3; text-align: left; pointer-events: none; -webkit-user-select: none; user-select: none; }
.aero-panel__head { margin: 0 0 8px; font-size: ${PANEL_FONT.labelPx}px; font-weight: 700; letter-spacing: 0.04em; color: #3c4652; }
.aero-panel__row { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 16px; }
.aero-panel__row + .aero-panel__row { margin-top: 4px; }
.aero-panel__label { font-size: ${PANEL_FONT.labelPx}px; color: #46505c; white-space: nowrap; }
.aero-panel__num { font-size: ${PANEL_FONT.numberPx}px; font-weight: 700; white-space: nowrap; }
.aero-panel__badge { display: inline-block; padding: 1px 14px; border-radius: 999px; font-size: ${PANEL_FONT.badgePx}px; font-weight: 700; letter-spacing: 0.02em; }
.aero-panel__badge--ok { background: #1b7a3d; color: #ffffff; }
.aero-panel__badge--warn { background: #C46A00; color: #ffffff; }
.aero-panel__badge--danger { background: #b3261e; color: #ffffff; }
.aero-panel__note { margin-top: 6px; font-size: ${PANEL_FONT.labelPx}px; color: #5b6672; }
.aero-panel__note--danger { color: #a32118; font-weight: 700; }
.aero-panel__note--warn { color: #7a5b00; font-weight: 700; }
.aero-panel__stack { margin-top: 4px; }
.aero-panel__bars { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px 12px; margin-top: 6px; }
.aero-panel__bar { display: contents; }
.aero-panel__track { height: 16px; border-radius: 8px; background: rgba(20, 30, 45, 0.12); overflow: hidden; }
.aero-panel__fill { height: 100%; border-radius: 8px; }
`;

// ---------------------------------------------------------------------------
// 整形（DOM 不要・`panel.test.mjs` の検査対象）
// ---------------------------------------------------------------------------

/** 小数桁を 0〜6 の整数へ丸める。非数は既定 2 */
function clampDigits(digits) {
  const n = Number(digits);
  if (!Number.isFinite(n)) return 2;
  return Math.min(6, Math.max(0, Math.trunc(n)));
}

/** 整数部に 3 桁区切りを入れる（`'1234.56'` → `'1,234.56'`） */
function groupInteger(text) {
  const [int, frac] = text.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

/**
 * 数値を文字列にする（**数値の丸めの唯一の入口**）。
 *
 * - `digits` は 0〜6（範囲外は丸める。非数は 2）
 * - `-0.00` を出さない（丸めた結果が 0 なら符号を落とす）
 * - `signed: true` で正の値に `+` を付ける（Δzoom / Δrot 用）。0 には付けない
 * - `group: true` で 3 桁区切り（座標用）
 * - 数値でない（`null`/`undefined`/`NaN`/`Infinity`/文字列）は `NULL_TEXT`（`—`）
 *
 * @param {unknown} num
 * @param {number} [digits=2]
 * @param {{ signed?: boolean, group?: boolean }} [options]
 * @returns {string}
 */
export function formatNumber(num, digits = 2, { signed = false, group = false } = {}) {
  const d = clampDigits(digits);
  if (typeof num !== 'number' || !Number.isFinite(num)) return NULL_TEXT;
  // 符号は「丸める前の値」から決めず、丸めた絶対値で判定する（-0.001 → 0.00）
  const absText = Math.abs(num).toFixed(d);
  const text = group ? groupInteger(absText) : absText;
  if (Number(absText) === 0) return text; // -0.00 を出さない
  if (num < 0) return `-${text}`;
  if (signed) return `+${text}`;
  return text;
}

/**
 * 「数値＋単位」。記号単位（`°` `%` `倍` など）は詰め、英字で始まる単位
 * （`px` `m` `mm`）は空白を 1 つ入れる（`往復誤差 0.00 px`・`Δrot -3.4°`）。
 * 数値が無いときは単位を付けない（`—` だけ）。
 *
 * @param {unknown} num
 * @param {string} [unit='']
 * @param {number} [digits=2]
 * @param {{ signed?: boolean, group?: boolean }} [options]
 * @returns {string}
 */
export function formatQuantity(num, unit = '', digits = 2, options = {}) {
  const text = formatNumber(num, digits, options);
  if (text === NULL_TEXT) return text;
  const u = typeof unit === 'string' ? unit.trim() : '';
  if (u === '') return text;
  return /^[A-Za-z]/.test(u) ? `${text} ${u}` : `${text}${u}`;
}

/**
 * 座標「x 3,210.50  y 4,120.25」。**区切りは全角空白の入らない半角 2 個**にしてあり、
 * 字幕・sidecar と突き合わせやすい（数字そのものは変えない）。
 *
 * @param {[unknown, unknown]|null|undefined} xy
 * @param {{ digits?: number, group?: boolean, sep?: string }} [options]
 * @returns {string}
 */
export function formatCoords(xy, { digits = 2, group = true, sep = '  ' } = {}) {
  if (!Array.isArray(xy) || xy.length < 2) return NULL_TEXT;
  const x = formatNumber(xy[0], digits, { group });
  const y = formatNumber(xy[1], digits, { group });
  if (x === NULL_TEXT && y === NULL_TEXT) return NULL_TEXT;
  return `x ${x}${sep}y ${y}`;
}

/** 4 隅の通し番号 → 表示名（`隅1`〜`隅4`）。0 始まり */
export function cornerLabel(index) {
  const i = Number(index);
  return Number.isFinite(i) ? `隅${Math.trunc(i) + 1}` : '隅?';
}

/**
 * 外挿の比と回転の 1 行（要件書 §5 ④）。`{ r, θ }` と `{ r, theta }` の両を受ける
 * （`θ` はキー名として扱いにくい箇所があるため、`theta` を別名にしている）。
 *
 * @param {{ r?: unknown, θ?: unknown, theta?: unknown }|null|undefined} entry
 * @param {{ rDigits?: number, thetaDigits?: number }} [options]
 * @returns {string}
 */
export function formatQuadrantText(entry, { rDigits = 3, thetaDigits = 1 } = {}) {
  if (!entry || typeof entry !== 'object') return NULL_TEXT;
  const r = entry.r;
  const theta = entry.θ !== undefined ? entry.θ : entry.theta;
  return `r ${formatNumber(r, rDigits)}  θ ${formatQuantity(theta, '°', thetaDigits)}`;
}

/** 状態の表記ゆれを 1 つに寄せる（`strict-error` / `strictError` / `STRICT_ERROR` → `strict_error`） */
function normalizeStatus(status) {
  if (status === null || status === undefined) return '';
  return String(status)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * 実値 → **表示名**。`strict` / `loose` / `error` の 3 種に落とす（要件書 §3）。
 * 実値 `strict_error`（`types.ts:40`）は `error` と表示する。**未知の値も `error`**
 * （「厳密である」と言えないものを strict として見せない）。
 *
 * @param {unknown} status
 * @returns {'strict'|'loose'|'error'}
 */
export function badgeDisplayName(status) {
  const s = normalizeStatus(status);
  if (s === 'strict') return 'strict';
  if (s === 'loose') return 'loose';
  return 'error';
}

/**
 * 実値 → トーン（色）。strict=緑 / loose=橙（v2.8 で黄から。資料の loose と同じ濃い橙） / error（strict_error 含む）=赤。
 * 表示名と色が別関数なのは、未知の値でも色だけは安全側（赤）に落とすため。
 *
 * @param {unknown} status
 * @returns {'ok'|'warn'|'danger'}
 */
export function badgeTone(status) {
  const name = badgeDisplayName(status);
  if (name === 'strict') return 'ok';
  if (name === 'loose') return 'warn';
  return 'danger';
}

/**
 * 棒グラフの長さ（0〜1）。**最大値に対する比**で、負・非数は 0 として扱う。
 * 最大値が 0 以下なら全部 0（0 同士に意味のある比は無い）。
 * 目盛りを偽らないよう、小さな値にも最低長を与える、といった補正はしない
 * （数値は棒の右に必ず出る）。
 *
 * @param {unknown[]} values
 * @returns {number[]}
 */
export function barShares(values) {
  const nums = (Array.isArray(values) ? values : []).map(
    (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0),
  );
  const max = nums.reduce((acc, v) => (v > acc ? v : acc), 0);
  return nums.map((v) => (max > 0 ? v / max : 0));
}

// ---------------------------------------------------------------------------
// DOM の組み立て
// ---------------------------------------------------------------------------

let styleInjectedIn = null;

/** CSS を 1 回だけ `document.head` に入れる（ページ側に CSS を書かせない） */
function ensureStyle(doc) {
  if (styleInjectedIn === doc) return;
  if (doc.getElementById('aero-panel-css')) {
    styleInjectedIn = doc;
    return;
  }
  const style = doc.createElement('style');
  style.id = 'aero-panel-css';
  style.textContent = PANEL_CSS;
  doc.head.append(style);
  styleInjectedIn = doc;
}

/** 配列でも単体でも受ける（`quadrants({...})` の 1 組も許す） */
function toArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** 更新できるようにした行（`set` だけ差し替える）。`el` は `remove()` 用 */
function handle(el, extra) {
  return { el, remove: () => el.remove(), ...extra };
}

/**
 * 数値パネル。`container`（収録面の `div`）の中に絶対配置の `<div>` を 1 つ作る。
 * `container` に `position` が付いていなければ `relative` を入れる。
 *
 * **文字は小さい画面でも潰れないよう px 固定**（D-6）。中身は行を足していくだけで、
 * 4 本のデモは必要な行だけを置く（要件書 §4〜§7 の数値表示）。
 */
export class Panel {
  /**
   * @param {HTMLElement} container 重ねる先（収録面）。通常は canvas の親の `div`
   * @param {{ corner?: 'tl'|'tr'|'bl'|'br', title?: string, width?: number }} [options]
   *   `width` は `max-width`（px）。既定 520
   */
  constructor(container, { corner = 'tl', title = '', width = 520 } = {}) {
    if (!container || container.nodeType !== 1) {
      throw new TypeError('Panel: container には要素（HTMLElement）を渡す');
    }
    if (!Object.hasOwn(CORNER_STYLES, corner)) {
      throw new RangeError(`Panel: corner は ${PANEL_CORNERS.join('/')} のいずれか（${String(corner)}）`);
    }
    const doc = container.ownerDocument;
    ensureStyle(doc);
    const view = doc.defaultView;
    if (view && view.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative'; // 隅に固定する基準を作る
    }

    this.doc = doc;
    this.container = container;
    this.el = doc.createElement('div');
    this.el.className = 'aero-panel';
    this.el.style.maxWidth = `${Number.isFinite(width) ? width : 520}px`;
    this.head = doc.createElement('div');
    this.head.className = 'aero-panel__head';
    this.head.hidden = true;
    this.body = doc.createElement('div');
    this.body.className = 'aero-panel__body';
    this.el.append(this.head, this.body);
    container.append(this.el);

    this.setCorner(corner);
    if (title) this.title(title);
  }

  /** 隅を移す（収録中に位置を変える用途は無いが、デモ・確認ページで使う） */
  setCorner(corner) {
    if (!Object.hasOwn(CORNER_STYLES, corner)) {
      throw new RangeError(`Panel: corner は ${PANEL_CORNERS.join('/')} のいずれか（${String(corner)}）`);
    }
    const pos = CORNER_STYLES[corner];
    for (const key of ['top', 'right', 'bottom', 'left']) this.el.style[key] = '';
    Object.assign(this.el.style, pos);
    this.el.setAttribute('data-panel-corner', corner);
    return this;
  }

  /** 見出し（どのデモの値か）。20px・太字・灰色 */
  title(text) {
    this.head.textContent = String(text ?? '');
    this.head.hidden = !text;
    return this;
  }

  /** 行を全部消す（見出しは残す） */
  clear() {
    this.body.replaceChildren();
    return this;
  }

  /** パネルごと外す */
  detach() {
    this.el.remove();
    return this;
  }

  _el(tag, className, text) {
    const el = this.doc.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }

  _row() {
    const el = this._el('div', 'aero-panel__row');
    this.body.append(el);
    return el;
  }

  /**
   * 状態バッジ（要件書 §4 ④・DEMO-A のゲート (v)「バッジ文字列が DOM に実在」）。
   * 文字列は **表示名**（`strict_error` → `error`）を `textContent` にそのまま置く。
   *
   * @param {unknown} status 実値（`mt.strict_status`）
   * @param {{ label?: string }} [options] 左のラベル。既定 `状態`
   * @returns {{ el: HTMLElement, set: (status: unknown) => void }}
   */
  badge(status, { label = '状態' } = {}) {
    const el = this._row();
    const labelEl = this._el('span', 'aero-panel__label', label);
    const badgeEl = this._el('span', 'aero-panel__badge');
    badgeEl.setAttribute('data-role', 'badge');
    el.append(labelEl, badgeEl);

    const set = (next) => {
      const name = badgeDisplayName(next);
      const tone = badgeTone(next);
      badgeEl.className = `aero-panel__badge ${BADGE_CLASS[tone]}`;
      badgeEl.textContent = name;
      badgeEl.setAttribute('data-status', String(next ?? ''));
      badgeEl.setAttribute('data-tone', tone);
    };
    set(status);
    return handle(el, { set, badgeEl, labelEl });
  }

  /**
   * 「ラベル 数値 単位」の 1 行（例 `往復誤差 0.00 px`）。
   *
   * @param {string} label
   * @param {unknown} num
   * @param {string} [unit='']
   * @param {number} [digits=2]
   * @param {{ signed?: boolean, group?: boolean }} [options]
   * @returns {{ el: HTMLElement, set: (num: unknown) => void, setLabel: (text: string) => void }}
   */
  value(label, num, unit = '', digits = 2, options = {}) {
    const el = this._row();
    const labelEl = this._el('span', 'aero-panel__label', label);
    const numEl = this._el('span', 'aero-panel__num', formatQuantity(num, unit, digits, options));
    el.append(labelEl, numEl);
    const set = (next) => {
      numEl.textContent = formatQuantity(next, unit, digits, options);
    };
    return handle(el, { set, numEl, labelEl, setLabel: (text) => { labelEl.textContent = String(text); } });
  }

  /**
   * 座標の 1 行（`x 3,210.50  y 4,120.25`）。単位を付けたいときはラベル側に書く
   * （`coords('絵図 (px)', [x, y])`）。
   *
   * @param {string} label
   * @param {[number, number]} xy
   * @param {{ digits?: number, group?: boolean }} [options]
   */
  coords(label, xy, { digits = 2, group = true } = {}) {
    const el = this._row();
    const labelEl = this._el('span', 'aero-panel__label', label);
    const numEl = this._el('span', 'aero-panel__num', formatCoords(xy, { digits, group }));
    el.append(labelEl, numEl);
    const set = (next) => {
      numEl.textContent = formatCoords(next, { digits, group });
    };
    return handle(el, { set, numEl, labelEl });
  }

  /**
   * 4 象限（境界頂点）の比 `r_i` と回転 `θ_i`（要件書 §5 ④）。1 組を渡したときは 1 行。
   *
   * @param {Array<{ label?: string, r: number, θ?: number, theta?: number }>|{ r: number, θ?: number }} list
   * @param {{ rDigits?: number, thetaDigits?: number }} [options]
   */
  quadrants(list, { rDigits = 3, thetaDigits = 1 } = {}) {
    const box = this._el('div', 'aero-panel__stack');
    this.body.append(box);

    const render = (next) => {
      box.replaceChildren();
      const entries = toArray(next);
      if (entries.length === 0) {
        box.append(this._el('div', 'aero-panel__num', NULL_TEXT));
        return;
      }
      entries.forEach((entry, i) => {
        const row = this._el('div', 'aero-panel__row aero-panel__row--quad');
        const nameEl = this._el(
          'span',
          'aero-panel__label',
          entry?.label ?? (entries.length === 1 ? '比・回転' : cornerLabel(i)),
        );
        const numEl = this._el('span', 'aero-panel__num', formatQuadrantText(entry, { rDigits, thetaDigits }));
        row.append(nameEl, numEl);
        box.append(row);
      });
    };
    render(list);
    return handle(box, { set: render });
  }

  /**
   * 2 本の横棒グラフ（要件書 §7 ⑥: 1 点方式 vs 5 点方式）。長さは**その並びの中の最大値**
   * に対する比で、値そのものは棒の右に必ず出す（`unit` 付き）。
   *
   * @param {Array<{ label?: string, value: number, tone?: 'info'|'ok'|'warn'|'danger' }>} list
   * @param {string} [unit='']
   * @param {{ digits?: number, group?: boolean }} [options]
   */
  bars(list, unit = '', { digits = 2, group = true } = {}) {
    const box = this._el('div', 'aero-panel__bars');
    this.body.append(box);

    const render = (next) => {
      box.replaceChildren();
      const entries = toArray(next);
      const shares = barShares(entries.map((entry) => entry?.value));
      entries.forEach((entry, i) => {
        const row = this._el('div', 'aero-panel__bar');
        const nameEl = this._el('span', 'aero-panel__label', entry?.label ?? `方式${i + 1}`);
        const track = this._el('div', 'aero-panel__track');
        const fill = this._el('div', 'aero-panel__fill');
        const share = shares[i] ?? 0;
        fill.style.width = `${(share * 100).toFixed(2)}%`;
        fill.style.background = Object.hasOwn(FILL, entry?.tone ?? '')
          ? FILL[entry.tone]
          : FILL.info;
        fill.setAttribute('data-share', share.toFixed(4));
        track.append(fill);
        const valueEl = this._el('span', 'aero-panel__num', formatQuantity(entry?.value, unit, digits, { group }));
        row.append(nameEl, track, valueEl);
        box.append(row);
      });
    };
    render(list);
    return handle(box, { set: render });
  }

  /**
   * 注記（20px）。値の出所・限界を画面に残すための行で、数値の行と混ぜない
   * （例「境界頂点での観測値」「5 点は 5 点から組み直した結果」「error: 逆変換を実行しません」）。
   *
   * @param {string} text
   * @param {{ tone?: 'plain'|'warn'|'danger' }} [options]
   */
  note(text, { tone = 'plain' } = {}) {
    const el = this._el('div', `aero-panel__note${tone === 'plain' ? '' : ` aero-panel__note--${tone}`}`, text);
    this.body.append(el);
    return handle(el, { set: (next) => { el.textContent = String(next); } });
  }
}

/**
 * `demos/data/` の**コンパイル済み Maplat データ**を読み、デモページが使う形に正規化する。
 *
 *   import { loadCompiled } from './lib/data.mjs';
 *   const d = await loadCompiled('aki_hiroshima_castle');
 *   d.points.length; // 485
 *   d.vertexMode;    // 'plain'（compiled に無ければトップレベルの値、それも無ければ 'plain'）
 *
 * **このモジュールの役割**（計画 §3）:
 *   1. compiled の読み込み（ブラウザ = `fetch('./data/<name>.json')` / Node = `fs`）
 *   2. 正規化（`points`・`edges`・`tins`・`vertices`・`centroid`・`width`/`height` を取り出す）
 *   3. **`vertexMode` の注入** — 奈良町絵図は `compiled` に `vertexMode` が無く、トップレベルにだけ
 *      `"birdeye"` がある。注入しないと plain として扱われ、DEMO-B の 4 象限（要件書 §5）が
 *      出せない。ここで 1 回だけ解決して `compiled` 側にも書く（収録ページは再解決しない）。
 *
 * **ブラウザ互換のための約束**: `node:fs` は**動的 import** でしか読まない。トップレベルで
 * `import 'node:fs/promises'` するとブラウザがモジュール解決の時点で失敗し、デモページが
 * 丸ごと動かなくなる。Node 判定も `process.versions.node` の有無だけで行う。
 */

/**
 * 題材 4 本（要件書 §1・§2 の 3 本＋館林御城図）。`data/` に複製したファイル名と 1:1 で対応する。
 * 館林御城図は 2026-11-01 発表者の指摘で DEMO-B の題材に加えた（plain・edges 0・兄弟リポジトリ Maplat から複製）。
 */
export const DEMO_DATA_NAMES = Object.freeze([
  'kaisei_hiroshima_jissoku',
  'naramachi_yasui_bunko',
  'aki_hiroshima_castle',
  'tatebayashi_ojozu',
]);

/**
 * 古地図タイルの slug を `url` から取るための形（要件書 §3）:
 * `https://t.tilemap.jp/maplat/tiles/{slug}/{z}/{x}/{y}.jpg`
 * 末尾の拡張子・クエリの揺れは許すが、**`{z}/{x}/{y}` の並びは必須**（別の URL を slug と誤認しない）。
 */
const TILE_URL_RE = /t\.tilemap\.jp\/maplat\/tiles\/([^/?#]+)\/\{z\}\/\{x\}\/\{y\}\.(?:jpe?g|png)(?:$|[?#])/;

/** Node で動いているか（ブラウザには `process.versions.node` が無い） */
function isNode() {
  return typeof process !== 'undefined'
    && process !== null
    && typeof process.versions === 'object'
    && process.versions !== null
    && typeof process.versions.node === 'string';
}

/**
 * `name` をファイル名の stem へ正規化する。**ディレクトリを跨がせない**。
 * `data/` の外を読ませる経路（`../`・絶対パス・NUL）を作らないための入口検査。
 * @param {unknown} name
 * @returns {string}
 */
export function normalizeName(name) {
  if (typeof name !== 'string') {
    throw new TypeError(`データ名が文字列でない: ${String(name)}`);
  }
  const trimmed = name.trim();
  const stem = trimmed.endsWith('.json') ? trimmed.slice(0, -'.json'.length) : trimmed;
  if (stem.length === 0) {
    throw new Error('データ名が空');
  }
  if (stem.includes('/') || stem.includes('\\') || stem.includes('\0')) {
    throw new Error(`データ名にパス区切りを含めない: ${JSON.stringify(name)}`);
  }
  if (stem === '.' || stem === '..' || stem.startsWith('..')) {
    throw new Error(`データ名が相対パスとして解釈されうる: ${JSON.stringify(name)}`);
  }
  return stem;
}

/**
 * 古地図タイル URL の slug。`url` → `mapID` → `name` の順で採る（要件書 §3 の「無ければ name」）。
 * @param {object|null|undefined} raw
 * @param {string} name 正規化済みの stem
 * @returns {string}
 */
export function tileSlugFrom(raw, name) {
  const candidates = [raw?.url, raw?.mapID, raw?.mapId];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const found = TILE_URL_RE.exec(candidate);
    if (found) return found[1];
  }
  return name;
}

/**
 * `vertexMode` を 1 回だけ解決する。`compiled` → トップレベル → `"plain"` の順。
 * Maplat の既定は plain ∴ 欠落を plain として扱うのは仕様どおり（要件書 §5 の注）。
 * @returns {'plain'|'birdeye'}
 */
function resolveVertexMode(raw, compiled) {
  const mode = compiled?.vertexMode ?? raw?.vertexMode;
  return typeof mode === 'string' && mode.length > 0 ? mode : 'plain';
}

/**
 * 画像サイズ。`compiled.wh` = `[width, height]` を第一とし、無ければトップレベルの `width`/`height`
 * （奈良町絵図は両方にあるが、古い形式はトップレベルだけを持つ）。
 * @returns {{ width: number|null, height: number|null }}
 */
function resolveSize(raw, compiled) {
  const wh = compiled?.wh;
  if (Array.isArray(wh) && wh.length >= 2 && Number.isFinite(wh[0]) && Number.isFinite(wh[1])) {
    return { width: wh[0], height: wh[1] };
  }
  return {
    width: Number.isFinite(raw?.width) ? raw.width : null,
    height: Number.isFinite(raw?.height) ? raw.height : null,
  };
}

const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * パース済み JSON をデモ用の形へ正規化する（**`loadCompiled` の戻り値を作る本体**）。
 *
 * **`compiled` を書き換える**（`vertexMode` / `wh` の注入）。`raw.compiled` と同一オブジェクト ∴
 * `raw` を見る側にも注入が伝わる。これは意図した副作用で、収録ページが `compiled.vertexMode` を
 * そのまま描画層へ渡せるようにするため（計画 §3）。
 *
 * @param {string} name データ名（`.json` の有無は問わない）
 * @param {object} raw パース済み JSON
 * @returns {{
 *   raw: object, compiled: object, points: Array, edges: Array, tins: Array,
 *   vertices: Array, centroid: Array|null, strictStatus: string|null,
 *   vertexMode: string, width: number|null, height: number|null,
 *   tileSlug: string, title: object|string|null
 * }}
 */
export function normalizeCompiled(name, raw) {
  const stem = normalizeName(name);
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${stem}: JSON のトップレベルがオブジェクトでない`);
  }
  const compiled = raw.compiled;
  if (!compiled || typeof compiled !== 'object') {
    throw new Error(`${stem}: compiled が無い（未コンパイルのデータはデモで使わない）`);
  }

  const vertexMode = resolveVertexMode(raw, compiled);
  // **注入**（奈良町絵図は compiled に無い）。既に compiled にあるときは同じ値が入るだけ
  compiled.vertexMode = vertexMode;

  const { width, height } = resolveSize(raw, compiled);
  if (!Array.isArray(compiled.wh) && width !== null && height !== null) {
    compiled.wh = [width, height];
  }

  const points = asArray(compiled.points);
  // 辺が空のデータ（`1932_nobeoka` 等）ではトップレベルの `edges` を見る（古い形式への保険）
  const compiledEdges = asArray(compiled.edges);
  const edges = compiledEdges.length > 0 ? compiledEdges : asArray(raw.edges);
  const centroid = Array.isArray(compiled.centroid_point) ? compiled.centroid_point : null;

  return {
    raw,
    compiled,
    points,
    edges,
    tins: asArray(compiled.tins_points),
    vertices: asArray(compiled.vertices_points),
    centroid,
    strictStatus: typeof compiled.strict_status === 'string' ? compiled.strict_status : null,
    vertexMode,
    width,
    height,
    tileSlug: tileSlugFrom(raw, stem),
    title: raw.title ?? null,
  };
}

/**
 * MANIFEST に書く件数・状態（`demos/scripts/verify-data.mjs` が使う）。
 * `edgeNodes` は正規化の戻り値に含めない（描画層が読む値ではない）ので、ここで数える。
 * @param {string} name
 * @param {object} raw
 */
export function summarizeCompiled(name, raw) {
  const normalized = normalizeCompiled(name, raw);
  const edgeNodes = normalized.compiled.edgeNodes;
  return {
    points: normalized.points.length,
    edges: normalized.edges.length,
    edgeNodes: Array.isArray(edgeNodes) ? edgeNodes.length : 0,
    strict_status: normalized.strictStatus,
    vertexMode: normalized.vertexMode,
    width: normalized.width,
    height: normalized.height,
    tileSlug: normalized.tileSlug,
    title: normalized.title,
  };
}

/** ブラウザ（または `fetchImpl` を渡した Node）用。**URL は要件書 §3 のとおり `./data/` 起点** */
async function readViaFetch(file, fetchImpl) {
  const response = await fetchImpl(`./data/${file}`);
  if (!response || response.ok === false) {
    const status = response?.status ?? '(応答なし)';
    throw new Error(`データを取得できない: ./data/${file}（HTTP ${status}）`);
  }
  // テスト用の差し替えが `json()` だけを持つことがある ∴ 両対応にする
  if (typeof response.json === 'function') return response.json();
  return JSON.parse(await response.text());
}

/** Node 用。`node:fs` は動的 import（ブラウザのモジュール解決を壊さない） */
async function readViaFs(file) {
  const url = new URL(`../data/${file}`, import.meta.url);
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(url, 'utf8');
  return JSON.parse(text);
}

/**
 * データを 1 本読む。
 *
 * - `fetchImpl` を渡したとき … `fetchImpl('./data/<name>.json')` を呼ぶ（テスト・任意の取得経路）
 * - Node（`process.versions.node` がある） … `demos/data/<name>.json` を `fs` で読む
 * - それ以外（ブラウザ） … `fetch('./data/<name>.json')`
 *
 * @param {string} name 例: `'aki_hiroshima_castle'`（`.json` 付きでもよい）
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function loadCompiled(name, { fetchImpl } = {}) {
  const stem = normalizeName(name);
  const file = `${stem}.json`;

  let raw;
  try {
    if (typeof fetchImpl === 'function') {
      raw = await readViaFetch(file, fetchImpl);
    } else if (isNode()) {
      raw = await readViaFs(file);
    } else if (typeof globalThis.fetch === 'function') {
      raw = await readViaFetch(file, globalThis.fetch.bind(globalThis));
    } else {
      throw new Error('fetch が無い（ブラウザ以外では fetchImpl を渡すか Node で実行する）');
    }
  } catch (error) {
    // 読めない理由（404・JSON 破損・権限）をデータ名と一緒に出す。呼び出し側は収録を止める
    throw new Error(`データを読めない: ${file} — ${error.message}`, { cause: error });
  }

  return normalizeCompiled(stem, raw);
}

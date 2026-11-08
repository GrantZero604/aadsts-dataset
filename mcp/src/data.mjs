// Data access: plain GET requests for the static JSON files on brambrinkmeier.com, cached in memory, with
// the bundled snapshot (../snapshot/) as the fallback when the site cannot be reached or the server runs
// offline. Nothing is sent except the request line and these headers: User-Agent and Accept. No query
// strings, no cookies, no identifiers, no pasted text.
import { readFileSync } from 'node:fs';

export const VERSION = '0.1.0';
export const USER_AGENT = `aadsts-mcp/${VERSION} (+https://brambrinkmeier.com/for-agents/)`;
export const DEFAULT_BASE_URL = 'https://brambrinkmeier.com';

const SNAPSHOT_DIR = new URL('../snapshot/', import.meta.url);
const CODE_RE = /^[0-9]{4,7}$/;
const MAX_BYTES = 8 * 1024 * 1024;

/** Strip an optional AADSTS prefix; returns the digits or null when the input is not a code. */
export function normalizeCode(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const s = String(input).trim().replace(/^AADSTS/i, '');
  return CODE_RE.test(s) ? s : null;
}

function readSnapshot(name) {
  return JSON.parse(readFileSync(new URL(name, SNAPSHOT_DIR), 'utf8'));
}

/**
 * @param {object} [opts]
 * @param {string} [opts.baseUrl] defaults to AADSTS_MCP_BASE_URL or https://brambrinkmeier.com
 * @param {boolean} [opts.offline] defaults to AADSTS_MCP_OFFLINE=1
 * @param {number} [opts.ttlMs] cache lifetime for live files, default 6 hours
 * @param {number} [opts.timeoutMs] per-request timeout, default 8 seconds
 * @param {typeof fetch} [opts.fetchImpl]
 */
export function createDataSource(opts = {}) {
  const env = process.env;
  const baseUrl = checkBaseUrl(opts.baseUrl ?? env.AADSTS_MCP_BASE_URL ?? DEFAULT_BASE_URL);
  const offline = opts.offline ?? env.AADSTS_MCP_OFFLINE === '1';
  const ttlMs = opts.ttlMs ?? 6 * 60 * 60 * 1000;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const cache = new Map(); // path -> {at, value}
  let snapshotMeta;
  let snapshotRecords;

  const meta = () => (snapshotMeta ??= readSnapshot('SNAPSHOT.json'));

  function snapshotSource(reason) {
    return { kind: 'snapshot', builtFrom: meta().builtFrom, takenAt: meta().takenAt, dataGeneratedAt: meta().dataGeneratedAt, reason };
  }

  async function getLive(path) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const url = baseUrl + path;
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) {
      const err = new Error(`404 for ${url}`);
      err.notFound = true;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const type = res.headers.get('content-type') ?? '';
    if (!/json/i.test(type)) throw new Error(`unexpected content type "${type}" for ${url}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error(`response too large for ${url}`);
    const value = JSON.parse(text);
    const out = { value, source: { kind: 'live', url, fetchedAt: new Date().toISOString() } };
    cache.set(path, { at: Date.now(), value: out });
    return out;
  }

  /**
   * Live file with snapshot fallback. `check` validates the live shape; a live file that fails it is not
   * used. A live 404 is passed through as notFound (the site has no such file), never replaced by the
   * snapshot.
   */
  async function get(path, snapshotValue, check) {
    if (offline) return { value: snapshotValue(), source: snapshotSource('offline mode (AADSTS_MCP_OFFLINE=1)') };
    try {
      const live = await getLive(path);
      if (!check(live.value)) throw new Error(`unexpected shape in ${path}`);
      return live;
    } catch (e) {
      if (e.notFound) return { value: null, notFound: true, source: { kind: 'live', url: baseUrl + path } };
      const value = snapshotValue();
      return { value, source: snapshotSource(`live request failed: ${e.message}`) };
    }
  }

  const isV1 = (d) => d && typeof d.schemaVersion === 'string' && d.schemaVersion.startsWith('1.');

  return {
    baseUrl,
    offline,
    snapshotMeta: meta,

    /** /api/aadsts/index.json */
    index: () => get('/api/aadsts/index.json', () => readSnapshot('index.json'), (d) => isV1(d) && Array.isArray(d.codes)),

    /** /aadsts.json (classification fields: name, category, kind, MITRE, tables) */
    dataset: () => get('/aadsts.json', () => readSnapshot('aadsts.json'), (d) => d && Array.isArray(d.codes)),

    /** /graph-errors.json */
    graphErrors: () => get('/graph-errors.json', () => readSnapshot('graph-errors.json'), (d) => d && Array.isArray(d.codes)),

    /** /lab-runs.json */
    labRuns: () => get('/lab-runs.json', () => readSnapshot('lab-runs.json'), (d) => isV1(d) && Array.isArray(d.runs)),

    /** /api/aadsts/{code}.json; value is null when the snapshot has no record either. */
    record(code) {
      const c = normalizeCode(code);
      if (!c) throw new Error('not an AADSTS code');
      return get(
        `/api/aadsts/${c}.json`,
        () => {
          snapshotRecords ??= readSnapshot('records.json');
          return snapshotRecords[c] ?? null;
        },
        (d) => isV1(d) && d.code === c,
      );
    },

    /** Offline-only view used by extract_codes: whatever is cached from live, else the snapshot. Never fetches. */
    localIndex() {
      const hit = cache.get('/api/aadsts/index.json');
      return hit ? hit.value.value : readSnapshot('index.json');
    },
    localGraphErrors() {
      const hit = cache.get('/graph-errors.json');
      return hit ? hit.value.value : readSnapshot('graph-errors.json');
    },
  };
}

function checkBaseUrl(u) {
  const url = new URL(u);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('AADSTS_MCP_BASE_URL must be https (plain http is accepted only for localhost)');
  }
  return url.origin;
}

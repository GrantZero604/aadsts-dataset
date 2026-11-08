// The data source against a local HTTP server that records exactly what it was sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createDataSource, USER_AGENT, normalizeCode } from '../src/data.mjs';

const snap = (f) => readFileSync(new URL(`../snapshot/${f}`, import.meta.url), 'utf8');
const records = JSON.parse(snap('records.json'));

let server;
let base;
const seen = [];
let mode = 'ok';

before(async () => {
  server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers });
    if (mode === 'error') { res.writeHead(500); return res.end('boom'); }
    if (mode === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>'); }
    const send = (body) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(body); };
    if (req.url === '/api/aadsts/index.json') {
      const idx = JSON.parse(snap('index.json'));
      idx.generatedAt = 'LIVE-MARKER';
      return send(JSON.stringify(idx));
    }
    const m = req.url.match(/^\/api\/aadsts\/(\d+)\.json$/);
    if (m && records[m[1]]) return send(JSON.stringify({ ...records[m[1]], title: `LIVE ${records[m[1]].title}` }));
    if (req.url === '/lab-runs.json') return send(snap('lab-runs.json'));
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('sends a plain GET with the documented User-Agent and nothing identifying', async () => {
  seen.length = 0;
  mode = 'ok';
  const ds = createDataSource({ baseUrl: base, offline: false });
  const r = await ds.index();
  assert.equal(r.source.kind, 'live');
  assert.equal(r.value.generatedAt, 'LIVE-MARKER');
  assert.equal(seen.length, 1);
  const req = seen[0];
  assert.equal(req.method, 'GET');
  assert.equal(req.url, '/api/aadsts/index.json');
  assert.equal(req.headers['user-agent'], USER_AGENT);
  assert.match(USER_AGENT, /^aadsts-mcp\/\d+\.\d+\.\d+ \(\+https:\/\/brambrinkmeier\.com\/for-agents\/\)$/);
  assert.equal(req.headers.cookie, undefined);
  assert.equal(req.headers.authorization, undefined);
  const extra = Object.keys(req.headers).filter((h) => !['host', 'user-agent', 'accept', 'accept-encoding', 'accept-language', 'connection', 'sec-fetch-mode'].includes(h));
  assert.deepEqual(extra, [], `unexpected headers: ${extra.join(', ')}`);
});

test('caches live files instead of re-fetching them', async () => {
  seen.length = 0;
  const ds = createDataSource({ baseUrl: base, offline: false });
  await ds.index();
  await ds.index();
  assert.equal(seen.length, 1);
});

test('fetches one code record by its exact path and validates the code', async () => {
  seen.length = 0;
  const ds = createDataSource({ baseUrl: base, offline: false });
  const r = await ds.record('AADSTS50126');
  assert.equal(r.source.kind, 'live');
  assert.match(r.value.title, /^LIVE /);
  assert.deepEqual(seen.map((s) => s.url), ['/api/aadsts/50126.json']);
  assert.throws(() => ds.record('../../etc/passwd'), /not an AADSTS code/);
});

test('a live 404 means the site has no page; the snapshot is not used to contradict it', async () => {
  const ds = createDataSource({ baseUrl: base, offline: false });
  const r = await ds.record('9999999');
  assert.equal(r.notFound, true);
  assert.equal(r.value, null);
});

test('falls back to the snapshot on a server error, and says so', async () => {
  mode = 'error';
  const ds = createDataSource({ baseUrl: base, offline: false });
  const r = await ds.record('50126');
  mode = 'ok';
  assert.equal(r.source.kind, 'snapshot');
  assert.match(r.source.reason, /HTTP 500/);
  assert.equal(r.value.code, '50126');
  assert.doesNotMatch(r.value.title, /^LIVE /);
});

test('falls back when the response is not JSON (e.g. an HTML error page)', async () => {
  mode = 'html';
  const ds = createDataSource({ baseUrl: base, offline: false });
  const r = await ds.labRuns();
  mode = 'ok';
  assert.equal(r.source.kind, 'snapshot');
  assert.match(r.source.reason, /content type/);
});

test('falls back when the site is unreachable', async () => {
  const ds = createDataSource({ baseUrl: 'http://127.0.0.1:9', offline: false, timeoutMs: 2000 });
  const r = await ds.index();
  assert.equal(r.source.kind, 'snapshot');
  assert.equal(r.value.codes.length, r.value.count);
});

test('offline mode never calls fetch', async () => {
  let calls = 0;
  const ds = createDataSource({ offline: true, fetchImpl: async () => { calls += 1; } });
  await ds.index();
  await ds.record('50126');
  await ds.labRuns();
  assert.equal(calls, 0);
});

test('refuses a non-https base URL other than localhost', () => {
  assert.throws(() => createDataSource({ baseUrl: 'http://example.com' }), /must be https/);
  assert.doesNotThrow(() => createDataSource({ baseUrl: 'https://example.com' }));
});

test('normalizeCode accepts the AADSTS prefix and rejects everything else', () => {
  assert.equal(normalizeCode('AADSTS50126'), '50126');
  assert.equal(normalizeCode(' aadsts50126 '), '50126');
  assert.equal(normalizeCode(50126), '50126');
  assert.equal(normalizeCode('501'), null);
  assert.equal(normalizeCode('50126/../x'), null);
});

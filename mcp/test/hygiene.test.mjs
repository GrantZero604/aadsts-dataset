// What this package ships: no lab identifiers, a consistent snapshot, no runtime dependencies, no
// network code outside the data source, and a guard against an accidental npm publish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPublishableLeaks } from '../src/identifiers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((n) => {
  if (n === 'node_modules' || n === '.git') return [];
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(ROOT);
const read = (p) => readFileSync(p, 'utf8');
const snap = (f) => JSON.parse(read(join(ROOT, 'snapshot', f)));

test('the leak scanner finds identifiers it should (control)', () => {
  assert.deepEqual(findPublishableLeaks("tenant '0b5c3a2e-1111-4a4a-9b9b-123456789abc'"), ['0b5c3a2e-1111-4a4a-9b9b-123456789abc']);
  assert.equal(findPublishableLeaks('mail alice@corp.example.org').length, 1);
  assert.equal(findPublishableLeaks('from 198.18.4.7').length, 1);
  assert.equal(findPublishableLeaks('user@contoso.com from 203.0.113.10, app 00000002-0000-0ff1-ce00-000000000000').length, 0);
});

test('no file in this package holds a lab tenant, app or object id, an address or an IP', () => {
  // The tests themselves contain synthetic identifiers for the controls above; they are not real.
  const shipped = files.filter((f) => !f.includes(`${join(ROOT, 'test')}`));
  assert.ok(shipped.some((f) => f.endsWith('records.json')), 'scan must cover the snapshot');
  const leaks = shipped.flatMap((f) => findPublishableLeaks(read(f)).map((x) => `${f.slice(ROOT.length)}: ${x}`));
  assert.deepEqual(leaks, []);
});

test('the snapshot is internally consistent', () => {
  const index = snap('index.json');
  const records = snap('records.json');
  const meta = snap('SNAPSHOT.json');
  const labs = snap('lab-runs.json');
  assert.equal(index.codes.length, index.count);
  assert.deepEqual(Object.keys(records).sort(), index.codes.map((c) => c.code).sort());
  for (const c of index.codes) {
    assert.equal(records[c.code].code, c.code);
    assert.equal(!!records[c.code].labReproduced, c.labReproduced, `labReproduced differs for ${c.code}`);
  }
  assert.equal(meta.codeCount, index.count);
  assert.equal(meta.dataGeneratedAt, index.generatedAt);
  assert.equal(labs.runs.length, labs.runCount);
  assert.equal(labs.runs.reduce((n, r) => n + r.results.length, 0), labs.resultCount);
});

test('no runtime dependencies, and the package ships only src, snapshot and the README', () => {
  const pkg = JSON.parse(read(join(ROOT, 'package.json')));
  assert.notEqual(pkg.private, true);
  assert.deepEqual(pkg.files, ['src/', 'snapshot/', 'README.md']);
  assert.equal(pkg.dependencies, undefined);
});

test('network access happens only in the data source and the snapshot script, by GET', () => {
  const src = files.filter((f) => f.endsWith('.mjs') && !f.includes(`${join(ROOT, 'test')}`));
  for (const f of src) {
    const t = read(f);
    const net = /\bfetch\(|node:https?\b|node:net\b|node:dgram\b|XMLHttpRequest|WebSocket/.test(t);
    if (net) assert.ok(/src\/data\.mjs$|scripts\/update-snapshot\.mjs$/.test(f), `network code in ${f}`);
    assert.doesNotMatch(t, /method:\s*'(POST|PUT|PATCH|DELETE)'/, `non-GET request in ${f}`);
  }
});

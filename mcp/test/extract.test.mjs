import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCodes } from '../src/extract.mjs';
import { createHandlers } from '../src/tools.mjs';
import { createDataSource } from '../src/data.mjs';

const known = { aadsts: new Set(['50126', '50076']), aadstsTitles: new Map([['50126', { title: 'AADSTS50126 page', url: 'https://brambrinkmeier.com/entra/aadsts/50126/' }]]), graph: ['Authorization_RequestDenied'] };

test('finds AADSTS-prefixed codes in browser and CLI error text, in order of appearance', () => {
  const text = `Sign in failed.\nAADSTS50076: Due to a configuration change...\nTrace ID: x\nAADSTS50126: Error validating credentials`;
  const out = extractCodes(text, known);
  assert.deepEqual(out.codes.map((c) => c.code), ['50076', '50126']);
  assert.equal(out.codes[1].hasPageOnSite, true);
  assert.equal(out.codes[1].url, 'https://brambrinkmeier.com/entra/aadsts/50126/');
});

test('reads OAuth error_codes arrays, errorCode and ResultType fields and portal "Error code" labels', () => {
  const text = [
    '{"error":"invalid_grant","error_codes":[50126, 50053],"timestamp":"2026-11-01 10:00:00Z"}',
    '{"status":{"errorCode": 530032}}',
    'SigninLogs | where ResultType == "53003"',
    'Error code: 700016',
  ].join('\n');
  const codes = extractCodes(text, known).codes.map((c) => c.code);
  assert.deepEqual(codes.sort(), ['50053', '50126', '53003', '530032', '700016'].sort());
});

test('counts repeated mentions once per code and flags codes without a page', () => {
  const out = extractCodes('AADSTS9999999 then AADSTS9999999 again', known);
  assert.equal(out.codes.length, 1);
  assert.equal(out.codes[0].mentions, 2);
  assert.equal(out.codes[0].hasPageOnSite, false);
});

test('does not treat other numbers (timestamps, HTTP statuses, ports) as codes', () => {
  const out = extractCodes('HTTP 400 at 2026-11-01T10:00:00Z, port 50126, correlation 12345678', known);
  assert.deepEqual(out.codes, []);
});

test('finds known Graph error code names', () => {
  const out = extractCodes('{"error":{"code":"Authorization_RequestDenied","message":"Insufficient privileges"}}', known);
  assert.deepEqual(out.graphCodes, [{ code: 'Authorization_RequestDenied', mentions: 1 }]);
});

test('never returns the pasted text or the identifiers in it, only counts', () => {
  const text = "AADSTS50126 for alice@corp.example.org from 198.18.4.7 in tenant '0b5c3a2e-1111-4a4a-9b9b-123456789abc'";
  const out = extractCodes(text, known);
  const json = JSON.stringify(out);
  assert.ok(!json.includes('alice'), 'address leaked');
  assert.ok(!json.includes('198.18.4.7'), 'IP leaked');
  assert.ok(!json.includes('0b5c3a2e'), 'GUID leaked');
  assert.deepEqual(out.identifierShapedValuesSeen, { guids: 1, addresses: 1, ipv4: 1 });
});

test('caps the amount of text read', () => {
  const out = extractCodes(`${'x'.repeat(250_000)} AADSTS50126`, known);
  assert.equal(out.truncated, true);
  assert.equal(out.codes.length, 0);
});

test('the extract_codes tool makes no network request, even when live mode is on', async () => {
  let calls = 0;
  const ds = createDataSource({ offline: false, fetchImpl: async () => { calls += 1; throw new Error('network used'); } });
  const h = createHandlers(ds);
  const res = await h.extract_codes({ text: 'AADSTS50126 and AADSTS53003' });
  assert.equal(calls, 0);
  assert.equal(res.data.networkRequests, 0);
  assert.deepEqual(res.data.codes.map((c) => c.code), ['50126', '53003']);
  assert.ok(res.data.codes.every((c) => c.hasPageOnSite), 'both codes have pages in the snapshot');
});

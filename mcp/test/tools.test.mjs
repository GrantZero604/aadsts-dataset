// Tool behaviour against the bundled snapshot (offline, so the results are deterministic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDataSource } from '../src/data.mjs';
import { createHandlers, ToolInputError, TOOL_DEFINITIONS } from '../src/tools.mjs';

const h = createHandlers(createDataSource({ offline: true }));

test('lookup returns the page facts, its verification state and where the data came from', async () => {
  const { text, data } = await h.lookup_aadsts_code({ code: 'AADSTS50126' });
  assert.equal(data.found, true);
  assert.equal(data.code, '50126');
  assert.equal(data.url, 'https://brambrinkmeier.com/entra/aadsts/50126/');
  assert.ok(['documentation', 'lab-reproduced', 'lab-verified'].includes(data.verification));
  assert.equal(data.source.kind, 'snapshot');
  assert.match(text, /Verification: /);
  assert.match(text, /bundled snapshot/);
  assert.match(text, /not Microsoft's/);
  assert.ok(data.kql.length > 0);
});

test('a documentation-only page is not presented as lab-tested', async () => {
  const idx = (await createDataSource({ offline: true }).index()).value;
  const docOnly = idx.codes.find((c) => !c.labReproduced);
  const { text, data } = await h.lookup_aadsts_code({ code: docOnly.code });
  assert.equal(data.verification, 'documentation');
  assert.equal(data.labReproduced, null);
  assert.match(text, /not marked lab-reproduced/);
  assert.doesNotMatch(text, /run against exported lab rows/);
});

test('full mode returns every page section', async () => {
  const { data } = await h.lookup_aadsts_code({ code: '50126', include: 'full' });
  assert.ok(Array.isArray(data.sections) && data.sections.length > 2);
});

test('a code without a page says so and points to Microsoft, without inventing anything', async () => {
  const { text, data } = await h.lookup_aadsts_code({ code: '9999999' });
  assert.equal(data.found, false);
  assert.equal(data.microsoftErrorLookup, 'https://login.microsoftonline.com/error?code=9999999');
  assert.match(text, /no page for AADSTS9999999/);
});

test('bad input is a tool input error', async () => {
  await assert.rejects(h.lookup_aadsts_code({ code: 'hello' }), ToolInputError);
  await assert.rejects(h.search_aadsts({}), ToolInputError);
  await assert.rejects(h.search_aadsts({ query: 'x', limit: 500 }), ToolInputError);
  await assert.rejects(h.lab_evidence({ code: '../x' }), ToolInputError);
});

test('search ranks an exact code first and matches error names and title words', async () => {
  const byCode = await h.search_aadsts({ query: 'AADSTS50126' });
  assert.equal(byCode.data.results[0].code, '50126');
  const byName = await h.search_aadsts({ query: 'InvalidUserNameOrPassword' });
  assert.equal(byName.data.results[0].code, '50126');
  const words = await h.search_aadsts({ query: 'password' });
  assert.ok(words.data.total > 0);
});

test('search filters by attack signal, MITRE technique and lab reproduction', async () => {
  const high = await h.search_aadsts({ attackSignal: 'high', limit: 50 });
  assert.ok(high.data.results.length > 0);
  assert.ok(high.data.results.every((r) => r.attackSignal === 'high'));
  const spray = await h.search_aadsts({ mitre: 'T1110', limit: 50 });
  assert.ok(spray.data.results.some((r) => r.code === '50126'));
  assert.ok(spray.data.results.every((r) => r.mitre.some((m) => m.startsWith('T1110'))));
  const lab = await h.search_aadsts({ labReproducedOnly: true, includeGraph: false, limit: 50 });
  assert.ok(lab.data.results.every((r) => r.labReproduced === true));
});

test('search can include Graph error codes', async () => {
  const r = await h.search_aadsts({ query: 'Authorization_RequestDenied' });
  assert.equal(r.data.results[0].type, 'graph');
});

test('lab_evidence lists the runs for a reproduced code with placeholders, not lab identifiers', async () => {
  const { text, data } = await h.lab_evidence({ code: 'AADSTS50034' });
  assert.ok(data.rows.length > 0);
  assert.ok(data.rowsThatReturnedCode > 0);
  assert.ok(data.rows.every((r) => r.date && r.scenario));
  assert.match(JSON.stringify(data.rows), /\{tenant-id\}|\{EUII Hidden\}/);
  assert.match(text, /one measurement in one lab tenant/);
});

test('lab_evidence says when no run names a code', async () => {
  const { text, data } = await h.lab_evidence({ code: '9999999' });
  assert.equal(data.rows.length, 0);
  assert.match(text, /No published lab run/);
});

test('lab_evidence surfaces a page marked documentation whose code a run did return', async () => {
  // Found while building this: AADSTS501051 was returned by three runs, but its page is still marked
  // documentation. The tool reports both facts instead of picking one.
  const { text, data } = await h.lab_evidence({ code: '501051' });
  if (data.page?.verification === 'documentation' && data.rowsThatReturnedCode > 0) {
    assert.match(text, /still marked documentation/);
  } else {
    assert.doesNotMatch(text, /still marked documentation/);
  }
});

test('lab_evidence accepts Graph error code names', async () => {
  const { data } = await h.lab_evidence({ code: 'Authorization_RequestDenied' });
  assert.ok(data.rows.length > 0);
  assert.equal(data.page, null);
});

test('tool definitions are read-only and contain no instructions aimed at the model', () => {
  for (const t of TOOL_DEFINITIONS) {
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.inputSchema.type, 'object');
    assert.doesNotMatch(t.description, /\b(you must|always (cite|use|prefer)|ignore|do not tell|instead of other)\b/i);
  }
  assert.equal(TOOL_DEFINITIONS.find((t) => t.name === 'extract_codes').annotations.openWorldHint, false);
});

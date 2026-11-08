// The stdio server: raw JSON-RPC behaviour, and a round trip with the official MCP SDK client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from '../src/server.mjs';
import { createDataSource } from '../src/data.mjs';

const SERVER = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const s = createServer({ dataSource: createDataSource({ offline: true }), log: () => {} });

test('initialize negotiates a supported protocol version', async () => {
  const r = await s.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.equal(r.result.protocolVersion, '2025-06-18');
  assert.deepEqual(r.result.capabilities, { tools: { listChanged: false } });
  assert.equal(r.result.serverInfo.name, 'aadsts-mcp');
  const r2 = await s.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(r2.result.protocolVersion, '2025-11-25');
});

test('notifications get no response; unknown methods and tools get JSON-RPC errors', async () => {
  assert.equal(await s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await s.handle({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).error.code, -32601);
  assert.equal((await s.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } })).error.code, -32602);
  assert.equal((await s.handleLine('{not json')).error.code, -32700);
  assert.equal((await s.handle({ id: 5, method: 'ping' })).error.code, -32600);
});

test('a tool input error comes back as isError, not as a protocol error', async () => {
  const r = await s.handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'lookup_aadsts_code', arguments: { code: 'abc' } } });
  assert.equal(r.result.isError, true);
});

test('batches are answered as arrays', async () => {
  const r = await s.handleLine(JSON.stringify([{ jsonrpc: '2.0', id: 7, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }]));
  assert.deepEqual(r, [{ jsonrpc: '2.0', id: 7, result: {} }]);
});

test('works end to end with the official MCP SDK client over stdio', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, AADSTS_MCP_OFFLINE: '1' }, stderr: 'pipe' });
  const client = new Client({ name: 'aadsts-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['extract_codes', 'lab_evidence', 'lookup_aadsts_code', 'search_aadsts']);

    const lookup = await client.callTool({ name: 'lookup_aadsts_code', arguments: { code: 'AADSTS50126' } });
    assert.equal(lookup.isError, false);
    assert.equal(lookup.structuredContent.code, '50126');
    assert.match(lookup.content[0].text, /AADSTS50126/);

    const ex = await client.callTool({ name: 'extract_codes', arguments: { text: 'AADSTS50076: MFA required' } });
    assert.equal(ex.structuredContent.codes[0].code, '50076');

    const ev = await client.callTool({ name: 'lab_evidence', arguments: { code: '50126' } });
    assert.ok(ev.structuredContent.rows.length > 0);

    const se = await client.callTool({ name: 'search_aadsts', arguments: { query: 'consent' } });
    assert.ok(se.structuredContent.results.length > 0);
  } finally {
    await client.close();
  }
});

test('stdout carries only JSON-RPC messages', async () => {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, AADSTS_MCP_OFFLINE: '1' } });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'lab_evidence', arguments: { code: '50034' } } },
  ];
  for (const l of lines) child.stdin.write(`${JSON.stringify(l)}\n`);
  child.stdin.end();
  await new Promise((r) => child.on('close', r));
  const msgs = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(msgs.map((m) => m.id).sort(), [1, 2]);
  assert.ok(msgs.every((m) => m.jsonrpc === '2.0'));
});

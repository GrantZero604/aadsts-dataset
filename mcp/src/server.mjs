#!/usr/bin/env node
// aadsts-mcp: a local MCP server over stdio (newline-delimited JSON-RPC 2.0). No dependencies.
// stdout carries protocol messages only; diagnostics go to stderr.
import { createInterface } from 'node:readline';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createDataSource, VERSION } from './data.mjs';
import { TOOL_DEFINITIONS, createHandlers, ToolInputError } from './tools.mjs';

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'aadsts-mcp', title: 'AADSTS sign-in errors (brambrinkmeier.com)', version: VERSION };

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** Build a message handler. Returns a function message -> response (or null for notifications). */
export function createServer({ dataSource = createDataSource(), log = (m) => process.stderr.write(`[aadsts-mcp] ${m}\n`) } = {}) {
  const handlers = createHandlers(dataSource);

  async function handle(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return fail(msg && 'id' in msg ? msg.id : null, -32600, 'Invalid Request');
    }
    const isNotification = !('id' in msg);
    const { id, method, params = {} } = msg;
    if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...: nothing to do

    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
        return ok(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
      }
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, { tools: TOOL_DEFINITIONS });
      case 'tools/call': {
        const name = params?.name;
        const fn = handlers[name];
        if (!fn) return fail(id, -32602, `Unknown tool: ${name}`);
        const args = params.arguments ?? {};
        if (typeof args !== 'object' || Array.isArray(args)) return fail(id, -32602, 'arguments must be an object');
        try {
          const { text, data } = await fn(args);
          return ok(id, { content: [{ type: 'text', text }], structuredContent: data, isError: false });
        } catch (e) {
          if (!(e instanceof ToolInputError)) log(`${name} failed: ${e.message}`);
          return ok(id, { content: [{ type: 'text', text: e instanceof ToolInputError ? e.message : `Tool failed: ${e.message}` }], isError: true });
        }
      }
      default:
        return fail(id, -32601, `Method not found: ${method}`);
    }
  }

  /** Handle one line of input: a message or a batch. Returns the response object/array or null. */
  async function handleLine(line) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return fail(null, -32700, 'Parse error');
    }
    if (Array.isArray(parsed)) {
      if (!parsed.length) return fail(null, -32600, 'Invalid Request');
      const out = (await Promise.all(parsed.map(handle))).filter(Boolean);
      return out.length ? out : null;
    }
    return handle(parsed);
  }

  return { handle, handleLine };
}

export function runStdio() {
  const server = createServer();
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    const p = server.handleLine(line).then((res) => {
      if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
    });
    pending.add(p);
    p.finally(() => pending.delete(p));
  });
  // Answer what is still in flight, then exit when the client closes stdin.
  rl.on('close', () => Promise.allSettled([...pending]).then(() => process.exit(0)));
}

const entry = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : '';
if (import.meta.url === entry) runStdio();

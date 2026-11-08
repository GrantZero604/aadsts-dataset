# aadsts-mcp

A small local [MCP](https://modelcontextprotocol.io/) server that gives an AI client read-only access to the Entra ID `AADSTS` sign-in error pages and lab runs on [brambrinkmeier.com](https://brambrinkmeier.com/entra/aadsts/). It runs on your machine over stdio and has no runtime dependencies.

| Tool | What it does | Network |
|---|---|---|
| `lookup_aadsts_code` | The page record for one code: meaning, Microsoft's wording as quoted, attack signal, MITRE ATT&CK, Conditional Access notes, fix, KQL, verification state, sources. Accepts `AADSTS50126` or `50126`. | GET one JSON file |
| `search_aadsts` | Search by code, error name or title words; filter by attack signal, category, MITRE technique or lab reproduction. Includes the Microsoft Graph error-code pages. | GET two or three JSON files |
| `extract_codes` | Find AADSTS codes (and Graph error code names the site documents) in pasted error text: browser error pages, OAuth error responses, sign-in log rows, CLI output. | **None.** Runs locally. |
| `lab_evidence` | What the published lab runs recorded for a code: date, scenario, expected and returned code, first message line, plus the page's verification state. Accepts AADSTS codes and Graph error code names. | GET one or two JSON files |

## What is lab-verified and what is not

Read this before relying on an answer. The server reports what the site says, including how far each page has been checked; it does not upgrade that.

As of the bundled snapshot (data generated 8 November 2026):

- **118** AADSTS code pages. **43** of those codes are not in Microsoft's error code reference.
- **34** pages are `lab-reproduced`: an automated run against a lab tenant returned the code. For **16** of them a sign-in log row was also read, and for **11** the page's KQL was run against exported lab rows.
- **84** pages are `documentation`: based on Microsoft's documentation and not marked as reproduced.
- **0** pages are `lab-verified` (the state where the author reviewed the page, captured the log row and ran every query).
- **14** lab runs with **505** recorded results, 25 to 31 October 2026, all in one lab tenant. A result is a measurement on that date; Microsoft can change behaviour and wording later.
- The **attack signal, category, MITRE mapping and KQL** are the site author's own reading, not Microsoft's. KQL thresholds are starting points.
- Known inconsistency, reported as-is: the page for `AADSTS501051` is marked `documentation` although three published runs returned that code. `lab_evidence` shows both facts.

Every tool result says where its data came from: the live file URL, or the bundled snapshot and why it was used.

## Privacy and network behaviour

- **No telemetry.** The only network traffic is plain `GET` requests for the static files listed at <https://brambrinkmeier.com/for-agents/> (`/api/aadsts/index.json`, `/api/aadsts/{code}.json`, `/aadsts.json`, `/graph-errors.json`, `/lab-runs.json`), sent with the header `User-Agent: aadsts-mcp/0.1.0 (+https://brambrinkmeier.com/for-agents/)`. No query strings, cookies, identifiers or tool arguments other than the code in the file path. Redirects are refused.
- **Pasted text never leaves the machine.** `extract_codes` makes no request at all, and it does not echo the text back: it returns the codes it found and a count of GUID-, address- or IP-shaped values it saw, never the values.
- The site's host (Cloudflare) processes request data such as your IP address, as any web server does; see the site's [Datenschutz page](https://brambrinkmeier.com/datenschutz/).
- Files are cached in memory for six hours. Nothing is written to disk.
- **Offline mode:** set `AADSTS_MCP_OFFLINE=1` and the server makes no network requests; every answer comes from the bundled snapshot.
- The published data replaces lab-tenant identifiers with placeholders such as `{tenant-id}` and `{app-id}`; the snapshot is the same redacted data, and the tests scan it for any GUID, address or IP outside a short list of Microsoft-published identifiers.

## Install and configure

Requires Node.js 20 or later. From a clone of this repository:

```sh
cd mcp
node src/server.mjs   # speaks MCP on stdin/stdout; Ctrl+C to stop
```

Claude Desktop (`claude_desktop_config.json`) or any client that takes the same shape:

```json
{
  "mcpServers": {
    "aadsts": {
      "command": "node",
      "args": ["/absolute/path/to/aadsts-dataset/mcp/src/server.mjs"]
    }
  }
}
```

Claude Code:

```sh
claude mcp add aadsts -- node /absolute/path/to/aadsts-dataset/mcp/src/server.mjs
```

Add `"env": { "AADSTS_MCP_OFFLINE": "1" }` (or `-e AADSTS_MCP_OFFLINE=1`) for offline use. The package is not published to npm or to any MCP registry.

The server uses Node's built-in `fetch`, which by default does not read `HTTPS_PROXY`. Behind a proxy, run offline or see Node's `NODE_USE_ENV_PROXY` setting for your Node version. When the site cannot be reached, answers come from the snapshot and say so.

## Offline snapshot

`snapshot/` holds the same JSON files as the site, used when the site cannot be reached, when a live file fails a shape check, or in offline mode. A live `404` is reported as "no page for this code" and is not overridden by the snapshot. `snapshot/SNAPSHOT.json` records where and when the snapshot was taken.

Refresh it with:

```sh
npm run snapshot                                     # from https://brambrinkmeier.com
node scripts/update-snapshot.mjs --from-dist <dir>   # from a local build of the site
```

Both check every file against the site's `/checksums.json` and refuse to write if any identifier outside the allow-list appears.

## Tests

```sh
cd mcp
npm install   # dev dependency only: the official MCP SDK client, used in one interoperability test
npm test
```

The tests cover code extraction (and that extraction never touches the network or echoes identifiers), the exact request the server sends (method, path, User-Agent, no other headers) against a local HTTP server, snapshot fallback on errors, non-JSON responses and unreachable hosts, every tool against the snapshot, raw JSON-RPC behaviour, a round trip with the official MCP SDK client over stdio, and a scan of every shipped file for identifiers.

## License

Code in `mcp/src`, `mcp/scripts` and `mcp/test`: MIT (see `LICENSE`). The data in `mcp/snapshot` is the site's data: CC BY 4.0 for the author's own text and classification fields, Bram Brinkmeier, <https://brambrinkmeier.com/>; quoted Microsoft wording belongs to Microsoft.

Corrections to the data go to the [issues of this repository](https://github.com/GrantZero604/aadsts-dataset/issues).

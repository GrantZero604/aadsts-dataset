// The four tools. Each handler returns {text, data}: `text` is a short plain summary for the model,
// `data` the structured result (sent as structuredContent). Every result names where its data came from
// (live file URL, or the bundled snapshot and why) and the verification state the site records, so a
// documentation-only page is never presented as lab-tested.
import { normalizeCode } from './data.mjs';
import { extractCodes } from './extract.mjs';

const SITE_NOTE = "Classification fields (attack signal, category, MITRE, KQL) are the site author's reading, not Microsoft's.";

const VERIFICATION_TEXT = {
  documentation: 'documentation (the page is based on Microsoft documentation and is not marked lab-reproduced)',
  'lab-reproduced': 'lab-reproduced (an automated run in a lab tenant returned this code)',
  'lab-verified': 'lab-verified (log row captured and queries run against it)',
};

export const TOOL_DEFINITIONS = [
  {
    name: 'lookup_aadsts_code',
    title: 'Look up an AADSTS code',
    description:
      'Return the brambrinkmeier.com page record for one Entra ID AADSTS sign-in error code: meaning, Microsoft wording as quoted, attack signal, MITRE ATT&CK techniques, Conditional Access notes, fix, KQL, verification state and sources. Accepts "AADSTS50126" or "50126". Reads a static JSON file from brambrinkmeier.com, or the bundled snapshot when the site is unreachable.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'AADSTS code, with or without the AADSTS prefix, e.g. "AADSTS50126" or "50126"' },
        include: {
          type: 'string',
          enum: ['summary', 'full'],
          description: '"summary" (default): key facts, fix and KQL. "full": the complete record including every page section.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
    annotations: { title: 'Look up an AADSTS code', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'search_aadsts',
    title: 'Search AADSTS and Graph error pages',
    description:
      'Search the AADSTS code pages (and the Microsoft Graph error-code pages) on brambrinkmeier.com by code, error name or words in the title, with optional filters for attack signal, category, MITRE technique and lab reproduction. Returns matching codes with title, URL and verification state.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words, an error name (e.g. "InvalidUserNameOrPassword") or a code; may be empty when filters are given' },
        attackSignal: { type: 'string', enum: ['high', 'medium', 'low'] },
        category: { type: 'string', description: 'e.g. credentials, mfa, conditional-access, consent, app-config, token, device, b2b-tenant' },
        mitre: { type: 'string', description: 'MITRE ATT&CK technique id, e.g. T1110.003' },
        labReproducedOnly: { type: 'boolean', description: 'Only codes a lab run reproduced' },
        includeGraph: { type: 'boolean', description: 'Also search Microsoft Graph error codes (default true)' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 10' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Search AADSTS and Graph error pages', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'extract_codes',
    title: 'Extract error codes from pasted text',
    description:
      'Find AADSTS codes (and Microsoft Graph error code names the site documents) in pasted error text: browser error pages, OAuth error responses, sign-in log rows, PowerShell or CLI output. Runs entirely on this machine: no network request is made and the text is not stored or echoed back. Reports for each code whether the site has a page for it; use lookup_aadsts_code for the details.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The pasted error text (up to 200,000 characters are read)' } },
      required: ['text'],
      additionalProperties: false,
    },
    annotations: { title: 'Extract error codes from pasted text', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'lab_evidence',
    title: 'Lab evidence for a code',
    description:
      'Return what the lab runs published on brambrinkmeier.com recorded for one code: each run that expected or returned it, with date, scenario, expected and returned code and the first message line (lab identifiers replaced with placeholders), plus the page\'s own verification state. Accepts an AADSTS code or a Microsoft Graph error code name such as "Authorization_RequestDenied". An empty result means no published lab run names the code.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'AADSTS code ("AADSTS50034" or "50034") or Graph error code name' } },
      required: ['code'],
      additionalProperties: false,
    },
    annotations: { title: 'Lab evidence for a code', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
];

export class ToolInputError extends Error {}

function describeSource(src) {
  if (!src) return 'unknown';
  if (src.kind === 'live') return `live file ${src.url}`;
  return `bundled snapshot (data generated ${src.dataGeneratedAt}; ${src.reason})`;
}

/** Shorten a Markdown section for the summary view. */
function clip(s, n = 1200) {
  if (!s) return s;
  return s.length > n ? `${s.slice(0, n).trimEnd()} [...]` : s;
}

export function createHandlers(ds) {
  async function lookup({ code, include = 'summary' }) {
    const c = normalizeCode(code ?? '');
    if (!c) throw new ToolInputError('code must be an AADSTS code: 4 to 7 digits, with or without the AADSTS prefix');
    if (include !== 'summary' && include !== 'full') throw new ToolInputError('include must be "summary" or "full"');
    const res = await ds.record(c);
    if (!res.value) {
      const data = {
        code: c,
        found: false,
        source: res.source,
        microsoftErrorLookup: `https://login.microsoftonline.com/error?code=${c}`,
        microsoftErrorReference: 'https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes',
      };
      return {
        text: `brambrinkmeier.com has no page for AADSTS${c} (checked: ${describeSource(res.source)}). Microsoft's own lookup: ${data.microsoftErrorLookup}`,
        data,
      };
    }
    const r = res.value;
    const sr = r.securityReading ?? {};
    const summary = {
      code: r.code,
      found: true,
      name: r.name,
      title: r.title,
      url: r.url,
      summary: r.summary,
      verification: r.verification,
      labReproduced: r.labReproduced,
      inMicrosoftReference: r.inMicrosoftReference,
      microsoftWording: r.microsoftWording,
      securityReading: {
        category: sr.category ?? null,
        kind: sr.kind ?? null,
        attackSignal: sr.attackSignal ?? null,
        mitre: sr.mitre ?? [],
        tables: sr.tables ?? [],
        isItAnAttack: include === 'full' ? sr.isItAnAttack : clip(sr.isItAnAttack),
        conditionalAccess: sr.conditionalAccess ?? null,
      },
      fix: r.fix,
      kql: r.kql ?? [],
      labRunCount: (r.labRuns ?? []).length,
      related: r.related ?? [],
      sources: r.sources ?? [],
      lastUpdated: r.lastUpdated,
      alternates: r.alternates,
      license: r.license,
      attribution: r.attribution,
      source: res.source,
      note: SITE_NOTE,
    };
    const data = include === 'full' ? { ...r, found: true, source: res.source, note: SITE_NOTE } : summary;

    const lines = [
      `${r.title}`,
      `Page: ${r.url}`,
      `Verification: ${VERIFICATION_TEXT[r.verification] ?? r.verification}${r.labReproduced ? `, reproduced ${r.labReproduced.date}` : ''}.`,
      `In Microsoft's error reference: ${r.inMicrosoftReference ? 'yes' : 'no'}.`,
    ];
    if (r.summary) lines.push('', `Short answer: ${r.summary}`);
    if (r.microsoftWording?.text) lines.push('', `Microsoft wording (${r.microsoftWording.source}): ${r.microsoftWording.text}`);
    if (sr.attackSignal) lines.push('', `Attack signal: ${sr.attackSignal.label}.`);
    if (sr.mitre?.length) lines.push(`MITRE ATT&CK: ${sr.mitre.map((m) => `${m.id}${m.name ? ` ${m.name}` : ''}`).join('; ')}.`);
    if (sr.tables?.length) lines.push(`Log tables: ${sr.tables.join(', ')}.`);
    if (r.fix?.short) lines.push('', `Fix: ${r.fix.short}`);
    if (r.kql?.length) {
      lines.push('', `KQL (${r.kql.length} quer${r.kql.length === 1 ? 'y' : 'ies'}${r.labReproduced?.kqlTested ? `, run against exported lab rows on ${r.labReproduced.kqlTested}` : ', not run against lab data'}):`);
      for (const q of r.kql) lines.push(`${q.leadIn ? `${q.leadIn}\n` : ''}${q.query}`, '');
    }
    lines.push(`${SITE_NOTE} Data: ${describeSource(res.source)}. License: ${r.license}; ${r.attribution}.`);
    return { text: lines.join('\n'), data };
  }

  async function search({ query = '', attackSignal, category, mitre, labReproducedOnly = false, includeGraph = true, limit = 10 }) {
    if (typeof query !== 'string') throw new ToolInputError('query must be a string');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ToolInputError('limit must be an integer from 1 to 50');
    if (!query.trim() && !attackSignal && !category && !mitre && !labReproducedOnly) throw new ToolInputError('give a query or at least one filter');

    const [idx, ds2, graph] = await Promise.all([ds.index(), ds.dataset(), includeGraph ? ds.graphErrors() : Promise.resolve(null)]);
    const byCode = new Map((ds2.value?.codes ?? []).map((d) => [d.code, d]));
    const q = query.trim().toLowerCase();
    const qCode = normalizeCode(query);
    const terms = q.replace(/aadsts/g, ' ').split(/[^a-z0-9_.]+/).filter((t) => t.length > 1);

    const scored = [];
    for (const e of idx.value?.codes ?? []) {
      const d = byCode.get(e.code) ?? {};
      if (attackSignal && e.attackSignal !== attackSignal) continue;
      if (category && d.category !== category) continue;
      if (mitre && !(d.mitre ?? []).some((m) => m.toLowerCase() === mitre.toLowerCase() || m.toLowerCase().startsWith(`${mitre.toLowerCase()}.`))) continue;
      if (labReproducedOnly && !e.labReproduced) continue;
      let score = q ? 0 : 1;
      if (qCode && e.code === qCode) score += 100;
      else if (qCode && e.code.startsWith(qCode)) score += 20;
      const hay = `${e.title} ${d.name ?? ''} ${d.category ?? ''} ${(d.mitre ?? []).join(' ')}`.toLowerCase();
      if (d.name && q && d.name.toLowerCase() === q) score += 50;
      for (const t of terms) if (hay.includes(t)) score += 5;
      if (q && score === 0) continue;
      scored.push({
        score,
        item: {
          type: 'aadsts',
          code: e.code,
          name: d.name ?? null,
          title: e.title,
          url: e.url,
          attackSignal: e.attackSignal,
          category: d.category ?? null,
          mitre: d.mitre ?? [],
          verification: d.verification ?? (e.labReproduced ? 'lab-reproduced' : 'documentation'),
          labReproduced: e.labReproduced,
          inMicrosoftReference: e.inMicrosoftReference,
        },
      });
    }
    if (graph?.value && !category && !mitre) {
      for (const g of graph.value.codes ?? []) {
        if (attackSignal && g.attackSignal !== attackSignal) continue;
        if (labReproducedOnly && !g.labReproduced) continue;
        let score = q ? 0 : 1;
        const hay = `${g.code} ${g.category ?? ''} ${g.labReproduced?.scenario ?? ''}`.toLowerCase();
        if (q && g.code.toLowerCase() === q) score += 100;
        for (const t of terms) if (hay.includes(t)) score += 5;
        if (q && score === 0) continue;
        scored.push({ score, item: { type: 'graph', code: g.code, httpStatus: g.httpStatus ?? null, url: g.url, attackSignal: g.attackSignal ?? null, category: g.category ?? null, labReproduced: !!g.labReproduced } });
      }
    }
    scored.sort((a, b) => b.score - a.score || String(a.item.code).localeCompare(String(b.item.code)));
    const results = scored.slice(0, limit).map((s) => s.item);
    const data = { query, total: scored.length, returned: results.length, results, sources: { index: idx.source, dataset: ds2.source, graph: graph?.source ?? null } };
    const text = results.length
      ? [`${scored.length} match(es), showing ${results.length}:`, ...results.map((r) => (r.type === 'aadsts' ? `- AADSTS${r.code} ${r.name ?? ''}: ${r.title} [${r.attackSignal ?? '?'} signal, ${r.verification}] ${r.url}` : `- Graph ${r.code} (HTTP ${r.httpStatus ?? '?'}) ${r.url}`)), `Data: ${describeSource(idx.source)}.`].join('\n')
      : `No matching pages. Data: ${describeSource(idx.source)}.`;
    return { text, data };
  }

  async function extract({ text }) {
    if (typeof text !== 'string') throw new ToolInputError('text must be a string');
    const index = ds.localIndex();
    const graph = ds.localGraphErrors();
    const known = {
      aadsts: new Set(index.codes.map((c) => c.code)),
      aadstsTitles: new Map(index.codes.map((c) => [c.code, { title: c.title, url: c.url }])),
      graph: (graph.codes ?? []).map((g) => g.code),
    };
    const out = extractCodes(text, known);
    const ids = out.identifierShapedValuesSeen;
    const idCount = ids.guids + ids.addresses + ids.ipv4;
    const data = { ...out, processedLocally: true, networkRequests: 0, pageListFrom: index.generatedAt ? `page index generated ${index.generatedAt}` : 'page index' };
    const lines = [];
    if (!out.codes.length && !out.graphCodes.length) lines.push('No AADSTS or known Graph error codes found in the text.');
    for (const c of out.codes) lines.push(`- AADSTS${c.code} (${c.mentions}x): ${c.hasPageOnSite ? `${c.title} ${c.url}` : 'no page on brambrinkmeier.com'}`);
    for (const g of out.graphCodes) lines.push(`- Graph ${g.code} (${g.mentions}x)`);
    lines.push(`Processed on this machine; no network request was made${idCount ? `. The text also held ${idCount} identifier-shaped value(s) (GUIDs, addresses or IPs); they were not returned or stored` : ''}.${out.truncated ? ' Only the first 200,000 characters were read.' : ''}`);
    return { text: lines.join('\n'), data };
  }

  async function evidence({ code }) {
    if (typeof code !== 'string' || !code.trim()) throw new ToolInputError('code must be a non-empty string');
    const aadsts = normalizeCode(code);
    const key = aadsts ?? code.trim();
    if (!aadsts && !/^[A-Za-z][A-Za-z0-9_]{2,80}$/.test(key)) throw new ToolInputError('code must be an AADSTS code or a Graph error code name');

    const runsRes = await ds.labRuns();
    const runs = runsRes.value?.runs ?? [];
    const rows = [];
    for (const run of runs) {
      for (const r of run.results ?? []) {
        const expected = r.expected ? String(r.expected).split('/').map((s) => s.trim()) : [];
        if (r.got === key || expected.includes(key)) {
          rows.push({ runId: run.id, date: run.date, run: run.run, kind: run.kind, method: r.method ?? run.method, scenario: r.scenario, request: r.request ?? null, httpStatus: r.httpStatus ?? null, expected: r.expected ?? null, got: r.got ?? null, matchedExpectation: r.matchedExpectation ?? null, message: r.message });
        }
      }
    }
    let page = null;
    if (aadsts) {
      const rec = await ds.record(aadsts);
      if (rec.value) page = { url: rec.value.url, verification: rec.value.verification, labReproduced: rec.value.labReproduced, source: rec.source };
      else page = { url: null, verification: null, labReproduced: null, source: rec.source };
    }
    const returned = rows.filter((r) => r.got === key).length;
    const data = {
      code: key,
      runsChecked: runs.length,
      rows,
      rowsThatReturnedCode: returned,
      page,
      labRunsFile: `${ds.baseUrl}/lab-runs.json`,
      semantics: runsRes.value?.semantics ?? null,
      source: runsRes.source,
    };
    const label = aadsts ? `AADSTS${aadsts}` : key;
    const lines = [];
    if (!rows.length) lines.push(`No published lab run expected or returned ${label} (${runs.length} runs checked).`);
    else {
      lines.push(`${rows.length} lab-run row(s) name ${label}; ${returned} returned it:`);
      for (const r of rows) lines.push(`- ${r.date} ${r.run ?? r.runId}: "${r.scenario}" expected ${r.expected ?? 'not recorded'}, got ${r.got ?? 'no response'}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ''}. First line: ${r.message}`);
    }
    if (page) {
      lines.push(page.url ? `Page verification state: ${VERIFICATION_TEXT[page.verification] ?? page.verification} (${page.url}).` : `brambrinkmeier.com has no page for ${label}.`);
      if (page.url && page.verification === 'documentation' && returned) lines.push(`Note: the page is still marked documentation although ${returned} published run(s) returned this code.`);
    }
    lines.push(`Each row is one measurement in one lab tenant on that date; Microsoft can change the behaviour later. Data: ${describeSource(runsRes.source)}.`);
    return { text: lines.join('\n'), data };
  }

  return { lookup_aadsts_code: lookup, search_aadsts: search, extract_codes: extract, lab_evidence: evidence };
}

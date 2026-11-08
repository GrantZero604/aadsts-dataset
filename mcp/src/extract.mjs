// Pull AADSTS codes (and known Microsoft Graph error codes) out of pasted error text. Pure function: no
// network, no file writes, nothing kept. The pasted text is not returned, not even as a snippet, because it
// can hold user names, tenant ids and IP addresses.
import { countIdentifiers } from './identifiers.mjs';

export const MAX_INPUT_CHARS = 200_000;

// Each pattern captures a 4-7 digit code. Order matters only for the `matchedBy` label of the first hit.
const PATTERNS = [
  { name: 'AADSTS prefix', re: /\bAADSTS(\d{4,7})\b/gi },
  // OAuth error responses: "error_codes":[50126,50076]
  { name: 'error_codes array', re: /"error_codes"\s*:\s*\[([\d,\s]+)\]/gi, list: true },
  // Sign-in log exports and portal text: "errorCode": 50126, "ResultType": "50126", Error code 50126, Error Code: 50126
  { name: 'errorCode field', re: /"?errorCode"?\s*[:=]\s*"?(\d{4,7})\b/gi },
  { name: 'ResultType field', re: /\bResultType"?\s*(?:[:=]=?|==)\s*"?(\d{4,7})\b/gi },
  { name: 'Error code label', re: /\bError\s+code\s*:?\s*(\d{4,7})\b/gi },
];

/**
 * @param {string} text pasted error text
 * @param {object} known
 * @param {Set<string>} known.aadsts codes that have a page on the site (from the snapshot or the live cache)
 * @param {Map<string, object>} [known.aadstsTitles] code -> {title, url}
 * @param {string[]} [known.graph] Microsoft Graph error code names the site documents
 */
export function extractCodes(text, known = { aadsts: new Set() }) {
  if (typeof text !== 'string') throw new Error('text must be a string');
  const truncated = text.length > MAX_INPUT_CHARS;
  const input = truncated ? text.slice(0, MAX_INPUT_CHARS) : text;

  const found = new Map(); // code -> {first, count, matchedBy:Set}
  const add = (code, index, how) => {
    const e = found.get(code) ?? { first: index, count: 0, matchedBy: new Set() };
    e.count += 1;
    e.first = Math.min(e.first, index);
    e.matchedBy.add(how);
    found.set(code, e);
  };

  // The patterns do not overlap on the same characters, so each mention is counted once.
  for (const p of PATTERNS) {
    for (const m of input.matchAll(p.re)) {
      if (p.list) {
        for (const part of m[1].split(',')) {
          const c = part.trim();
          if (/^\d{4,7}$/.test(c)) add(c, m.index, p.name);
        }
      } else {
        add(m[1], m.index, p.name);
      }
    }
  }

  const codes = [...found.entries()]
    .sort((a, b) => a[1].first - b[1].first)
    .map(([code, e]) => {
      const page = known.aadstsTitles?.get(code);
      return {
        code,
        aadsts: `AADSTS${code}`,
        mentions: e.count,
        matchedBy: [...e.matchedBy],
        hasPageOnSite: known.aadsts.has(code),
        ...(page ? { title: page.title, url: page.url } : {}),
      };
    });

  const graph = [];
  for (const name of known.graph ?? []) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    const n = [...input.matchAll(re)].length;
    if (n) graph.push({ code: name, mentions: n });
  }

  return {
    codes,
    graphCodes: graph,
    identifierShapedValuesSeen: countIdentifiers(input),
    inputChars: text.length,
    truncated,
  };
}

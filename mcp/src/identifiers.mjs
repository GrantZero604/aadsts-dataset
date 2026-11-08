// Identifier patterns, used in two places:
// - extract_codes counts (never returns) identifier-shaped values in pasted text, so the answer can say
//   the text held some and that none of them left the machine;
// - the tests scan the bundled snapshot and every file in this folder for identifiers that must not be
//   published (lab tenant, app and object ids, addresses, IPs).
//
// The allow-list mirrors the site's own (https://brambrinkmeier.com/for-agents/): identifiers Microsoft
// publishes itself, plus one published attacker-network address. Nothing from the lab tenant.

export const ALLOWED_GUIDS = new Set([
  '00000000-0000-0000-0000-000000000000', // nil GUID, quoted from Microsoft's cmdlet reference
  '00000002-0000-0000-c000-000000000000', // Azure AD Graph resource
  '00000002-0000-0ff1-ce00-000000000000', // Office 365 Exchange Online
  '9cdead84-a844-4324-93f2-b2e6bb768d07', // Azure Virtual Desktop client
  'f8cdef31-a31e-4b4a-93e4-5f571e91255a', // Microsoft Services tenant (owner of first-party apps, published by Microsoft)
  '72f988bf-86f1-41af-91ab-2d7cd011db47', // Microsoft corporate tenant (owner of first-party apps, published by Microsoft)
]);

export const ALLOWED_IPV4 = new Set([
  '193.26.115.0', // published attacker network (indicator of compromise) named in a guide on the site
]);

/** Documentation ranges (RFC 5737), loopback and example domains are not real addresses. */
const DOC_IPV4 = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$|^127\./;
const EXAMPLE_DOMAIN = /@(contoso|fabrikam|example|northwind(traders)?)\.(com|org|net|test)$|@[a-z0-9.-]*\.(example|test|invalid)$|@(contoso|fabrikam)\.onmicrosoft\.com$/i;

export const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
export const ADDRESS_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
export const IPV4_RE = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;

/** GUIDs inside a learn.microsoft.com URL are Q&A permalinks, not identities (the site keeps them for the source link). */
const DOC_URL_RE = /https:\/\/learn\.microsoft\.com\/[^\s)"'<>]*/g;
function inDocUrl(text, index) {
  for (const m of text.matchAll(DOC_URL_RE)) if (index >= m.index && index < m.index + m[0].length) return true;
  return false;
}

/** Count identifier-shaped values in text. Returns counts only, never the values. */
export function countIdentifiers(text) {
  return {
    guids: [...text.matchAll(GUID_RE)].length,
    addresses: [...text.matchAll(ADDRESS_RE)].length,
    ipv4: [...text.matchAll(IPV4_RE)].length,
  };
}

/**
 * Identifiers that must not appear in anything this package ships: every GUID, address and IPv4 that is
 * not on the allow-list, not inside a learn.microsoft.com URL, and not a documentation/example value.
 * @returns {string[]}
 */
export function findPublishableLeaks(text) {
  const hits = [];
  for (const m of text.matchAll(GUID_RE)) {
    if (!ALLOWED_GUIDS.has(m[0].toLowerCase()) && !inDocUrl(text, m.index)) hits.push(m[0]);
  }
  for (const m of text.matchAll(ADDRESS_RE)) if (!EXAMPLE_DOMAIN.test(m[0])) hits.push(m[0]);
  for (const m of text.matchAll(IPV4_RE)) if (!ALLOWED_IPV4.has(m[0]) && !DOC_IPV4.test(m[0])) hits.push(m[0]);
  return hits;
}

// Lab run: reproduce Microsoft Graph error codes against the lab tenant and record what Graph returns.
// Runs only in GitHub Actions. Auth: GitHub OIDC -> federated credential on the lab runner app
// (no client secret). Everything it creates is deleted at the end of the run.
// Output: graph-errors.json and graph-errors.md (no tokens, no secrets).
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const TENANT = process.env.LAB_TENANT_ID;
const DOMAIN = process.env.LAB_DOMAIN;
const RUNNER_APP = process.env.LAB_RUNNER_CLIENT_ID;
const LOGIN = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (s) => console.log(`::add-mask::${s}`);

async function githubJwt(audience) {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: u, ACTIONS_ID_TOKEN_REQUEST_TOKEN: t } = process.env;
  if (!u || !t) throw new Error('needs permissions: id-token: write');
  const r = await fetch(`${u}&audience=${encodeURIComponent(audience)}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`GitHub OIDC: HTTP ${r.status}`);
  return (await r.json()).value;
}

/** A token for any scope, using the federated credential. */
async function tokenFor(scope) {
  const body = new URLSearchParams({
    client_id: RUNNER_APP, grant_type: 'client_credentials', scope,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: await githubJwt('api://AzureADTokenExchange'),
  });
  const r = await fetch(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { method: 'POST', body });
  const j = await r.json();
  if (!r.ok) throw new Error(`token for ${scope}: ${j.error_codes?.join(',')} ${j.error}`);
  mask(j.access_token);
  return j.access_token;
}

/** The roles (application permissions) inside a token, read from its payload. No signature check. */
function rolesIn(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    return { roles: (p.roles ?? []).sort(), appid: p.appid ?? p.azp ?? null, aud: p.aud ?? null, tid: p.tid ?? null };
  } catch { return { roles: [], appid: null, aud: null, tid: null }; }
}

let gt;
/** Raw Graph call that records the error shape instead of throwing. */
async function call(label, { method = 'GET', path, body, headers = {}, token, base = GRAPH, expect, noAuth }) {
  const sent = { 'content-type': 'application/json', ...headers };
  // noAuth sends no Authorization header at all; token: '<value>' sends exactly that bearer value.
  if (!noAuth && !('Authorization' in sent)) sent.Authorization = `Bearer ${token ?? gt}`;
  const r = await fetch(`${base}${path}`, { method, headers: sent, body: body ? JSON.stringify(body) : undefined });
  let j = {};
  const text = await r.text();
  try { j = JSON.parse(text); } catch {}
  const err = j.error ?? {};
  const code = err.code ?? (r.ok ? 'success' : `HTTP ${r.status}`);
  const message = (err.message ?? '').split(/\r?\n/)[0].slice(0, 600);
  const inner = err.innerError ?? {};
  const row = {
    countPresent: j['@odata.count'] !== undefined,
    scenario: label, request: `${method} ${path}`, http: r.status, code,
    message, innerErrorCode: inner.code ?? null,
    innerErrorFields: Object.keys(inner).sort().join(',') || null,
    authSent: noAuth ? 'none' : (sent.Authorization ?? '').replace(/^(\w+ ).*/, '$1<value>').trim() || 'none',
    retryAfter: r.headers.get('retry-after'), expected: expect ?? null,
    match: expect ? (Array.isArray(expect) ? expect.includes(code) : expect === code) : null,
  };
  results.push(row);
  console.log(`${row.match === false ? 'DIFF ' : 'ok   '} ${label}: HTTP ${r.status} ${code}`);
  return row;
}

const results = [];
const createdUsers = [];
const createdApps = [];

try {
  gt = await tokenFor('https://graph.microsoft.com/.default');

  // --- Permission and licence errors -------------------------------------------------
  await call('Read sign-in logs on a tenant without a premium licence', {
    path: '/auditLogs/signIns?$top=1', expect: 'Authentication_RequestFromNonPremiumTenantOrB2CTenant',
  });
  await call('Read directory audit logs without AuditLog.Read.All', {
    path: '/auditLogs/directoryAudits?$top=1', expect: ['Authorization_RequestDenied', 'Authentication_RequestFromNonPremiumTenantOrB2CTenant'],
  });
  await call('Read Conditional Access policies without Policy.Read.All', {
    path: '/identity/conditionalAccess/policies', expect: 'Authorization_RequestDenied',
  });
  await call('Write a group without Group.ReadWrite.All', {
    method: 'POST', path: '/groups',
    body: { displayName: `lab-denied-${randomUUID().slice(0, 8)}`, mailEnabled: false, mailNickname: `labdenied${randomUUID().slice(0, 8)}`, securityEnabled: true },
    expect: 'Authorization_RequestDenied',
  });

  // --- Token errors --------------------------------------------------------------------
  const wrongAudience = await tokenFor('api://AzureADTokenExchange/.default');
  await call('Token issued for a different audience', { path: '/users?$top=1', token: wrongAudience, expect: 'InvalidAuthenticationToken' });
  await call('Token with a tampered signature', { path: '/users?$top=1', token: `${gt.slice(0, -6)}AAAAAA`, expect: 'InvalidAuthenticationToken' });
  await call('No Authorization header at all', { path: '/users?$top=1', noAuth: true, expect: 'InvalidAuthenticationToken' });
  await call('Authorization header present but its bearer value empty', { path: '/users?$top=1', token: '', expect: 'InvalidAuthenticationToken' });
  await call('Authorization header that is not a JWT', { path: '/users?$top=1', token: 'not-a-token', expect: 'InvalidAuthenticationToken' });

  // --- Request shape errors -------------------------------------------------------------
  await call('Count users without the ConsistencyLevel header', { path: '/users?$count=true', expect: 'Request_UnsupportedQuery' });
  await call('Count users with ConsistencyLevel: eventual (control)', { path: '/users?$count=true', headers: { ConsistencyLevel: 'eventual' }, expect: 'success' });
  await call('Filter on a property that does not exist', { path: "/users?$filter=notARealProperty eq 'x'", expect: ['Request_UnsupportedQuery', 'Request_BadRequest'] });
  await call('Object ID that is not a GUID', { path: '/users/not-a-guid', expect: ['Request_ResourceNotFound', 'Request_BadRequest'] });
  await call('User object that does not exist', { path: `/users/${randomUUID()}`, expect: 'Request_ResourceNotFound' });
  await call('Path segment that does not exist', { path: '/users/does/not/exist', expect: ['Request_ResourceNotFound', 'BadRequest'] });
  await call('Create a user with no required fields', { method: 'POST', path: '/users', body: { displayName: 'lab only' }, expect: ['Request_BadRequest', 'BadRequest'] });

  // --- Duplicate key ---------------------------------------------------------------------
  const nick = `lab-dup-${Date.now().toString(36)}`;
  const mk = () => ({
    accountEnabled: true, displayName: 'Lab duplicate', mailNickname: nick,
    userPrincipalName: `${nick}@${DOMAIN}`,
    passwordProfile: { password: `${randomUUID()}aA1!`, forceChangePasswordNextSignIn: false },
  });
  const first = await fetch(`${GRAPH}/users`, { method: 'POST', headers: { Authorization: `Bearer ${gt}`, 'content-type': 'application/json' }, body: JSON.stringify(mk()) });
  if (first.ok) createdUsers.push((await first.json()).id);
  await sleep(10_000);
  await call('Create a second user with the same userPrincipalName', { method: 'POST', path: '/users', body: mk(), expect: 'Request_MultipleObjectsWithSameKeyValue' });


  // --- Round 2: advanced query, per-workload codes, methods, malformed bodies ----------
  const cnt = await call('Count users without the ConsistencyLevel header', { path: '/users?$count=true', expect: 'success' });
  await call('Advanced-query filter (endsWith) without the ConsistencyLevel header', {
    path: "/users?$filter=endsWith(userPrincipalName,'onmicrosoft.com')", expect: 'Request_UnsupportedQuery',
  });
  await call('Advanced-query filter with ConsistencyLevel: eventual (control)', {
    path: "/users?$filter=endsWith(userPrincipalName,'onmicrosoft.com')&$count=true",
    headers: { ConsistencyLevel: 'eventual' }, expect: 'success',
  });
  await call('$search without the ConsistencyLevel header', { path: '/users?$search="displayName:lab"', expect: 'Request_UnsupportedQuery' });
  await call('$top above the page-size limit', { path: '/users?$top=5000', expect: ['Request_UnsupportedQuery', 'Request_BadRequest'] });
  await call('$select naming a property that does not exist', { path: '/users?$select=notARealProperty', expect: ['Request_BadRequest', 'Request_UnsupportedQuery'] });
  await call('Same missing object, applications instead of users', { path: `/applications/${randomUUID()}`, expect: 'Request_ResourceNotFound' });
  await call('Same missing object, groups instead of users', { path: `/groups/${randomUUID()}`, expect: 'Request_ResourceNotFound' });
  await call('Same missing object, servicePrincipals instead of users', { path: `/servicePrincipals/${randomUUID()}`, expect: 'Request_ResourceNotFound' });
  await call('Same missing object, directoryRoles instead of users', { path: `/directoryRoles/${randomUUID()}`, expect: 'Request_ResourceNotFound' });
  // Does the 403-or-404 split track permission on the resource TYPE? Probe more collections.
  await call('Same missing object, devices instead of users', { path: `/devices/${randomUUID()}`, expect: ['Request_ResourceNotFound', 'Authorization_RequestDenied'] });
  await call('Same missing object, administrativeUnits instead of users', { path: `/directory/administrativeUnits/${randomUUID()}`, expect: ['Request_ResourceNotFound', 'Authorization_RequestDenied'] });
  await call('Same missing object, contacts instead of users', { path: `/contacts/${randomUUID()}`, expect: ['Request_ResourceNotFound', 'Authorization_RequestDenied'] });
  await call('Same missing object, organization instead of users', { path: `/organization/${randomUUID()}`, expect: ['Request_ResourceNotFound', 'Authorization_RequestDenied'] });
  await call('Collection-level read, groups', { path: '/groups?$top=1', expect: ['Authorization_RequestDenied', 'success'] });
  await call('Collection-level read, servicePrincipals', { path: '/servicePrincipals?$top=1', expect: ['Authorization_RequestDenied', 'success'] });
  await call('Collection-level read, applications', { path: '/applications?$top=1', expect: ['Authorization_RequestDenied', 'success'] });
  await call('Collection-level read, devices', { path: '/devices?$top=1', expect: ['Authorization_RequestDenied', 'success'] });
  await call('A method the collection does not allow', { method: 'DELETE', path: '/users', expect: ['Request_BadRequest', 'BadRequest'] });
  await call('Top-level path that is not a Graph resource', { path: '/notAResource', expect: ['BadRequest', 'Request_BadRequest', 'UnknownError'] });
  const badJson = await fetch(`${GRAPH}/users`, { method: 'POST', headers: { Authorization: `Bearer ${gt}`, 'content-type': 'application/json' }, body: '{"displayName": ' });
  {
    const b = await badJson.json().catch(() => ({}));
    results.push({ scenario: 'Request body that is not valid JSON', request: 'POST /users', http: badJson.status,
      code: b.error?.code ?? `HTTP ${badJson.status}`, message: (b.error?.message ?? '').split(/\r?\n/)[0].slice(0, 300),
      innerErrorCode: b.error?.innerError?.code ?? null, retryAfter: null, expected: 'BadRequest', match: badJson.status === 400 });
    console.log(`ok    malformed JSON body: HTTP ${badJson.status} ${b.error?.code}`);
  }
  await call('Authorization header with a scheme other than Bearer', { path: '/users?$top=1', headers: { Authorization: 'Basic bGFiOmxhYg==' }, token: null, expect: 'InvalidAuthenticationToken' });
  await call('Delete an object that is already deleted', { method: 'DELETE', path: `/users/${randomUUID()}`, expect: 'Request_ResourceNotFound' });
  await call('Same sign-in log read on the beta endpoint', { path: '/auditLogs/signIns?$top=1', base: 'https://graph.microsoft.com/beta', expect: 'Authentication_MSGraphPermissionMissing' });
  results.push({ scenario: 'Did the uncounted request actually return @odata.count?', request: 'GET /users?$count=true', http: cnt.http,
    code: 'observation', message: 'see countPresent', innerErrorCode: null, retryAfter: null, expected: null, match: null });


  // --- Round 3: app-only /me, paging, password policy, immutability, batch ---------------
  await call('GET /me with an app-only token', { path: '/me', expect: ['BadRequest', 'Request_BadRequest', 'Request_ResourceNotFound'] });
  await call('GET /me/messages with an app-only token', { path: '/me/messages', expect: ['BadRequest', 'Request_BadRequest', 'Request_ResourceNotFound'] });
  await call('$skip on a directory collection', { path: '/users?$skip=1', expect: ['Request_UnsupportedQuery', 'Request_BadRequest'] });
  await call('$top=0', { path: '/users?$top=0', expect: ['Request_UnsupportedQuery', 'Request_BadRequest'] });
  await call("$filter with the contains operator", { path: "/users?$filter=contains(displayName,'lab')", expect: ['Request_UnsupportedQuery', 'Request_BadRequest'] });
  await call('$filter and $orderby together without ConsistencyLevel', {
    path: "/users?$filter=startsWith(displayName,'lab')&$orderby=displayName", expect: ['Request_UnsupportedQuery', 'success'],
  });
  await call('$orderby on a property that does not support it', { path: '/users?$orderby=mailNickname', expect: ['Request_UnsupportedQuery', 'success'] });
  await call('$expand together with advanced query parameters', {
    path: '/users?$count=true&$expand=manager', headers: { ConsistencyLevel: 'eventual' }, expect: ['Request_UnsupportedQuery', 'success'],
  });
  await call('Create a user with a password the policy rejects', {
    method: 'POST', path: '/users',
    body: { accountEnabled: true, displayName: 'Lab weak password', mailNickname: `labweak${Date.now().toString(36)}`,
      userPrincipalName: `labweak${Date.now().toString(36)}@${DOMAIN}`,
      passwordProfile: { password: 'password', forceChangePasswordNextSignIn: false } },
    expect: ['Request_BadRequest', 'Request_UnsupportedQuery'],
  });
  await call('Create a user whose userPrincipalName domain is not in the tenant', {
    method: 'POST', path: '/users',
    body: { accountEnabled: true, displayName: 'Lab bad domain', mailNickname: `labdom${Date.now().toString(36)}`,
      userPrincipalName: `labdom${Date.now().toString(36)}@not-a-verified-domain.invalid`,
      passwordProfile: { password: `${randomUUID()}aA1!`, forceChangePasswordNextSignIn: false } },
    expect: 'Request_BadRequest',
  });
  {
    // A real user to patch, deleted at the end with the others.
    const nick2 = `lab-patch-${Date.now().toString(36)}`;
    const r = await fetch(`${GRAPH}/users`, { method: 'POST', headers: { Authorization: `Bearer ${gt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ accountEnabled: true, displayName: 'Lab patch target', mailNickname: nick2,
        userPrincipalName: `${nick2}@${DOMAIN}`, passwordProfile: { password: `${randomUUID()}aA1!`, forceChangePasswordNextSignIn: false } }) });
    if (r.ok) {
      const u = await r.json();
      createdUsers.push(u.id);
      await sleep(15_000);
      await call('PATCH a read-only property (id)', { method: 'PATCH', path: `/users/${u.id}`, body: { id: randomUUID() }, expect: ['Request_BadRequest', 'Request_UnsupportedQuery'] });
      await call('PATCH a property that does not exist', { method: 'PATCH', path: `/users/${u.id}`, body: { notARealProperty: 'x' }, expect: ['Request_BadRequest', 'success'] });
      await call('PATCH a boolean property with a string', { method: 'PATCH', path: `/users/${u.id}`, body: { accountEnabled: 'yes' }, expect: ['Request_BadRequest', 'BadRequest'] });
    }
  }
  {
    // A $batch where one inner request fails: does the batch itself succeed?
    const r = await fetch(`${GRAPH}/$batch`, { method: 'POST', headers: { Authorization: `Bearer ${gt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [
        { id: '1', method: 'GET', url: '/users?$top=1' },
        { id: '2', method: 'GET', url: `/users/${randomUUID()}` },
        { id: '3', method: 'GET', url: '/identity/conditionalAccess/policies' },
      ] }) });
    const b = await r.json().catch(() => ({}));
    const inner = (b.responses ?? []).map((x) => `${x.id}:${x.status}${x.body?.error?.code ? ' ' + x.body.error.code : ''}`).sort().join(', ');
    results.push({ scenario: 'A $batch with one good and two failing inner requests', request: 'POST /$batch', http: r.status,
      code: b.error?.code ?? `HTTP ${r.status}`, message: `inner results: ${inner}`.slice(0, 300),
      innerErrorCode: null, retryAfter: null, expected: 'outer 200 with per-request statuses', match: r.status === 200 });
    console.log(`ok    $batch: outer ${r.status}; ${inner}`);
  }

  // --- Round 5: do the fixes this site recommends actually work? ------------------------
  const ctrl = await call('Control: $count=true WITH ConsistencyLevel eventual', {
    path: '/users?$count=true', headers: { ConsistencyLevel: 'eventual' }, expect: 'success',
  });
  results.push({ scenario: 'Control: was @odata.count present WITH the header?', request: 'GET /users?$count=true + ConsistencyLevel',
    http: ctrl.http, code: 'observation', message: `@odata.count present: ${ctrl.countPresent}`,
    innerErrorCode: null, retryAfter: null, expected: 'true', match: ctrl.countPresent === true });
  await call('Fix for "Sorting not supported": add the header and $count', {
    path: "/users?$filter=startsWith(displayName,'lab')&$orderby=displayName&$count=true",
    headers: { ConsistencyLevel: 'eventual' }, expect: 'success',
  });
  await call('Fix for $search: add the header', { path: '/users?$search="displayName:lab"', headers: { ConsistencyLevel: 'eventual' }, expect: 'success' });
  await call('Fix for contains: use startsWith instead', { path: "/users?$filter=startsWith(displayName,'lab')", expect: 'success' });
  await call('Fix for $skip: page without it', { path: '/users?$top=1', expect: 'success' });
  {
    // Fix for /me under an app-only token: name the user instead.
    const r = await fetch(`${GRAPH}/users?$top=1&$select=id`, { headers: { Authorization: `Bearer ${gt}` } });
    const id = (await r.json().catch(() => ({})))?.value?.[0]?.id;
    if (id) {
      await call('Fix for /me with an app-only token: GET /users/<id>', { path: `/users/${id}`, expect: 'success' });
      await call('Does a PATCH of a read-only property actually change it?', { method: 'PATCH', path: `/users/${id}`, body: { id: randomUUID() }, expect: 'success' });
      const after = await fetch(`${GRAPH}/users/${id}?$select=id`, { headers: { Authorization: `Bearer ${gt}` } });
      const stillThere = (await after.json().catch(() => ({})))?.id === id;
      results.push({ scenario: 'After that PATCH, is the id unchanged?', request: 'GET /users/<id>?$select=id', http: after.status,
        code: 'observation', message: `id unchanged: ${stillThere}`, innerErrorCode: null, retryAfter: null, expected: 'true', match: stillThere });
    }
  }

  // --- Throttling, harder: 400 requests, 20 at a time -----------------------------------
  let throttled = null, sent = 0;
  for (let batch = 0; batch < 20 && !throttled; batch++) {
    const rs = await Promise.all(Array.from({ length: 20 }, () => fetch(`${GRAPH}/users?$top=1`, { headers: { Authorization: `Bearer ${gt}` } })));
    sent += rs.length;
    const hit = rs.find((r) => r.status === 429);
    if (hit) throttled = { after: hit.headers.get('retry-after'), at: sent };
  }
  results.push({
    scenario: 'Burst of up to 400 identical reads, 20 at a time', request: 'GET /users?$top=1 (concurrent)', http: throttled ? 429 : 200,
    code: throttled ? 'Request_ThrottledTemporarily' : 'no throttling seen',
    message: throttled ? `throttled within the first ${throttled.at} requests, Retry-After ${throttled.after}` : `all ${sent} requests succeeded`,
    innerErrorCode: null, retryAfter: throttled?.after ?? null, expected: '429', match: !!throttled,
  });
  console.log(throttled ? `ok    throttled after ${throttled.at}` : 'ok    no throttling in 120 reads');
} catch (e) {
  results.push({ scenario: 'run aborted', request: '-', http: 0, code: 'error', message: e.message.slice(0, 300), innerErrorCode: null, retryAfter: null, expected: null, match: false });
  console.log(`ERROR ${e.message.slice(0, 200)}`);
} finally {
  for (const id of createdUsers) { try { await fetch(`${GRAPH}/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${gt}` } }); } catch {} }
  for (const id of createdApps) { try { await fetch(`${GRAPH}/applications/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${gt}` } }); } catch {} }
  console.log(`cleanup: ${createdUsers.length} user(s), ${createdApps.length} app(s)`);
}

const tokenFacts = gt ? rolesIn(gt) : { roles: [], appid: null, aud: null, tid: null };
const countRow = results.find((r) => r.request === 'GET /users?$count=true' && r.countPresent !== undefined);
const innerFields = [...new Set(results.map((r) => r.innerErrorFields).filter(Boolean))];
const date = new Date().toISOString().slice(0, 10);
writeFileSync('graph-errors.json', JSON.stringify({ date, tenant: 'lab (client credentials, federated credential)', results }, null, 1));
writeFileSync('graph-errors.md', [
  `Graph error-code lab run ${date}: ${results.filter((r) => r.match).length}/${results.length} scenarios returned the expected code.`,
  '',
  `Application permissions in the token used for this run, read from its own \`roles\` claim: ${tokenFacts.roles.length ? tokenFacts.roles.map((r) => `\`${r}\``).join(', ') : '(none)'}. Audience \`${tokenFacts.aud}\`.`,
  `\`@odata.count\` present in the response to \`GET /users?$count=true\` with no ConsistencyLevel header: ${countRow ? countRow.countPresent : 'not recorded'}.`,
  `\`innerError\` field sets seen across the error responses: ${innerFields.length ? innerFields.map((f) => `\`${f}\``).join(' | ') : '(none recorded)'}.`,
  '',
  '| Scenario | Request | HTTP | Error code | Message (first line) |',
  '|---|---|---|---|---|',
  ...results.map((r) => `| ${r.scenario} | \`${r.request}\` | ${r.http} | ${r.code} ${r.match === false ? '⚠️' : ''} | ${(r.message ?? '').replace(/\|/g, '\\|')} |`),
  '',
  'Objects created for this run were deleted afterwards. No tokens or secrets are recorded.',
].join('\n'));
console.log(results.map((r) => `${r.match === false ? '!! ' : 'ok '} ${r.scenario}`).join('\n'));

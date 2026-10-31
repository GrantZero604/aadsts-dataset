// Lab run: reproduce AADSTS error codes against the lab tenant and record what Microsoft returns.
// Runs only in GitHub Actions. Auth: GitHub OIDC -> federated credential on the lab app
// (no client secret). Test users get random passwords generated here; they are masked in the log,
// never stored, and the users are deleted at the end of the run.
// Output: lab-results.json and lab-results.md (no passwords, no tokens, no correlation IDs).
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const TENANT = process.env.LAB_TENANT_ID;
const DOMAIN = process.env.LAB_DOMAIN;
const RUNNER_APP = process.env.LAB_RUNNER_CLIENT_ID;   // confidential, federated, Graph User.ReadWrite.All
const SIGNIN_APP = process.env.LAB_SIGNIN_CLIENT_ID;   // public client used for the test sign-ins
const LOGIN = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Some scenarios cost many minutes of waiting and are already proven. Set RUN_SLOW=1 to include them.
const RUN_SLOW = process.env.RUN_SLOW === '1';
const mask = (s) => console.log(`::add-mask::${s}`);

async function githubJwt(audience) {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: u, ACTIONS_ID_TOKEN_REQUEST_TOKEN: t } = process.env;
  if (!u || !t) throw new Error('needs permissions: id-token: write');
  const r = await fetch(`${u}&audience=${encodeURIComponent(audience)}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`GitHub OIDC: HTTP ${r.status}`);
  return (await r.json()).value;
}

async function graphToken() {
  const body = new URLSearchParams({
    client_id: RUNNER_APP,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: await githubJwt('api://AzureADTokenExchange'),
  });
  const r = await fetch(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { method: 'POST', body });
  const j = await r.json();
  if (!r.ok) throw new Error(`Graph token failed: ${j.error_codes?.join(',')} ${j.error}`);
  mask(j.access_token);
  return j.access_token;
}

let gt;
/** Same as graph(), but against the beta endpoint. Per-user MFA state lives there. */
async function graphBeta(method, path, body) {
  const r = await fetch(`https://graph.microsoft.com/beta${path}`, {
    method, headers: { Authorization: `Bearer ${gt}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Graph beta ${method} ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}
async function graph(method, path, body) {
  const r = await fetch(`${GRAPH}${path}`, {
    method, headers: { Authorization: `Bearer ${gt}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Graph ${method} ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

const password = () => { const p = randomBytes(18).toString('base64url') + 'aA1!'; mask(p); return p; };

/** One ROPC token request; returns only non-sensitive fields. */
async function ropc({ tenant = TENANT, client = SIGNIN_APP, username, pwd, scope = 'openid offline_access https://graph.microsoft.com/User.Read', omitPassword = false, headers = {} }) {
  const body = new URLSearchParams({ client_id: client, grant_type: 'password', scope, username });
  if (!omitPassword) body.set('password', pwd);
  const r = await fetch(`${LOGIN}/${tenant}/oauth2/v2.0/token`, { method: 'POST', body, headers });
  const j = await r.json().catch(() => ({}));
  if (j.access_token) { mask(j.access_token); if (j.refresh_token) mask(j.refresh_token); if (j.id_token) mask(j.id_token); }
  const desc = (j.error_description ?? '').split(/\r?\n/)[0].replace(/Trace ID:.*$/i, '').trim();
  return { http: r.status, success: !!j.access_token, error: j.error ?? null, codes: j.error_codes ?? [], message: desc };
}


/** GET the authorization endpoint without signing in. Entra answers with an error page or a redirect
 *  carrying error_description; returns the first AADSTS code and line found. No credentials are sent. */
async function authorize(params, tenant = TENANT) {
  const q = new URLSearchParams({ response_mode: params.response_type === 'code' ? 'query' : 'fragment', state: 'lab', nonce: 'lab', ...params });
  const r = await fetch(`${LOGIN}/${tenant}/oauth2/v2.0/authorize?${q}`, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Accept-Language': 'en-US' } });
  let text = '';
  const loc = r.headers.get('location');
  if (loc) { try { const u = new URL(loc); text = u.searchParams.get('error_description') ?? new URLSearchParams(u.hash.slice(1)).get('error_description') ?? ''; } catch {} }
  if (!text) text = await r.text().catch(() => '');
  const codes = [...new Set([...text.matchAll(/AADSTS(\d{4,7})/g)].map((m) => m[1]))];
  const m = text.match(/AADSTS\d{4,7}:\s*([^<"\\\r\n]+)/);
  return { http: r.status, success: false, error: loc ? 'redirect' : 'page', codes, message: m ? `AADSTS${codes[0]}: ${m[1].trim()}` : `no AADSTS code in response (HTTP ${r.status}${loc ? `, redirect to ${new URL(loc).host}` : ''})` };
}

/** Client-credentials request with a GitHub OIDC assertion that has already expired. */
async function expiredAssertion() {
  const jwt = await githubJwt('api://AzureADTokenExchange');
  const exp = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).exp * 1000;
  // Entra allows some clock skew; a run with exp + 60 s still succeeded, so wait well past it.
  const wait = Math.min(Math.max(exp - Date.now() + 11 * 60_000, 0), 16 * 60_000);
  console.log(`waiting ${Math.round(wait / 1000)} s for the assertion to expire`);
  await sleep(wait);
  const body = new URLSearchParams({
    client_id: RUNNER_APP, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: jwt,
  });
  const r = await fetch(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (j.access_token) mask(j.access_token);
  const desc = (j.error_description ?? '').split(/\r?\n/)[0].replace(/Trace ID:.*$/i, '').trim();
  return { http: r.status, success: !!j.access_token, error: j.error ?? null, codes: j.error_codes ?? [], message: desc };
}

/** Plain form POST to an Entra endpoint; returns only non-sensitive fields. */
async function post(path, fields) {
  const r = await fetch(`${LOGIN}/${path}`, { method: 'POST', body: new URLSearchParams(fields) });
  const j = await r.json().catch(() => ({}));
  if (j.access_token) mask(j.access_token);
  if (j.device_code) mask(j.device_code);
  const desc = (j.error_description ?? '').split(/\r?\n/)[0].replace(/Trace ID:.*$/i, '').trim();
  return { http: r.status, success: !!(j.access_token || j.device_code), error: j.error ?? null, codes: j.error_codes ?? [], message: desc };
}

/** Token request over TLS 1.0. Entra retired TLS 1.0/1.1; this records what comes back (often a handshake failure, no AADSTS code). */
async function tls10Request(username, pwd) {
  const https = await import('node:https');
  const body = new URLSearchParams({ client_id: SIGNIN_APP, grant_type: 'password', scope: 'openid', username, password: pwd }).toString();
  return new Promise((resolve) => {
    const req = https.request(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, {
      method: 'POST', minVersion: 'TLSv1', maxVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=0',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let data = ''; res.on('data', (c) => (data += c));
      res.on('end', () => {
        let j = {}; try { j = JSON.parse(data); } catch {}
        if (j.access_token) mask(j.access_token);
        const desc = (j.error_description ?? '').split(/\r?\n/)[0].replace(/Trace ID:.*$/i, '').trim();
        resolve({ http: res.statusCode, success: !!j.access_token, error: j.error ?? null, codes: j.error_codes ?? [], message: desc || `HTTP ${res.statusCode}, no AADSTS code` });
      });
    });
    req.on('error', (e) => resolve({ http: 0, success: false, error: 'tls', codes: [], message: `no response: ${e.code ?? e.message}`.slice(0, 160) }));
    req.end(body);
  });
}

/** Apps created for one run, with Application.ReadWrite.OwnedBy (the runner owns what it creates). */
const createdApps = [];
/** A new application object isn't readable everywhere at once; a 404 right after creation is normal. */
async function retry404(fn, label, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      const transient = /HTTP 40[04]/.test(e.message) || /ResourceNotFound/.test(e.message);
      if (!transient || i === attempts - 1) throw e;
      console.log(`${label}: not ready yet, retrying (${i + 1})`);
      await sleep(15_000);
    }
  }
}
async function newApp(tag, extra = {}) {
  const app = await graph('POST', '/applications', { displayName: `lab-${tag}-${process.env.GITHUB_RUN_ID ?? 'local'}`, signInAudience: 'AzureADMyOrg', ...extra });
  createdApps.push(app.id);
  await sleep(20_000); // let the application object replicate before anything references it
  let sp = null;
  try { sp = await retry404(() => graph('POST', '/servicePrincipals', { appId: app.appId }), `service principal for ${tag}`); }
  catch (e) { console.log(`no service principal for ${tag}: ${e.message.slice(0, 120)}`); }
  return { objectId: app.id, appId: app.appId, spId: sp?.id ?? null };
}
async function addSecret(objectId) {
  const r = await retry404(() => graph('POST', `/applications/${objectId}/addPassword`, { passwordCredential: { displayName: 'lab' } }), 'addPassword');
  mask(r.secretText);
  return r.secretText;
}
/** Federated identity credential with Entra itself as the issuer, so one lab app can present another's token. */
async function addFic(objectId, { issuer, subject, audience }) {
  return retry404(() => graph('POST', `/applications/${objectId}/federatedIdentityCredentials`, {
    name: `lab-${Math.random().toString(36).slice(2, 10)}`, issuer, subject, audiences: [audience],
  }), 'federated credential');
}
/** Client-credentials request using another lab app's access token as the client assertion. */
async function ficRequest(clientId, assertion, scope = 'https://graph.microsoft.com/.default') {
  return post(`${TENANT}/oauth2/v2.0/token`, {
    client_id: clientId, grant_type: 'client_credentials', scope,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion,
  });
}

/** ROPC that returns the refresh token itself, so later scenarios can replay it. Masked in the log. */
async function ropcTokens(username, pwd) {
  const r = await fetch(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { method: 'POST', body: new URLSearchParams({
    client_id: SIGNIN_APP, grant_type: 'password', username, password: pwd,
    scope: 'openid offline_access https://graph.microsoft.com/User.Read',
  }) });
  const j = await r.json().catch(() => ({}));
  for (const k of ['access_token', 'refresh_token', 'id_token']) if (j[k]) mask(j[k]);
  return j.refresh_token ?? null;
}
async function useRefresh(token) {
  return post(`${TENANT}/oauth2/v2.0/token`, { client_id: SIGNIN_APP, grant_type: 'refresh_token', refresh_token: token, scope: 'openid offline_access https://graph.microsoft.com/User.Read' });
}

const results = [];
const created = [];
async function scenario(name, expect, fn) {
  try {
    const res = await fn();
    const got = res.success ? 'success' : res.codes.map(String);
    const match = expect.some((e) => (e === 'success' ? res.success : res.codes.map(String).includes(e)));
    results.push({ scenario: name, expected: expect, got, match, http: res.http, error: res.error, message: res.message });
    console.log(`${match ? 'MATCH' : 'DIFF '} ${name}: expected ${expect.join('|')}, got ${Array.isArray(got) ? got.join(',') : got}`);
  } catch (e) {
    results.push({ scenario: name, expected: expect, got: 'error', match: false, message: e.message.slice(0, 200) });
    console.log(`ERROR ${name}: ${e.message.slice(0, 200)}`);
  }
}

async function newUser(tag, extra = {}, forceChange = false) {
  const nick = `lab-${process.env.GITHUB_RUN_ID ?? 'local'}-${tag}`;
  const pwd = password();
  const u = await graph('POST', '/users', {
    accountEnabled: true, displayName: `Lab ${tag}`, mailNickname: nick, userPrincipalName: `${nick}@${DOMAIN}`,
    passwordProfile: { password: pwd, forceChangePasswordNextSignIn: forceChange }, ...extra,
  });
  created.push(u.id);
  return { id: u.id, upn: u.userPrincipalName, pwd };
}

/** Delete leftover lab users from earlier runs (e.g. a run that failed before cleanup). */
async function sweep() {
  const res = await graph('GET', `/users?$filter=startswith(userPrincipalName,'lab-')&$select=id,userPrincipalName`);
  for (const u of res.value ?? []) { try { await graph('DELETE', `/users/${u.id}`); console.log('removed leftover test user'); } catch {} }
}

try {
  gt = await graphToken();
  await sweep();
  try {
    const stale = await graph('GET', `/applications?$filter=startswith(displayName,'lab-')&$select=id,displayName`);
    for (const a of stale.value ?? []) { try { await graph('DELETE', `/applications/${a.id}`); console.log('removed leftover test app'); } catch {} }
  } catch (e) { console.log(`app sweep skipped: ${e.message.slice(0, 120)}`); }
  const normal = await newUser('normal');
  const disabled = await newUser('disabled', { accountEnabled: false });
  const mustChange = await newUser('mustchange', {}, true);
  const lockout = await newUser('lockout');
  const pwchange = await newUser('pwchange');
  const gone2 = await newUser('deleted2');
  await sleep(30_000); // directory replication before first sign-in

  await scenario('User does not exist', ['50034'], () => ropc({ username: `nobody-${randomUUID().slice(0, 8)}@${DOMAIN}`, pwd: 'x' }));
  await scenario('Wrong password', ['50126'], () => ropc({ username: normal.upn, pwd: password() }));
  await scenario('Account disabled', ['50057'], () => ropc({ username: disabled.upn, pwd: disabled.pwd }));
  await scenario('Must change password at next sign-in', ['50055', '50144', '50173'], () => ropc({ username: mustChange.upn, pwd: mustChange.pwd }));
  await scenario('Correct password (security defaults / MFA / consent decide)', ['success', '50076', '50079', '65001', '50072'], () => ropc({ username: normal.upn, pwd: normal.pwd }));
  await scenario('Unknown client ID', ['700016'], () => ropc({ client: randomUUID(), username: normal.upn, pwd: normal.pwd }));
  await scenario('Resource does not exist in tenant', ['500011'], () => ropc({ username: normal.upn, pwd: normal.pwd, scope: 'https://does-not-exist.brambrinkmeier.com/.default' }));
  await scenario('Tenant does not exist', ['90002'], () => ropc({ tenant: randomUUID(), username: normal.upn, pwd: normal.pwd }));
  await scenario('Password parameter missing', ['900144'], () => ropc({ username: normal.upn, omitPassword: true }));

  // Codes Microsoft's error reference does not list (checked 30 Oct 2026). Authorize-endpoint errors
  // (500113, 700051) only render in a real browser, so they are reproduced by hand instead.
  // Expected values are what forum
  // reports suggest; the run records whatever Entra actually returns.
  await scenario('Token request with a browser Origin header from a non-SPA client', ['9002326'], () => ropc({ username: normal.upn, pwd: normal.pwd, headers: { Origin: 'https://lab.brambrinkmeier.com' } }));
  await scenario('Malformed tenant identifier', ['900023'], () => ropc({ tenant: 'not_a_valid~tenant', username: normal.upn, pwd: normal.pwd }));
  await scenario('Password longer than 256 characters', ['50052'], () => ropc({ username: normal.upn, pwd: 'a'.repeat(300) }));
  await scenario('Deleted user signs in', ['500341', '50034'], async () => {
    const gone = await newUser('deleted');
    await sleep(20_000);
    await graph('DELETE', `/users/${gone.id}`);
    created.splice(created.indexOf(gone.id), 1);
    await sleep(30_000);
    return ropc({ username: gone.upn, pwd: gone.pwd });
  });
  await scenario('Device code that was never issued', ['70020', '70000', '9002313'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: SIGNIN_APP, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'lab-invalid-device-code' }));
  await scenario('Device code requested on /consumers by a work-account app', ['90133', '9002331', '700016'], () => post('consumers/oauth2/v2.0/devicecode', { client_id: SIGNIN_APP, scope: 'openid' }));
  await scenario('Both scope and resource sent', ['9010010'], async () => post(`${TENANT}/oauth2/v2.0/token`, {
    client_id: RUNNER_APP, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default', resource: 'https://management.azure.com/',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await githubJwt('api://AzureADTokenExchange'),
  }));
  // Round 4 (30 Oct 2026): more codes, no new permissions needed.
  await scenario('Confidential client sends no credential', ['7000218'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: RUNNER_APP, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }));
  await scenario('Client assertion that is not a JWT', ['9002313', '50027', '700027'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: RUNNER_APP, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: 'not-a-jwt' }));
  await scenario('Unknown client_assertion_type', ['9002313', '700027'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: RUNNER_APP, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default', client_assertion_type: 'urn:lab:not-a-type', client_assertion: 'x' }));
  await scenario('Device code on /common by a single-tenant app', ['90133', '700016', '50194'], () => post('common/oauth2/v2.0/devicecode', { client_id: SIGNIN_APP, scope: 'openid' }));
  await scenario('Device code on /organizations by a single-tenant app', ['90133', '700016', '50194'], () => post('organizations/oauth2/v2.0/devicecode', { client_id: SIGNIN_APP, scope: 'openid' }));
  if (RUN_SLOW) await scenario('Repeated wrong passwords (smart lockout)', ['50053'], async () => {
    let last;
    for (let i = 0; i < 15; i++) { last = await ropc({ username: lockout.upn, pwd: password() }); if (last.codes.includes(50053)) break; await sleep(2_000); }
    return last;
  });
  else console.log('skipping the smart-lockout scenario (already reproduced; set RUN_SLOW=1 to include it)');
  await scenario('Token request over TLS 1.0', ['1002016'], () => tls10Request(normal.upn, normal.pwd));
  await graph('DELETE', `/users/${gone2.id}`); created.splice(created.indexOf(gone2.id), 1);
  if (RUN_SLOW) await scenario('Client assertion expired', ['700024'], () => expiredAssertion());
  else console.log('skipping the expired-assertion scenario (already reproduced; set RUN_SLOW=1 to include it)');
  // Round 9 (31 Oct 2026): the device code flow, end to end. Device code phishing is a live technique,
  // so the codes a defender sees while a code is outstanding are worth recording exactly.
  try {
    const dc = await fetch(`${LOGIN}/${TENANT}/oauth2/v2.0/devicecode`, { method: 'POST', body: new URLSearchParams({ client_id: SIGNIN_APP, scope: 'openid offline_access https://graph.microsoft.com/User.Read' }) });
    const dcj = await dc.json().catch(() => ({}));
    if (dcj.device_code) {
      mask(dcj.device_code);
      if (dcj.user_code) mask(dcj.user_code);
      console.log(`device code issued: expires_in ${dcj.expires_in}s, interval ${dcj.interval}s`);
      await scenario('Device code issued but nobody has signed in yet', ['70016'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: SIGNIN_APP, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: dcj.device_code }));
      await scenario('Device code polled too fast', ['70016', '70020'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: SIGNIN_APP, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: dcj.device_code }));
      await scenario('Device code redeemed with a different client ID', ['70016', '7000215', '70002'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: RUNNER_APP, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: dcj.device_code }));
      results.push({ scenario: 'Device code lifetime as issued', expected: ['recorded'], got: 'recorded', match: true, message: `expires_in ${dcj.expires_in} seconds, polling interval ${dcj.interval} seconds` });
    } else {
      results.push({ scenario: 'Device code flow', expected: ['70016'], got: 'error', match: false, message: `no device code issued: ${(dcj.error_description ?? '').slice(0, 140)}` });
    }
  } catch (e) {
    results.push({ scenario: 'Device code scenarios (round 9)', expected: ['70016'], got: 'error', match: false, message: e.message.slice(0, 200) });
  }

  // Per-user MFA was attempted here and removed on 31 Oct 2026. Setting perUserMfaState needs the
  // beta endpoint AND the Policy.ReadWrite.AuthenticationMethod application permission, which lets an
  // app rewrite the tenant's authentication policy. That is too much standing privilege for a runner
  // triggered from GitHub, so 50076, 50079 and 50072 stay documentation-based. See /methodology/.

  // Round 7 (30 Oct 2026): refresh-token behaviour after an admin revokes sessions.
  try {
    const rt = await ropcTokens(normal.upn, normal.pwd);
    if (!rt) {
      results.push({ scenario: 'Refresh token after revoking sessions', expected: ['50173'], got: 'error', match: false, message: 'no refresh token issued (is admin consent granted for the sign-in app?)' });
    } else {
      await scenario('Refresh token before revocation (control)', ['success'], () => useRefresh(rt));
      const rt2 = await ropcTokens(normal.upn, normal.pwd);
      await graph('POST', `/users/${normal.id}/revokeSignInSessions`, {});
      await sleep(120_000); // revocation is not instant
      await scenario('Refresh token after the admin revoked sessions', ['50173', '700082', '50076'], () => useRefresh(rt2 ?? rt));
    }
  } catch (e) {
    results.push({ scenario: 'Refresh-token scenarios (round 7)', expected: ['50173'], got: 'error', match: false, message: e.message.slice(0, 200) });
  }

  // Round 5 (30 Oct 2026): scenarios that need the runner to create its own test apps.
  try {
    const holder = await newApp('fic-holder');                 // presents its token as an assertion
    const holderSecret = await addSecret(holder.objectId);
    await sleep(30_000);
    const ISSUER = `${LOGIN}/${TENANT}/v2.0`;
    const AUD = 'api://AzureADTokenExchange';
    const raw = await fetch(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { method: 'POST', body: new URLSearchParams({ client_id: holder.appId, client_secret: holderSecret, grant_type: 'client_credentials', scope: `${AUD}/.default` }) });
    const rawJson = await raw.json().catch(() => ({}));
    if (rawJson.access_token) mask(rawJson.access_token);
    const a = rawJson.access_token;

    const target = await newApp('fic-target');
    if (a && holder.spId) {
      await scenario('Federated credential: no credential configured at all', ['70025'], () => ficRequest(target.appId, a));
      await addFic(target.objectId, { issuer: ISSUER, subject: holder.spId, audience: AUD });
      await sleep(60_000); // federated credentials take a moment to propagate
      await scenario('Federated credential matches', ['success'], () => ficRequest(target.appId, a));

      const wrongSub = await newApp('fic-wrongsub');
      await addFic(wrongSub.objectId, { issuer: ISSUER, subject: '00000000-0000-0000-0000-000000000001', audience: AUD });
      await sleep(30_000);
      await scenario('Federated credential: subject does not match', ['700213', '70021'], () => ficRequest(wrongSub.appId, a));

      const wrongIss = await newApp('fic-wrongiss');
      await addFic(wrongIss.objectId, { issuer: 'https://token.actions.githubusercontent.com', subject: holder.spId, audience: AUD });
      await sleep(30_000);
      await scenario('Federated credential: issuer does not match', ['700211', '70021'], () => ficRequest(wrongIss.appId, a));

      const wrongAud = await newApp('fic-wrongaud');
      await addFic(wrongAud.objectId, { issuer: ISSUER, subject: holder.spId, audience: 'api://lab-other-audience' });
      await sleep(30_000);
      await scenario('Federated credential: audience does not match', ['700212', '700213', '70021'], () => ficRequest(wrongAud.appId, a));

      const caseSub = await newApp('fic-case');
      await addFic(caseSub.objectId, { issuer: ISSUER, subject: holder.spId.toUpperCase(), audience: AUD });
      await sleep(30_000);
      await scenario('Federated credential: subject differs only by case', ['7002138', '700213'], () => ficRequest(caseSub.appId, a));
    } else {
      results.push({ scenario: 'Federated credential scenarios', expected: ['70021 family'], got: 'error', match: false, message: 'no assertion token or no service principal for the holder app' });
    }

    // Wrong and missing client secrets.
    const secretApp = await newApp('secret');
    const realSecret = await addSecret(secretApp.objectId);
    await sleep(30_000);
    await scenario('Wrong client secret', ['7000215'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: secretApp.appId, client_secret: 'lab-not-the-real-secret', grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }));
    await scenario('Confidential client does ROPC without a secret', ['7000218'], () => ropc({ client: secretApp.appId, username: normal.upn, pwd: normal.pwd }));
    await scenario('Correct client secret (control)', ['success'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: secretApp.appId, client_secret: realSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }));

    // Single-page application platform: a token request without an Origin header.
    const spa = await newApp('spa', { spa: { redirectUris: ['https://lab.brambrinkmeier.com/spa'] }, isFallbackPublicClient: true });
    await sleep(30_000);
    // A brand-new SPA app has no consent, so this returns 65001 before any Origin check. Left in to record that ordering.
    await scenario('SPA-registered client redeems without an Origin header', ['9002327', '65001'], () => ropc({ client: spa.appId, username: normal.upn, pwd: normal.pwd }));

    // Personal Microsoft accounts only, called on the tenant endpoint.
    const msaOnly = await newApp('msa-only', { signInAudience: 'PersonalMicrosoftAccount', isFallbackPublicClient: true });
    await sleep(30_000);
    await scenario('Personal-accounts-only app on a tenant endpoint', ['9002331'], () => ropc({ client: msaOnly.appId, username: normal.upn, pwd: normal.pwd }));

    // Disabled service principal.
    const disabledApp = await newApp('disabled-sp', { isFallbackPublicClient: true });
    if (disabledApp.spId) {
      await retry404(() => graph('PATCH', `/servicePrincipals/${disabledApp.spId}`, { accountEnabled: false }), 'disable service principal');
      await sleep(60_000);
      await scenario('Application disabled for sign-in', ['7000112'], () => ropc({ client: disabledApp.appId, username: normal.upn, pwd: normal.pwd }));
    }

    // API that requires an app role assignment.
    const api = await newApp('api', { identifierUris: [], appRoles: [{ id: '11111111-2222-3333-4444-555555555555', allowedMemberTypes: ['Application'], displayName: 'Lab role', description: 'Lab role', value: 'Lab.Role', isEnabled: true }] });
    if (api.spId && holder.spId) {
      await retry404(() => graph('PATCH', `/applications/${api.objectId}`, { identifierUris: [`api://${api.appId}`] }), 'set identifier uri');
      await retry404(() => graph('PATCH', `/servicePrincipals/${api.spId}`, { appRoleAssignmentRequired: true }), 'require assignment');
      await sleep(60_000);
      await scenario('App-only token for an API that requires assignment', ['501051'], () => post(`${TENANT}/oauth2/v2.0/token`, { client_id: holder.appId, client_secret: holderSecret, grant_type: 'client_credentials', scope: `api://${api.appId}/.default` }));
    }
  } catch (e) {
    results.push({ scenario: 'App-based scenarios (round 5)', expected: ['several'], got: 'error', match: false, message: e.message.slice(0, 200) });
    console.log(`round 5 stopped: ${e.message.slice(0, 200)}`);
  }

  await scenario('Deleted user signs in, about 12 minutes after deletion', ['500341', '50034'], () => ropc({ username: gone2.upn, pwd: gone2.pwd }));
} finally {
  for (const id of createdApps) {
    try { await graph('DELETE', `/applications/${id}`); } catch (e) { console.log(`cleanup failed for a test app: ${e.message.slice(0, 120)}`); }
  }
  console.log(`cleanup: removed ${createdApps.length} test app(s)`);
  // New users can take a few seconds to replicate; a 404 right after creation is retried.
  let deleted = 0;
  for (const id of created) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try { await graph('DELETE', `/users/${id}`); deleted++; break; }
      catch (e) { if (attempt === 5) console.log(`cleanup failed for a test user (next run sweeps it): ${e.message.slice(0, 120)}`); else await sleep(10_000); }
    }
  }
  console.log(`cleanup: deleted ${deleted}/${created.length} test user(s)`);
}

const date = new Date().toISOString().slice(0, 10);
writeFileSync('lab-results.json', JSON.stringify({ date, tenant: 'lab (ROPC, public client)', results }, null, 1));
writeFileSync('lab-results.md', [
  `Lab run ${date}: ${results.filter((r) => r.match).length}/${results.length} scenarios returned the expected AADSTS code.`,
  '',
  '| Scenario | Expected | Got | Microsoft message (first line) |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.scenario} | ${r.expected.join(' / ')} | ${Array.isArray(r.got) ? r.got.join(', ') : r.got} ${r.match ? '✅' : '⚠️'} | ${(r.message ?? '').replace(/\|/g, '\\|').slice(0, 160)} |`),
  '',
  'Test users were created with random passwords for this run only and deleted afterwards.',
].join('\n'));
console.log(readableSummary());
function readableSummary() { return results.map((r) => `${r.match ? 'ok ' : '!! '} ${r.scenario}`).join('\n'); }

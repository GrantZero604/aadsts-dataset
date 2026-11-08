// Refresh the bundled offline snapshot in ../snapshot/.
//
//   node scripts/update-snapshot.mjs                 # from https://brambrinkmeier.com (plain GETs)
//   node scripts/update-snapshot.mjs --from-dist DIR # from a local build of the site (its dist/ folder)
//
// Every file is checked against the site's /checksums.json, and the result is scanned for identifiers
// (GUIDs, addresses, IPs) outside the published allow-list. Either failure aborts without writing.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { USER_AGENT, DEFAULT_BASE_URL } from '../src/data.mjs';
import { findPublishableLeaks } from '../src/identifiers.mjs';

const OUT = new URL('../snapshot/', import.meta.url);
const args = process.argv.slice(2);
const distIdx = args.indexOf('--from-dist');
const dist = distIdx >= 0 ? args[distIdx + 1] : null;

async function getBytes(path) {
  if (dist) return readFileSync(join(dist, path));
  const res = await fetch(DEFAULT_BASE_URL + path, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, redirect: 'error' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return Buffer.from(await res.arrayBuffer());
}

const checksums = JSON.parse((await getBytes('/checksums.json')).toString('utf8'));
async function getJson(path) {
  const bytes = await getBytes(path);
  const want = checksums.files[path];
  const got = createHash('sha256').update(bytes).digest('hex');
  if (!want) throw new Error(`${path} is not listed in /checksums.json`);
  if (want !== got) throw new Error(`${path}: sha256 ${got} does not match /checksums.json (${want})`);
  return JSON.parse(bytes.toString('utf8'));
}

const index = await getJson('/api/aadsts/index.json');
const dataset = await getJson('/aadsts.json');
const graph = await getJson('/graph-errors.json');
const labRuns = await getJson('/lab-runs.json');
const records = {};
for (const c of index.codes) records[c.code] = await getJson(`/api/aadsts/${c.code}.json`);

const files = {
  'index.json': index,
  'aadsts.json': dataset,
  'graph-errors.json': graph,
  'lab-runs.json': labRuns,
  'records.json': records,
};
const meta = {
  builtFrom: dist ? 'a local build of the brambrinkmeier.com site (dist/), checked against its /checksums.json' : `${DEFAULT_BASE_URL}, checked against its /checksums.json`,
  takenAt: new Date().toISOString(),
  dataGeneratedAt: index.generatedAt,
  codeCount: index.count,
  labReproducedCount: index.labReproducedCount,
  labRunCount: labRuns.runCount,
  labResultCount: labRuns.resultCount,
};

const serialized = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, `${JSON.stringify(v)}\n`]));
serialized['SNAPSHOT.json'] = `${JSON.stringify(meta, null, 2)}\n`;
const leaks = Object.entries(serialized).flatMap(([k, v]) => findPublishableLeaks(v).map((x) => `${k}: ${x}`));
if (leaks.length) {
  console.error(`snapshot: identifiers outside the allow-list, nothing written:\n${[...new Set(leaks)].join('\n')}`);
  process.exit(1);
}
for (const [k, v] of Object.entries(serialized)) writeFileSync(new URL(k, OUT), v);
console.log(`snapshot: ${index.count} codes, ${labRuns.runCount} lab runs, data generated ${index.generatedAt}`);

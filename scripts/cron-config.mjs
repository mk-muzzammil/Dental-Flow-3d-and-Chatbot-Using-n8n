import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), false);
import { readFileSync, writeFileSync } from 'node:fs';
const jobs = JSON.parse(readFileSync(new URL('../lib/server/jobs/metadata.json', import.meta.url), 'utf8'));
const config = (plan) => ({
  $schema: 'https://openapi.vercel.sh/vercel.json',
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  crons: jobs
    .filter((j) => j.enabled && j.nativePlans.includes(plan))
    .map((j) => ({ path: `/api/cron/${j.id}`, schedule: j.cron })),
});
const path = (name) => new URL('../' + name, import.meta.url);
const serialized = (plan) => JSON.stringify(config(plan), null, 2) + '\n';
const arg = process.argv[2] || 'check';
if (arg === 'generate') {
  writeFileSync(path('vercel.hobby.json'), serialized('hobby'));
  writeFileSync(path('vercel.pro.json'), serialized('pro'));
  if (process.argv.includes('--select'))
    writeFileSync(path('vercel.json'), serialized(process.env.VERCEL_PLAN || 'hobby'));
} else if (arg === 'select') {
  const plan = process.argv[3];
  if (!['hobby', 'pro'].includes(plan)) throw new Error('Usage: npm run cron:select -- hobby|pro');
  writeFileSync(path('vercel.json'), serialized(plan));
} else {
  const plan = process.env.VERCEL_PLAN || 'hobby';
  if (!['hobby', 'pro'].includes(plan)) throw new Error('VERCEL_PLAN must be hobby or pro.');
  for (const p of ['hobby', 'pro'])
    if (readFileSync(path(`vercel.${p}.json`), 'utf8') !== serialized(p))
      throw new Error('Cron configuration drift. Run npm run cron:generate.');
  if (JSON.stringify(JSON.parse(readFileSync(path('vercel.json'), 'utf8'))) !== JSON.stringify(config(plan)))
    throw new Error(
      `Selected vercel.json does not match VERCEL_PLAN=${plan}. Run npm run cron:select -- ${plan}, then redeploy.`,
    );
  console.log(`Cron configuration valid: ${plan} (${config(plan).crons.length} native jobs).`);
}

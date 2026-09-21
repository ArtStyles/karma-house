import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const privateValues = readFileSync('infra/.env.local', 'utf8').split(/\r?\n/).filter(line => /^(SUPABASE_SECRET_KEY|SUPABASE_DB_PASSWORD|KARMAHOUSE_ADMIN_EMAIL)=/.test(line)).map(line => line.slice(line.indexOf('=') + 1)).filter(Boolean);
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
function collect(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path); else if (entry.isFile()) paths.push(path);
  }
}
collect('artifacts/cloud-export');
collect('artifacts/map-export');
collect('artifacts/messaging-export');
collect('dist');
for (const directory of process.argv.slice(2)) collect(directory);
const matches = paths.filter(path => existsSync(path) && statSync(path).isFile() && privateValues.some(secret => readFileSync(path).includes(Buffer.from(secret))));
if (matches.length) { console.error('Private values found in deliverable files:', matches); process.exitCode = 1; }
else console.log(`No private credentials or administrator email found in ${paths.length} source/export files.`);

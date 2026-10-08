import { Client } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
// Deliberately never reads infra/.env.local or the production connector.
import { fixtureDatabaseUrl } from './agency-env.mjs';
const parsed = fixtureDatabaseUrl(true);
const url = parsed.href;
const throughIndex = process.argv.indexOf('--through');
const through = throughIndex < 0 ? null : process.argv[throughIndex + 1];
if (throughIndex >= 0 && !/^[0-9]{14}$/.test(through ?? '')) throw new Error('Invalid --through timestamp');
const admin = new Client({ connectionString: new URL('/postgres', parsed).href });
await admin.connect();
const name = parsed.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Invalid fixture database');
const present = await admin.query('select 1 from pg_database where datname=$1',[name]);
if (present.rowCount) throw new Error('Database already exists; use a new fixture name, no implicit reset');
await admin.query(`create database "${name}"`);
await admin.end();
const db = new Client({ connectionString:url });
await db.connect();
try {
  await db.query(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  const root = new URL('../../supabase/migrations/',import.meta.url);
  for (const file of (await readdir(root)).filter(f=>f.endsWith('.sql')).sort()) {
    if (process.argv.includes('--baseline-only') && file >= '20261005') continue;
    if (through && file.slice(0,14) > through) continue;
    let sql = await readFile(new URL(file,root),'utf8');
    // Only transports unavailable in native PostgreSQL are replaced; all business SQL is real.
    sql = sql.replace(/^create extension if not exists (pg_cron|pg_net);\r?\n/gm,'');
    await db.query(sql);
    console.log(`applied locally: ${file}`);
  }
} finally { await db.end(); }


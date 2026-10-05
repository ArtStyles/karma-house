import { Client } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
// Deliberately never reads infra/.env.local or the production connector.
const url = process.env.KH_LOCAL_DATABASE_URL;
if (!url) throw new Error('KH_LOCAL_DATABASE_URL required');
const parsed = new URL(url);
if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || !parsed.pathname.startsWith('/kh_assisted_test')) throw new Error('Only a disposable loopback kh_assisted_test database is allowed');
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
    let sql = await readFile(new URL(file,root),'utf8');
    // Only transports unavailable in native PostgreSQL are replaced; all business SQL is real.
    sql = sql.replace(/^create extension if not exists (pg_cron|pg_net);\r?\n/gm,'');
    await db.query(sql);
    console.log(`applied locally: ${file}`);
  }
} finally { await db.end(); }

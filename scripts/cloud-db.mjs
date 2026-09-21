import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const config = Object.fromEntries(readFileSync(new URL('../infra/.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
export const adminEmail = config.KARMAHOUSE_ADMIN_EMAIL;
export function createDatabaseClient() {
  return new Client({ host: config.SUPABASE_DB_HOST, port: Number(config.SUPABASE_DB_PORT), database: config.SUPABASE_DB_NAME, user: config.SUPABASE_DB_USER, password: config.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: true, ca: readFileSync(new URL('../infra/supabase-ca.crt', import.meta.url), 'utf8') }, connectionTimeoutMillis: 15000 });
}
if (process.argv.includes('--inspect')) {
  const client = createDatabaseClient();
  try {
    await client.connect();
    console.log(JSON.stringify((await client.query("select current_database() as database, table_name from information_schema.tables where table_schema='public' order by table_name")).rows));
  } catch (error) { console.error('Database check failed:', error.code ?? error.message); process.exitCode = 1; }
  finally { await client.end(); }
}

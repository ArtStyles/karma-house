import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const suite = readFileSync(new URL('../supabase/tests/cover_thumb.sql', import.meta.url), 'utf8');
const db = createDatabaseClient();
try {
  await db.connect();
  const { rows } = await db.query(`select
    (select count(*) from information_schema.columns where table_schema='public' and table_name='properties' and column_name='cover_thumb_path')::int as columns,
    (select count(*) from pg_constraint where conrelid='public.properties'::regclass and conname='properties_cover_thumb_path')::int as constraints,
    (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='kh_photo_read' and qual like '%cover_thumb_path%')::int as policies,
    (select count(*) from public.properties where cover_thumb_path is not null)::int as thumbnails`);
  console.log(JSON.stringify(rows[0]));
  if (rows[0].columns !== 1 || rows[0].constraints !== 1 || rows[0].policies !== 1) throw new Error('KH_NOT_APPLIED: ejecuta apply-cover-thumb.mjs --commit');
  await db.query(suite);
  console.log('suite superada sobre el esquema aplicado');
} catch (error) { await db.query('rollback').catch(() => {}); console.error('falló:', error.message); process.exitCode = 1; }
finally { await db.end(); }

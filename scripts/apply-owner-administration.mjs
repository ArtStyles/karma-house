import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';
const migration = readFileSync(new URL('../supabase/migrations/20261003000100_owner_administration.sql', import.meta.url), 'utf8');
const suite = readFileSync(new URL('../supabase/tests/owner_administration.sql', import.meta.url), 'utf8');
const commit = process.argv.includes('--commit');
const suiteOnly = process.argv.includes('--suite-only');
const ownerEmail = process.env.KARMAHOUSE_OWNER_EMAIL;
const db = createDatabaseClient();
try {
  await db.connect();
  if (!suiteOnly) {
    await db.query('begin');
    await db.query(migration);
    if (commit) {
      if (!ownerEmail) throw new Error('KARMAHOUSE_OWNER_EMAIL is required for enrollment.');
      const {rows} = await db.query('select id from auth.users where lower(email)=lower($1) and email_confirmed_at is not null', [ownerEmail]);
      if (rows.length !== 1) throw new Error('Expected exactly one confirmed owner account.');
      await db.query('insert into kh_private.platform_owner(user_id) values($1)', [rows[0].id]);
      await db.query('insert into public.kh_admins(user_id) values($1) on conflict do nothing', [rows[0].id]);
      await db.query('commit');
      console.log('Migration and verified owner enrollment committed.');
    }
  }
  await db.query(suite);
  // Suite rolls back the migration too in preview mode.
  console.log(suiteOnly ? 'SQL suite passed on applied schema.' : commit ? 'SQL suite passed after enrollment.' : 'SQL suite passed; preview rolled back.');
} catch(e) {
  await db.query('rollback').catch(()=>{});
  console.error(e.message); process.exitCode=1;
} finally { await db.end(); }

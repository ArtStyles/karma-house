// Operator-only configuration. No implicit infra/.env.local and no identity lookup by name.
import {Client} from 'pg';
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
if(args.some(x=>!['--official','--transfers','--commit','--dry-run','--client-reviewed',value('--official'),value('--transfers')].includes(x)))throw Error('Unknown argument');
const official=value('--official'),enabled=value('--transfers')==='on';
if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(official??'')||!['on','off'].includes(value('--transfers')))throw Error('Use --official <protected UUID> --transfers on|off [--dry-run|--commit]');
if(!process.env.KH_ASSISTED_DATABASE_URL)throw Error('Explicit KH_ASSISTED_DATABASE_URL required');
if(enabled&&args.includes('--commit')&&!args.includes('--client-reviewed'))throw Error('Enable only after compatible client, endpoint and pilot checks: --client-reviewed');
if(args.includes('--commit')&&args.includes('--dry-run'))throw Error('Choose commit or dry-run');
const db=new Client({connectionString:process.env.KH_ASSISTED_DATABASE_URL});await db.connect();
try{await db.query('begin');const owner=(await db.query('select user_id from kh_private.platform_owner where singleton')).rows[0];if(owner?.user_id!==official)throw Error('UUID does not match protected platform owner');
const valid=(await db.query('select exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=$1 and u.email_confirmed_at is not null) ok',[official])).rows[0].ok;if(!valid)throw Error('Protected principal needs confirmed active account');
if(args.includes('--commit'))await db.query('update kh_private.assisted_listing_settings set official_publisher_id=$1,transfers_enabled=$2 where singleton',[official,enabled]);
console.log(JSON.stringify({mode:args.includes('--commit')?'commit':'dry-run',protectedIdentityMatches:true,proposedTransfersEnabled:enabled}));await db.query(args.includes('--commit')?'commit':'rollback');
}finally{await db.query('rollback').catch(()=>{});await db.end();}

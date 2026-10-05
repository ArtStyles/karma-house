import {execFileSync} from 'node:child_process';
const url=new URL(process.env.KH_LOCAL_DATABASE_URL??'invalid:');
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.pathname.startsWith('/kh_assisted_test'))throw Error('Explicit disposable loopback database required');
const suites=['assisted_listing_records','listing_media_assets','listing_media_cleanup','listing_management_transfers','listing_transfer_failures','listing_transfer_permissions','transfer_chat_context','cloud_marketplace','cover_thumb','cover_thumb_upgrade','owner_administration','operations','rent','optional_area','messaging','negotiations','chat_negotiation_cards','trust_profile','notifications','search_alerts','play_compliance'];
execFileSync(process.execPath,['scripts/local-sql/run-suite.mjs',...suites],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/verify-listing-transfer-concurrency.mjs'],{stdio:'inherit'});

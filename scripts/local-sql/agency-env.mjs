/** All SQL fixtures reject non-loopback targets before loading a connection. */
export function fixtureDatabaseUrl(allowAssisted=false) {
 const value=process.env.KH_LOCAL_DATABASE_URL;
 if(!value)throw Error('KH_LOCAL_DATABASE_URL required');
 let parsed;try{parsed=new URL(value)}catch{throw Error('Invalid fixture database')}
 const prefix=allowAssisted?'(?:kh_agency_test|kh_assisted_test)':'kh_agency_test';
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||parsed.search||parsed.hash)throw Error('Only a disposable loopback fixture database is allowed');
 if(!new RegExp(`^/${prefix}[a-z0-9_]*$`).test(parsed.pathname))throw Error('Invalid fixture database');
 return parsed;
}

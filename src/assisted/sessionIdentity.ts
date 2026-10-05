import {sessionFromAccessToken} from '../push/domain.ts';

/** Forms follow the authenticated session; requests still follow the exact JWT. */
export function privateSessionKey(userId:string|undefined,accessToken:string|undefined):string {
 const identity=userId&&accessToken?sessionFromAccessToken(userId,accessToken):null;
 return identity?`${identity.userId}:${identity.sessionId}`:`${userId??'signed-out'}:${accessToken??''}`;
}

import type {AccountAccess} from '../admin/domain.ts';
/** Identity is display data; cached administrative permissions are fail-closed. */
export function retainProfileIdentity<T extends {ownerId:string;isAdmin:boolean;access:AccountAccess}>(profile:T|null,ownerId:string):T|null {
  if(!profile||profile.ownerId!==ownerId)return null;
  return {...profile,isAdmin:false,access:{...profile.access,role:'member'}};
}

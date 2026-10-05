import type {TransferRequest} from './types.ts';

/** A refreshed terminal row also confirms acceptance after a lost decision response. */
export function createTransferManagementReconciler(){
 let last='';
 return (row:TransferRequest|null,invalidate:(ids:readonly string[])=>Promise<void>)=>{
  if(row?.effectiveState!=='accepted')return;
  const key=`${row.id}:${row.requestVersion}`;
  if(last===key)return;
  last=key;
  void invalidate(row.items.map(item=>item.propertyId)).catch(()=>{});
 };
}

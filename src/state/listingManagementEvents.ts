/** Only a local generation is retained; public UUIDs are delivered transiently to listeners. */
export function createListingManagementEvents(){let generation=0;const listeners=new Set<()=>void>();return {
 getSnapshot:()=>generation,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 invalidate(_ids:readonly string[]){generation++;listeners.forEach(fn=>fn());},
 checkpoint(){const captured=generation;return()=>{if(captured!==generation)throw Error('KH_PROPERTY_MANAGEMENT_CHANGED');};},
};}
export const listingManagementEvents=createListingManagementEvents();

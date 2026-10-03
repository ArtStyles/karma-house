/** An account switch invalidates successes and errors from the old transport. */
export async function scopedAdminRequest<T>(transport:()=>PromiseLike<T>,checkpoint:()=>void):Promise<T>{
  checkpoint();
  try{const result=await transport();checkpoint();return result;}
  catch(error){checkpoint();throw error;}
}

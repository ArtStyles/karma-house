export type QueryPage<T>={items:T[];total:number;hasMore:boolean};
export type QuerySnapshot<T>={key:string;page:QueryPage<T>|null;offset:number;loading:boolean;refreshing:boolean;error:string|null};

/** Publish only a completed page from the current account/filter context. */
export function createAdminQueryController<Input,Row>(loader:(input:Input,offset:number,signal:AbortSignal)=>Promise<QueryPage<Row>>,pageSize=20) {
  let input:Input|null=null;
  let snapshot:QuerySnapshot<Row>={key:'',page:null,offset:0,loading:false,refreshing:false,error:null};
  let generation=0;
  let pending:{controller:AbortController;promise:Promise<void>;offset:number}|null=null;
  const listeners=new Set<()=>void>();
  const publish=(change:Partial<QuerySnapshot<Row>>)=>{snapshot={...snapshot,...change};for(const listener of listeners)listener();};
  const cancel=()=>{generation++;pending?.controller.abort();pending=null;publish({loading:false,refreshing:false});};
  const load=(offset=0,refreshing=false):Promise<void>=>{
    if(input===null)return Promise.resolve();
    if(pending?.offset===offset)return pending.promise;
    pending?.controller.abort();
    const controller=new AbortController(),epoch=++generation,captured=input,key=snapshot.key;
    const current=()=>!controller.signal.aborted&&epoch===generation&&key===snapshot.key;
    publish({loading:true,refreshing,error:null});
    // Defer cleanup until after pending is installed, including synchronous loaders.
    const promise=(async()=>{
      try {
        let confirmedOffset=Math.max(0,Math.floor(offset/pageSize)*pageSize);
        let page=await loader(captured,confirmedOffset,controller.signal);
        if(!current())return;
        if(confirmedOffset>0&&confirmedOffset>=page.total){
          confirmedOffset=Math.max(0,Math.floor((page.total-1)/pageSize)*pageSize);
          page=await loader(captured,confirmedOffset,controller.signal);
        }
        if(current())publish({page,offset:confirmedOffset,error:null});
      } catch(error) {if(current())publish({error:error instanceof Error?error.message:String(error)});}
      finally {await Promise.resolve();if(current()){pending=null;publish({loading:false,refreshing:false});}}
    })();
    pending={controller,promise,offset};return promise;
  };
  return {
    getSnapshot:()=>snapshot,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
    setContext:(key:string,value:Input|null)=>{if(key===snapshot.key&&value!==null){input=value;return;}cancel();input=value;publish({key,page:null,offset:0,error:null});},
    load,refresh:()=>load(0,true),cancel,
  };
}

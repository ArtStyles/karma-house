import {useCallback,useRef,useState,type ReactNode} from 'react';
import {useFocusEffect} from 'expo-router';
import {Platform,Share,StyleSheet,Text} from 'react-native';
import {useAgencyWorkspace} from '../../agencies/AgencyProvider';
import {prepareAgencyShare,agencyShareUrl} from '../../agencies/share';
import {supabase} from '../../lib/supabase';
import {agencyError} from '../../agencies/domain';
import {ActionGroup,Button,Notice} from '../ui';
import {createThemedStyles} from '../../theme';

/**
 * Shares the public link of an agency listing. The link carries the agency and the person sharing it, so whoever
 * opens it writes to that person inside the agency. Where the browser cannot share, the link is copied instead.
 */
export function useAgencyShare(propertyId:string,title:string){
 const w=useAgencyWorkspace(),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState<{error:boolean;text:string}|null>(null),focused=useRef(false);
 const scope=`${w.activeAgencyId}:${w.generation}:${propertyId}`,current=useRef(scope);current.current=scope;
 useFocusEffect(useCallback(()=>{focused.current=true;setFeedback(null);return()=>{focused.current=false;};},[scope]));
 const available=Boolean(w.enabled&&w.activeAgency?.state==='approved'&&w.membership);
 async function share(){
  if(!supabase||busy)return;setBusy(true);setFeedback(null);let c:ReturnType<typeof w.captureAgencyContext>|undefined;const key=scope,live=()=>focused.current&&current.current===key;
  try{
   c=w.captureAgencyContext();const result=await prepareAgencyShare(supabase,propertyId,c);c.checkpoint();if(!live())return;
   const link=agencyShareUrl(result);
   try{await Share.share({title,message:`${title}\n${link}`,url:link});}
   catch(cause){
    if((cause as {name?:unknown}|null)?.name==='AbortError')return;
    // No share sheet (most desktop browsers): copy the link, or show it to copy by hand.
    try{if(Platform.OS!=='web')throw cause;await navigator.clipboard.writeText(link);if(live())setFeedback({error:false,text:'Enlace copiado. Pégalo donde quieras compartirlo.'});}
    catch{if(live())setFeedback({error:false,text:link});}
   }
  }catch(e){try{c?.checkpoint();if(live())setFeedback({error:true,text:agencyError(e)});}catch{}}
  finally{c?.release();if(live())setBusy(false);}
 }
 return {available,busy,feedback,share};
}

/** A card's action row: the actions passed in, then «Compartir» when the listing can be shared, and its result below. */
export function AgencyShareActions({propertyId,title,shareable,children}:{propertyId:string;title:string;shareable:boolean;children?:ReactNode}){
 const {styles:s}=useStyles(),share=useAgencyShare(propertyId,title);
 return <>
  <ActionGroup style={s.actions}>{children}{shareable&&share.available&&<Button secondary label="Compartir" icon="share-outline" style={s.action} loading={share.busy} onPress={()=>void share.share()}/>}</ActionGroup>
  {share.feedback&&(share.feedback.error?<Notice error>{share.feedback.text}</Notice>:<Text selectable accessibilityLiveRegion="polite" style={s.note}>{share.feedback.text}</Text>)}
 </>;
}
const useStyles=createThemedStyles(colors=>StyleSheet.create({actions:{marginTop:14},action:{minHeight:44},note:{color:colors.muted,fontSize:13,lineHeight:19,marginTop:10}}));

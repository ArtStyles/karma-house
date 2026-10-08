import {useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {useCallback} from 'react';
import {Share,Text,View} from 'react-native';
import {useAgencyWorkspace} from '../../agencies/AgencyProvider';
import {prepareAgencyShare,agencyShareUrl} from '../../agencies/share';
import {supabase} from '../../lib/supabase';
import {agencyError} from '../../agencies/domain';
import {Button,Notice} from '../ui';
import {useAgencyFormStyles} from './AgencyRegistrationFields';
export function AgencyShareButton({propertyId,title}:{propertyId:string;title:string}){
 const w=useAgencyWorkspace(),{styles:s}=useAgencyFormStyles(),[url,setUrl]=useState(''),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false),focused=useRef(false);
 const scope=`${w.activeAgencyId}:${w.generation}:${propertyId}`,current=useRef(scope);current.current=scope;
 useFocusEffect(useCallback(()=>{focused.current=true;setUrl('');setIssue('');return()=>{focused.current=false;};},[scope]));
 if(!w.enabled||w.activeAgency?.state!=='approved'||!w.membership)return null;
 async function share(){if(!supabase||busy)return;setBusy(true);let c:ReturnType<typeof w.captureAgencyContext>|undefined;const key=scope;try{c=w.captureAgencyContext();const result=await prepareAgencyShare(supabase,propertyId,c);c.checkpoint();if(!focused.current||current.current!==key)return;const link=agencyShareUrl(result);setUrl(link);await Share.share({title,message:`${title}\n${link}`,url:link});}catch(e){try{c?.checkpoint();if(focused.current&&current.current===key)setIssue(agencyError(e));}catch{}}finally{c?.release();if(focused.current&&current.current===key)setBusy(false);}}
 return <View style={{gap:8}}><Button label="Compartir con mi inmobiliaria y mi contacto" secondary loading={busy} onPress={()=>void share()}/>{Boolean(issue)&&<Notice error>{issue}</Notice>}{Boolean(url)&&<Text selectable accessibilityLabel="Enlace de mi inmobiliaria" style={s.copy}>{url}</Text>}</View>;
}

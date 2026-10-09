import {useFocusEffect} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {useMarketplace} from './MarketplaceProvider';

/** Keep the known heart visible while account/alias reads reconcile in the background. */
export function useFavoriteHeart(id:string){
  const {mode,ready,favoriteMembership,prepareFavoriteHeart,favoriteIds,canonicalFavoriteId,toggleFavorite}=useMarketplace();
  const auth=useAuth();
  const scope=`${id}:${auth.user?.id??''}:${auth.session?.access_token??''}`;
  const [error,setError]=useState(''),[checking,setChecking]=useState(false);
  const sequence=useRef(0);
  const action=useRef({scope,active:true,sequence:0});
  if(action.current.scope!==scope)action.current={scope,active:true,sequence:0};
  useEffect(()=>{const lease=action.current;lease.active=true;setError('');return()=>{lease.active=false}},[scope]);
  const refresh=useCallback(async()=>{
    const ticket=++sequence.current;
    if(mode==='demo'||!auth.ready||!auth.user||!ready)return;
    setChecking(true);
    try{await prepareFavoriteHeart(id)}
    catch{/* A read failure preserves the cached heart; a tap can retry the actual write. */}
    finally{if(ticket===sequence.current)setChecking(false)}
  },[mode,auth.ready,auth.user?.id,ready,id,scope,prepareFavoriteHeart]);
  useFocusEffect(useCallback(()=>{void refresh();return()=>{sequence.current+=1;setChecking(false)}},[refresh]));
  const favorite=mode==='demo'?favoriteIds.includes(id):auth.ready&&auth.user?(favoriteMembership(id)??favoriteIds.includes(canonicalFavoriteId(id))):false;
  const toggle=useCallback(async()=>{
    const lease=action.current,ticket=++lease.sequence;setError('');
    try{await toggleFavorite(id)}
    catch{if(action.current===lease&&lease.active&&ticket===lease.sequence)setError('No pudimos guardar tu favorito. Inténtalo de nuevo.')}
  },[id,scope,toggleFavorite]);
  return {favorite,error,checking,retry:refresh,toggle};
}

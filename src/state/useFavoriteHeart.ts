import {useFocusEffect} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {useMarketplace} from './MarketplaceProvider';

/** A heart becomes a toggle only after the displayed account membership is resolved. */
export function useFavoriteHeart(id:string){
  const {mode,ready,favoriteMembership,prepareFavoriteHeart,favoriteIds}=useMarketplace();
  const auth=useAuth();
  const scope=`${id}:${auth.user?.id??''}:${auth.session?.access_token??''}`;
  const [resolved,setResolved]=useState(''),[error,setError]=useState(''),[checking,setChecking]=useState(false);
  const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    const ticket=++sequence.current;setResolved('');setError('');
    if(mode==='demo'||!auth.ready||!auth.user||!ready)return;
    setChecking(true);
    try{await prepareFavoriteHeart(id);if(ticket===sequence.current)setResolved(scope)}
    catch{if(ticket===sequence.current)setError('No pudimos comprobar tus favoritos. Toca para reintentar.')}
    finally{if(ticket===sequence.current)setChecking(false)}
  },[mode,auth.ready,auth.user?.id,ready,id,scope,prepareFavoriteHeart]);
  useFocusEffect(useCallback(()=>{void refresh();return()=>{sequence.current+=1;setResolved('');setChecking(false)}},[refresh]));
  const favorite=mode==='demo'?favoriteIds.includes(id):!auth.ready?null:!auth.user?false:resolved===scope?favoriteMembership(id):null;
  return {favorite,error,checking,retry:refresh};
}

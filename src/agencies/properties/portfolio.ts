import {listingBoardState,type ListingBoardState} from '../../domain/listings.ts';
import type {AgencyProperty} from './types.ts';

export interface PortfolioFilter {query:string;state:'all'|ListingBoardState;origin:'all'|'own'|'authorized'}
const fold=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
/** References KarmaHouse wrote itself (owner sales moved into the agency) say nothing to the team. */
export const shownReference=(reference:string)=>/^(kh-|Anuncio propio )/.test(reference)?null:reference;
/** Search ignores case and accents across title, place and reference; «own» means this agency is the origin. */
export function filterPortfolio(items:AgencyProperty[],filter:PortfolioFilter,agencyId:string|null){
 const needle=fold(filter.query.trim());
 return items.filter(item=>(filter.state==='all'||listingBoardState(item.property)===filter.state)
  &&(filter.origin==='all'||(filter.origin==='own')===(item.originAgencyId===agencyId))
  &&(!needle||fold(`${item.property.title} ${item.property.location} ${item.property.province??''} ${shownReference(item.mandate.reference)??''}`).includes(needle)));
}

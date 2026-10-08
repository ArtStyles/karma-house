import type {Listing,ListingDraft} from '../../domain/listings';
import type {AgencyPublicationPolicy,AgencyRequestContext,MandateState,Page} from '../types';
export interface AgencyProperty {
 property:Listing;originAgencyId:string|null;authorityVersion:number;cycleId:string;
 mandate:{agencyId:string;state:MandateState;version:number;reference:string};
 canEditCommon:boolean;canConfirmSale:boolean;publicationPolicy:AgencyPublicationPolicy;moderationHold:boolean;
}
export interface AgencyPropertySaveInput {draft:ListingDraft;publicationIntent:'draft'|'submit';propertyId?:string;expectedVersion?:number;sourceReference:string;consentReference:string;clientRequestId:string}
export interface AgencyPropertyRepository {list(offset:number,context:AgencyRequestContext):Promise<Page<AgencyProperty>>;get(propertyId:string,context:AgencyRequestContext):Promise<AgencyProperty>;save(input:AgencyPropertySaveInput,context:AgencyRequestContext):Promise<AgencyProperty>}

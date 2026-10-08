import type {AgencyApplicationInput} from './types.ts';

/** This flag is decoded only from protected server projections, never Auth metadata. */
export function decodePrincipalStatus(value:unknown,verified:boolean):boolean{
 if(value===undefined)return false;
 if(typeof value!=='boolean'||(value&&!verified))throw Error('No se pudieron interpretar los datos de la inmobiliaria.');
 return value;
}

export function principalCommercialDraft(tradeName:string):Omit<AgencyApplicationInput,'responsibleFullName'|'evidenceReferences'>{
 return {tradeName,businessPhone:'',province:'',municipality:'',serviceAreas:[],description:'',officeAddress:null,publishOfficeAddress:false};
}

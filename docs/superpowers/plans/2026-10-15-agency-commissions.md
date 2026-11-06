# Comisiones de inmobiliaria — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada inmobiliaria define en la app su tabla de comisiones por rango de precio y sus repartos especiales, y cada miembro ve la tabla, una calculadora y lo que ganó en sus cierres.

**Architecture:** Tres tablas privadas en Supabase (`kh_private`): la tabla de comisiones, los repartos especiales y una instantánea inmutable por cierre. Un trigger `after insert` sobre `property_sale_closures` crea la instantánea, así que el flujo de cierre existente no cambia. Tres RPC siguen el patrón de `kh_update_agency_profile`. En el cliente hay un módulo `src/agencies/commissions/` (tipos, funciones puras y repositorio) y dos pantallas de Expo Router.

**Tech Stack:** Postgres/Supabase (plpgsql, `security definer`), Expo Router + React Native (TypeScript), `node:test` para TS y suites SQL con rollback.

**Spec:** `docs/superpowers/specs/2026-10-15-agency-commissions-design.md`

**Diferencias con la especificación (deliberadas):**
- La especificación tiene una revisión de diseño («Mediopunto», `DESIGN.md`, lienzo «KarmaHouse de noche») escrita desde la sesión «Diseño de aplicación web y APK». Este plan aplica sus puntos así:
  - Cálculo en centavos enteros, con redondeo a la mitad hacia arriba igual que Postgres.
  - `totals.commissionUsd` para el administrador.
  - Versión, autor y fecha de la tabla visibles (`tableStamp`).
  - Un texto sobre qué pasa al salir del equipo.
  - Paginación numerada («Página n de N») en lugar de «Ver más».
  - Una línea fija en el editor sobre el salto entre rangos (decisión 6).
- `DESIGN.md` y el lienzo no están en esta copia del repositorio. Las pantallas usan los componentes actuales (`useAgencyFormStyles`, `Notice`, `Button`). Si el lienzo está disponible al ejecutar, ajusta la disposición a él sin cambiar los datos ni los textos de producto.
- `effectiveShare` no existe como función aparte: `computeCommission(tiers, amount, overridePct)` ya aplica el reparto especial.
- Los importes usan `formatCommissionUsd` («1000 USD»), igual que la pantalla de cierres, y no `formatUsd` («$ 1000»), porque `$` también se usa para CUP.
- Hay dos errores nuevos además de `KH_AGENCY_COMMISSION_INVALID`:
  - `KH_AGENCY_COMMISSION_MEMBER`: el destinatario no está en el equipo.
  - `KH_AGENCY_COMMISSION_FROZEN`: alguien intenta tocar una instantánea.

**Reglas para quien ejecute:**
- No uses APIs de Expo nuevas. Si hiciera falta alguna, lee antes https://docs.expo.dev/versions/v57.0.0/ (AGENTS.md).
- Las tareas 5 y 9 tocan la base de datos de **producción**. No las ejecutes sin un «sí» explícito del usuario en el chat para esa tarea.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/agencies/commissions/types.ts` | Crear | Tipos de tabla, instantánea, cierre y respuesta |
| `src/agencies/commissions/domain.ts` | Crear | Validar tabla, rango, cálculo, parseo y formato (puro) |
| `src/agencies/commissions/repository.ts` | Crear | RPC con `createScopedRpc` y decodificación estricta |
| `src/agencies/domain.ts` | Modificar (`agencyError`) | Mensajes de los errores nuevos |
| `tests/agency-commissions.test.ts` | Crear | Pruebas de dominio, repositorio y errores |
| `supabase/migrations/20261015000400_agency_commissions.sql` | Crear | Tablas, triggers y RPC |
| `supabase/tests/agency_commissions.sql` | Crear | Suite SQL con rollback (ids `51…`) |
| `scripts/apply-reviewed-migration.mjs` | Modificar (prefijos) | Detectar filas sintéticas `51…` sobrantes |
| `src/screens/AgencyCommissionsScreen.tsx` | Crear | Pantalla «Comisiones» de cualquier miembro |
| `src/screens/AgencyCommissionTableScreen.tsx` | Crear | Editor de tabla y repartos (administrador) |
| `src/app/agency-commissions.tsx`, `src/app/agency-commission-table.tsx` | Crear | Rutas de una línea |
| `src/screens/AgencyWorkspaceScreen.tsx` | Modificar (`links`) | Enlaces a las pantallas nuevas |
| `docs/agency-workspaces-operation.md` | Modificar | Sección «Comisiones» |

---

### Task 1: Dominio puro de comisiones

**Files:**
- Create: `src/agencies/commissions/types.ts`
- Create: `src/agencies/commissions/domain.ts`
- Test: `tests/agency-commissions.test.ts`

- [ ] **Step 1: Crear los tipos**

`src/agencies/commissions/types.ts`:

```ts
export interface CommissionTier {upToUsd:number|null;ratePct:number;managerSharePct:number}
export interface CommissionTable {tiers:CommissionTier[];version:number;updatedAt:string;updatedByName:string}
export interface CommissionQuote {tierIndex:number;ratePct:number;sharePct:number;commissionUsd:number;managerUsd:number}
export interface CommissionSnapshot extends CommissionQuote {shareSource:'table'|'override';tableVersion:number}
export interface CommissionClosure {closureId:string;propertyTitle:string;confirmedAt:string;amountUsd:number;managerId:string;managerName:string;commission:CommissionSnapshot|null}
export interface CommissionOverride {userId:string;displayName:string;sharePct:number}
export interface AgencyCommissions {agencyId:string;table:CommissionTable|null;myShare:{pct:number}|null;overrides:CommissionOverride[];closures:{items:CommissionClosure[];hasMore:boolean;total:number};totals:{count:number;commissionUsd:number;managerUsd:number}}
/** Closures per page; the screen numbers pages from `closures.total`. */
export const COMMISSION_PAGE_SIZE=30;
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`tests/agency-commissions.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {computeCommission,parseCommissionNumber,tableStamp,tierFor,tierLabel,validateTiers} from '../src/agencies/commissions/domain.ts';
const tiers=[{upToUsd:20000,ratePct:5,managerSharePct:40},{upToUsd:60000,ratePct:4,managerSharePct:40},{upToUsd:null,ratePct:3,managerSharePct:40}];
test('tierFor includes the upper limit and sends larger prices to the last range',()=>{
 assert.equal(tierFor(tiers,20000),0);assert.equal(tierFor(tiers,20000.01),1);assert.equal(tierFor(tiers,60000),1);assert.equal(tierFor(tiers,60001),2);
 assert.equal(tierFor([{upToUsd:null,ratePct:5,managerSharePct:40}],1),0);
});
test('computeCommission rounds half up to cents like Postgres round(x,2)',()=>{
 assert.deepEqual(computeCommission(tiers,20000,null),{tierIndex:0,ratePct:5,sharePct:40,commissionUsd:1000,managerUsd:400});
 assert.deepEqual(computeCommission(tiers,60001,50),{tierIndex:2,ratePct:3,sharePct:50,commissionUsd:1800.03,managerUsd:900.02});
 assert.equal(computeCommission(tiers,12345.67,null).commissionUsd,617.28);
 assert.equal(computeCommission(tiers,12345.67,null).managerUsd,246.91);
});
test('a special share replaces the range share, including zero',()=>{
 assert.equal(computeCommission(tiers,20000,50).managerUsd,500);
 assert.equal(computeCommission(tiers,20000,0).managerUsd,0);
});
test('validateTiers accepts the example table and rejects broken ones with a Revisa message',()=>{
 assert.deepEqual(validateTiers(tiers),tiers);
 const bad:unknown[]=[[],tiers.slice(0,2),[{upToUsd:null,ratePct:5,managerSharePct:40},{upToUsd:null,ratePct:4,managerSharePct:40}],
  [{upToUsd:60000,ratePct:5,managerSharePct:40},{upToUsd:20000,ratePct:4,managerSharePct:40},{upToUsd:null,ratePct:3,managerSharePct:40}],
  [{upToUsd:20000,ratePct:5,managerSharePct:40},{upToUsd:20000,ratePct:4,managerSharePct:40},{upToUsd:null,ratePct:3,managerSharePct:40}],
  [{upToUsd:null,ratePct:0,managerSharePct:40}],[{upToUsd:null,ratePct:31,managerSharePct:40}],[{upToUsd:null,ratePct:5,managerSharePct:101}],
  [{upToUsd:null,ratePct:5.001,managerSharePct:40}],[{upToUsd:20000.5,ratePct:5,managerSharePct:40},{upToUsd:null,ratePct:5,managerSharePct:40}],
  [{upToUsd:null,ratePct:5,managerSharePct:40,extra:1}],[{upToUsd:null,ratePct:'5',managerSharePct:40}],
  Array.from({length:9},(_,i)=>({upToUsd:i<8?(i+1)*1000:null,ratePct:5,managerSharePct:40}))];
 for(const value of bad)assert.throws(()=>validateTiers(value),/^Error: Revisa/);
});
test('parseCommissionNumber reads Cuban ways of writing numbers',()=>{
 assert.equal(parseCommissionNumber('20000'),20000);assert.equal(parseCommissionNumber('20 000'),20000);assert.equal(parseCommissionNumber('20.000'),20000);
 assert.equal(parseCommissionNumber('4,5'),4.5);assert.equal(parseCommissionNumber('4.5'),4.5);
 for(const bad of['','abc','-5','4,5,1'])assert.equal(parseCommissionNumber(bad),null);
});
test('tableStamp shows version, author and the Havana date',()=>{
 assert.match(tableStamp({tiers,version:2,updatedAt:'2026-10-15T03:00:00Z',updatedByName:'Ana'}),/^Versión 2 · Cambiada por Ana el 14 oct/);
});
test('tierLabel names each range',()=>{
 assert.equal(tierLabel(tiers,0),'Hasta 20.000 USD');assert.equal(tierLabel(tiers,1),'Más de 20.000 hasta 60.000 USD');assert.equal(tierLabel(tiers,2),'Más de 60.000 USD');
 assert.equal(tierLabel([{upToUsd:null,ratePct:5,managerSharePct:40}],0),'Cualquier precio');
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `node --experimental-strip-types --test tests/agency-commissions.test.ts`
Expected: FAIL con `Cannot find module '…/src/agencies/commissions/domain.ts'`.

- [ ] **Step 4: Implementar el dominio**

`src/agencies/commissions/domain.ts`:

```ts
import {NEGOTIATION_TIME_ZONE} from '../../negotiations/domain.ts';
import type {CommissionQuote,CommissionTable,CommissionTier} from './types.ts';
export const MAX_COMMISSION_TIERS=8;
const MAX_UP_TO_USD=1_000_000_000;
/** Whole hundredths: cents for USD, basis points for percentages. Inputs are validated to two decimals. */
const hundredths=(n:number)=>Math.round(n*100);
const twoDecimals=(n:number)=>Number.isFinite(n)&&Math.abs(n*100-hundredths(n))<1e-6;
const percent=(v:unknown,max:number):v is number=>typeof v==='number'&&twoDecimals(v)&&v>=0&&v<=max;
export const isSharePct=(v:unknown):v is number=>percent(v,100);
// Integer half-up division, so the estimate rounds exactly like Postgres numeric round(x,2).
const halfUp=(numerator:number,denominator:number)=>Math.floor((2*numerator+denominator)/(2*denominator));
export function validateTiers(value:unknown):CommissionTier[]{
 if(!Array.isArray(value)||value.length<1||value.length>MAX_COMMISSION_TIERS)throw Error(`Revisa la tabla: debe tener entre 1 y ${MAX_COMMISSION_TIERS} rangos.`);
 let previous=0;
 return value.map((raw,index)=>{
  const row=index+1,last=index===value.length-1;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error(`Revisa el rango ${row}.`);
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).length!==3||!['upToUsd','ratePct','managerSharePct'].every(key=>key in v))throw Error(`Revisa el rango ${row}.`);
  const upTo=v.upToUsd;
  if(last?upTo!==null:!(typeof upTo==='number'&&Number.isSafeInteger(upTo)&&upTo>previous&&upTo<=MAX_UP_TO_USD))
   throw Error(last?'Revisa el último rango: no lleva límite.':`Revisa el rango ${row}: el límite debe ser un número entero mayor que el del rango anterior.`);
  if(!percent(v.ratePct,30)||v.ratePct===0)throw Error(`Revisa el rango ${row}: la comisión va de 0,01 a 30 %.`);
  if(!percent(v.managerSharePct,100))throw Error(`Revisa el rango ${row}: la parte del gestor va de 0 a 100 %.`);
  if(!last)previous=upTo as number;
  return {upToUsd:upTo as number|null,ratePct:v.ratePct as number,managerSharePct:v.managerSharePct as number};
 });
}
export function tierFor(tiers:readonly CommissionTier[],amountUsd:number):number{
 const index=tiers.findIndex(tier=>tier.upToUsd===null||amountUsd<=tier.upToUsd);
 return index<0?tiers.length-1:index;
}
export function computeCommission(tiers:readonly CommissionTier[],amountUsd:number,overridePct:number|null):CommissionQuote{
 const tierIndex=tierFor(tiers,amountUsd),tier=tiers[tierIndex],sharePct=overridePct??tier.managerSharePct;
 const commissionCents=halfUp(hundredths(amountUsd)*hundredths(tier.ratePct),10000);
 const managerCents=halfUp(commissionCents*hundredths(sharePct),10000);
 return {tierIndex,ratePct:tier.ratePct,sharePct,commissionUsd:commissionCents/100,managerUsd:managerCents/100};
}
/** "20000", "20 000", "20.000", "4,5" and "4.5"; null for anything else. */
export function parseCommissionNumber(text:string):number|null{
 const compact=text.replace(/\s/g,'');
 const normalized=/^\d{1,3}(\.\d{3})+$/.test(compact)?compact.replace(/\./g,''):compact.replace(',','.');
 return /^\d+(\.\d+)?$/.test(normalized)?Number(normalized):null;
}
const number=(n:number)=>n.toLocaleString('es',{maximumFractionDigits:2,useGrouping:true});
export const formatCommissionUsd=(n:number)=>`${number(n)} USD`;
export const formatCommissionPct=(n:number)=>`${number(n)} %`;
export function tierLabel(tiers:readonly CommissionTier[],index:number):string{
 const upTo=tiers[index].upToUsd,from=index===0?null:tiers[index-1].upToUsd;
 if(upTo===null)return from===null?'Cualquier precio':`Más de ${formatCommissionUsd(from)}`;
 return from===null?`Hasta ${formatCommissionUsd(upTo)}`:`Más de ${number(from)} hasta ${formatCommissionUsd(upTo)}`;
}
/** Version and author of the table, so the team knows which rules are current. */
export function tableStamp(table:CommissionTable):string{
 const date=new Date(table.updatedAt).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric',timeZone:NEGOTIATION_TIME_ZONE});
 return `Versión ${table.version} · Cambiada por ${table.updatedByName} el ${date}`;
}
```

Nota: cómo se agrupan los números de 4 cifras (`1800` o `1.800`) cambia entre motores de `Intl`. Por eso las pruebas solo comprueban números de 5 cifras (`20.000`).

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `node --experimental-strip-types --test tests/agency-commissions.test.ts`
Expected: PASS, 7 pruebas. Si `tierLabel` falla por el separador de miles, comprueba que Node tiene ICU completo (`node -p "(20000).toLocaleString('es')"` debe dar `20.000`). No cambies la prueba para ocultar el fallo.

- [ ] **Step 6: Commit**

```bash
git add src/agencies/commissions/types.ts src/agencies/commissions/domain.ts tests/agency-commissions.test.ts
git commit -m "feat(agency): add the commission table domain"
```

---

### Task 2: Repositorio y mensajes de error

**Files:**
- Create: `src/agencies/commissions/repository.ts`
- Modify: `src/agencies/domain.ts` (función `agencyError`, después de la línea de `KH_AGENCY_LAST_ADMIN`)
- Test: `tests/agency-commissions.test.ts` (añadir al final)

- [ ] **Step 1: Añadir las pruebas que fallan**

Añade al principio de `tests/agency-commissions.test.ts`, junto a los otros imports:

```ts
import {createAgencyCommissionRepository} from '../src/agencies/commissions/repository.ts';
import {agencyError} from '../src/agencies/domain.ts';
```

Y al final del archivo:

```ts
const id=(n:number)=>`51000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={userId:id(1),agencyId:id(2),generation:1,accessToken:'pinned',signal:new AbortController().signal,checkpoint(){}};
const snapshot={tierIndex:0,ratePct:5,sharePct:50,shareSource:'override',commissionUsd:1000,managerUsd:500,tableVersion:1};
const response={agencyId:id(2),table:{tiers,version:1,updatedAt:'2026-10-15T11:00:00.5+00:00',updatedByName:'Administradora'},myShare:{pct:50},overrides:[],
 closures:{items:[{closureId:id(3),propertyTitle:'Casa',confirmedAt:'2026-10-15T12:00:00.123456+00:00',amountUsd:20000,managerId:id(1),managerName:'Gestor',commission:snapshot}],hasMore:false,total:1},
 totals:{count:1,commissionUsd:1000,managerUsd:500}};
function fixture(data:unknown){const calls:any[]=[];const client={rpc(name:string,args:any){calls.push({name,args});return{setHeader(_k:string,v:string){assert.equal(v,'Bearer pinned');return this},async abortSignal(){return{data,error:null}}}}};return{repo:createAgencyCommissionRepository(client as any),calls};}
test('get pins actor and agency and decodes the frozen snapshot',async()=>{
 const{repo,calls}=fixture(response);const r=await repo.get(0,context);
 assert.equal(calls[0].name,'kh_agency_commissions');assert.equal(calls[0].args.p_actor_id,id(1));assert.equal(calls[0].args.p_agency_id,id(2));assert.equal(calls[0].args.p_offset,0);
 assert.equal(r.closures.items[0].commission?.managerUsd,500);assert.equal(r.myShare?.pct,50);assert.equal(r.table?.tiers.length,3);
 assert.equal(r.table?.updatedByName,'Administradora');assert.equal(r.closures.total,1);assert.equal(r.totals.commissionUsd,1000);
});
test('a closure without snapshot and an agency without table decode as null',async()=>{
 const r=await fixture({...response,table:null,myShare:null,closures:{items:[{...response.closures.items[0],commission:null}],hasMore:true,total:31}}).repo.get(30,context);
 assert.equal(r.table,null);assert.equal(r.closures.items[0].commission,null);assert.equal(r.closures.hasMore,true);
});
test('foreign agency, unknown fields and broken data are rejected',async()=>{
 const item=response.closures.items[0];
 for(const bad of[{...response,agencyId:id(9)},{...response,extra:1},{...response,table:{...response.table,tiers:[]}},
  {...response,table:{...response.table,updatedAt:'ayer'}},
  {...response,closures:{items:[{...item,commission:{...snapshot,shareSource:'guess'}}],hasMore:false,total:1}},
  {...response,closures:{items:[{...item,amountUsd:-1}],hasMore:false,total:1}},{...response,closures:{items:[item],hasMore:false}},
  {...response,totals:{count:1,managerUsd:500}}])
  await assert.rejects(fixture(bad).repo.get(0,context));
});
test('invalid writes never reach the server',async()=>{
 const{repo,calls}=fixture(response);
 await assert.rejects(repo.saveTable({tiers:[{upToUsd:20000,ratePct:5,managerSharePct:40}],expectedVersion:0,clientRequestId:id(4)},context));
 await assert.rejects(repo.setOverride({userId:id(5),sharePct:101,clientRequestId:id(4)},context));
 await assert.rejects(repo.setOverride({userId:'nadie',sharePct:50,clientRequestId:id(4)},context));
 assert.equal(calls.length,0);
});
test('writes send the validated payload; null removes a special share',async()=>{
 const{repo,calls}=fixture(response);
 await repo.saveTable({tiers,expectedVersion:0,clientRequestId:id(4)},context);
 assert.equal(calls[0].name,'kh_save_agency_commission_table');assert.deepEqual(calls[0].args.p_payload,{tiers,expectedVersion:0,clientRequestId:id(4)});
 await repo.setOverride({userId:id(5),sharePct:null,clientRequestId:id(6)},context);
 assert.equal(calls[1].name,'kh_set_agency_commission_override');assert.equal(calls[1].args.p_payload.sharePct,null);
});
test('commission errors become readable messages',()=>{
 assert.match(agencyError(Error('KH_AGENCY_COMMISSION_INVALID')),/^Revisa la tabla/);
 assert.match(agencyError(Error('KH_AGENCY_COMMISSION_MEMBER')),/ya no forma parte del equipo/);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `node --experimental-strip-types --test tests/agency-commissions.test.ts`
Expected: FAIL con `Cannot find module '…/src/agencies/commissions/repository.ts'`.

- [ ] **Step 3: Implementar el repositorio**

`src/agencies/commissions/repository.ts`:

```ts
import type {SupabaseClient} from '@supabase/supabase-js';
import {createScopedRpc} from '../../transfers/repository.ts';
import {integer,object,text,timestamp,uuid} from '../deals/domain.ts';
import type {AgencyRequestContext} from '../types.ts';
import {isSharePct,validateTiers} from './domain.ts';
import {COMMISSION_PAGE_SIZE,type AgencyCommissions,type CommissionClosure,type CommissionSnapshot,type CommissionTable,type CommissionTier} from './types.ts';
const invalid=()=>Error('No se pudieron interpretar las comisiones.');
function keys(v:Record<string,unknown>,expected:readonly string[]){if(Object.keys(v).length!==expected.length||expected.some(k=>!(k in v)))throw invalid();return v;}
function money(v:unknown):number{if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw invalid();return v;}
function pct(v:unknown):number{if(!isSharePct(v))throw invalid();return v;}
function snapshot(value:unknown):CommissionSnapshot|null{
 if(value===null)return null;
 const v=keys(object(value),['tierIndex','ratePct','sharePct','shareSource','commissionUsd','managerUsd','tableVersion']);
 if(v.shareSource!=='table'&&v.shareSource!=='override')throw invalid();
 return {tierIndex:integer(v.tierIndex),ratePct:pct(v.ratePct),sharePct:pct(v.sharePct),shareSource:v.shareSource,commissionUsd:money(v.commissionUsd),managerUsd:money(v.managerUsd),tableVersion:integer(v.tableVersion,1)};
}
function closure(value:unknown):CommissionClosure{
 const v=keys(object(value),['closureId','propertyTitle','confirmedAt','amountUsd','managerId','managerName','commission']);
 return {closureId:uuid(v.closureId),propertyTitle:text(v.propertyTitle),confirmedAt:timestamp(v.confirmedAt),amountUsd:money(v.amountUsd),managerId:uuid(v.managerId),managerName:text(v.managerName),commission:snapshot(v.commission)};
}
function table(value:unknown):CommissionTable|null{
 if(value===null)return null;
 const v=keys(object(value),['tiers','version','updatedAt','updatedByName']);
 let tiers:CommissionTier[];try{tiers=validateTiers(v.tiers);}catch{throw invalid();}
 return {tiers,version:integer(v.version,1),updatedAt:timestamp(v.updatedAt),updatedByName:text(v.updatedByName)};
}
export function decodeAgencyCommissions(value:unknown,context:AgencyRequestContext):AgencyCommissions{
 const v=keys(object(value),['agencyId','table','myShare','overrides','closures','totals']);
 if(v.agencyId!==context.agencyId||!Array.isArray(v.overrides))throw invalid();
 const page=keys(object(v.closures),['items','hasMore','total']),totals=keys(object(v.totals),['count','commissionUsd','managerUsd']);
 if(!Array.isArray(page.items)||page.items.length>COMMISSION_PAGE_SIZE||typeof page.hasMore!=='boolean')throw invalid();
 return {
  agencyId:context.agencyId,table:table(v.table),
  myShare:v.myShare===null?null:{pct:pct(keys(object(v.myShare),['pct']).pct)},
  overrides:v.overrides.map(raw=>{const o=keys(object(raw),['userId','displayName','sharePct']);return {userId:uuid(o.userId),displayName:text(o.displayName),sharePct:pct(o.sharePct)};}),
  closures:{items:page.items.map(closure),hasMore:page.hasMore,total:integer(page.total)},
  totals:{count:integer(totals.count),commissionUsd:money(totals.commissionUsd),managerUsd:money(totals.managerUsd)},
 };
}
export function createAgencyCommissionRepository(client:SupabaseClient){
 const rpc=createScopedRpc(client);
 return {
  async get(offset:number,c:AgencyRequestContext){
   return decodeAgencyCommissions(await rpc('kh_agency_commissions',{p_agency_id:c.agencyId,p_offset:offset,p_limit:COMMISSION_PAGE_SIZE},c),c);
  },
  async saveTable(payload:{tiers:CommissionTier[];expectedVersion:number;clientRequestId:string},c:AgencyRequestContext){
   const tiers=validateTiers(payload.tiers);integer(payload.expectedVersion);uuid(payload.clientRequestId);
   return decodeAgencyCommissions(await rpc('kh_save_agency_commission_table',{p_agency_id:c.agencyId,p_payload:{tiers,expectedVersion:payload.expectedVersion,clientRequestId:payload.clientRequestId}},c),c);
  },
  async setOverride(payload:{userId:string;sharePct:number|null;clientRequestId:string},c:AgencyRequestContext){
   uuid(payload.userId);uuid(payload.clientRequestId);
   if(payload.sharePct!==null&&!isSharePct(payload.sharePct))throw Error('Revisa el reparto especial: va de 0 a 100 %.');
   return decodeAgencyCommissions(await rpc('kh_set_agency_commission_override',{p_agency_id:c.agencyId,p_payload:{userId:payload.userId,sharePct:payload.sharePct,clientRequestId:payload.clientRequestId}},c),c);
  },
 };
}
export type AgencyCommissionRepository=ReturnType<typeof createAgencyCommissionRepository>;
```

- [ ] **Step 4: Añadir los mensajes en `agencyError`**

En `src/agencies/domain.ts`, justo después de la línea `if(/KH_AGENCY_LAST_ADMIN/.test(message))return …;`, añade:

```ts
 if(/KH_AGENCY_COMMISSION_INVALID/.test(message))return 'Revisa la tabla: los rangos deben ir de menor a mayor y los porcentajes estar dentro de los límites.';
 if(/KH_AGENCY_COMMISSION_MEMBER/.test(message))return 'Esa persona ya no forma parte del equipo. Actualiza la lista.';
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `node --experimental-strip-types --test tests/agency-commissions.test.ts`
Expected: PASS, 13 pruebas.

Run: `npm run check`
Expected: typecheck sin errores y todas las pruebas en verde.

- [ ] **Step 6: Commit**

```bash
git add src/agencies/commissions/repository.ts src/agencies/domain.ts tests/agency-commissions.test.ts
git commit -m "feat(agency): read and save commission tables from the client"
```

---

### Task 3: Migración

**Files:**
- Create: `supabase/migrations/20261015000400_agency_commissions.sql`

- [ ] **Step 1: Escribir la migración completa**

`supabase/migrations/20261015000400_agency_commissions.sql`:

```sql
-- Commission tables per agency, special shares per member and a frozen snapshot per confirmed sale.
-- Private to each agency: nothing here reaches notifications, public profiles or other agencies.
create function kh_private.commission_tiers_valid(t jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare n integer;i integer;e jsonb;up numeric;prev numeric:=0;r numeric;s numeric;
begin
 if jsonb_typeof(t) is distinct from 'array' then return false;end if;
 n:=jsonb_array_length(t);if n<1 or n>8 then return false;end if;
 for i in 0..n-1 loop
  e:=t->i;
  if jsonb_typeof(e) is distinct from 'object' or (select count(*) from jsonb_object_keys(e))<>3 or not(e ?& array['upToUsd','ratePct','managerSharePct']) then return false;end if;
  if jsonb_typeof(e->'ratePct')<>'number' or jsonb_typeof(e->'managerSharePct')<>'number' then return false;end if;
  r:=(e->>'ratePct')::numeric;s:=(e->>'managerSharePct')::numeric;
  if r<=0 or r>30 or r<>round(r,2) or s<0 or s>100 or s<>round(s,2) then return false;end if;
  if i=n-1 then
   if e->'upToUsd'<>'null'::jsonb then return false;end if;
  else
   if jsonb_typeof(e->'upToUsd')<>'number' then return false;end if;
   up:=(e->>'upToUsd')::numeric;
   if up<>trunc(up) or up<1 or up>1000000000 or up<=prev then return false;end if;
   prev:=up;
  end if;
 end loop;
 return true;
end $$;

create table kh_private.agency_commission_tables(
 agency_id uuid primary key references kh_private.agencies(id) on delete restrict,
 tiers jsonb not null check(kh_private.commission_tiers_valid(tiers)),
 version integer not null default 1 check(version>0),
 updated_by uuid not null,updated_at timestamptz not null default clock_timestamp()
);
-- A special share lives only while the membership does; leaving the agency deletes it (trigger below).
create table kh_private.agency_commission_overrides(
 agency_id uuid not null,user_id uuid not null,
 share_pct numeric not null check(share_pct>=0 and share_pct<=100 and share_pct=round(share_pct,2)),
 set_by uuid not null,set_at timestamptz not null default clock_timestamp(),
 primary key(agency_id,user_id),
 foreign key(agency_id,user_id) references kh_private.agency_memberships(agency_id,user_id) on delete cascade
);
create table kh_private.sale_closure_commissions(
 closure_id uuid primary key references kh_private.property_sale_closures(id) on delete restrict,
 agency_id uuid not null references kh_private.agencies(id),manager_id uuid not null,
 amount_usd numeric not null,tier_index integer not null check(tier_index between 0 and 7),
 rate_pct numeric not null,share_pct numeric not null,share_source text not null check(share_source in('table','override')),
 commission_usd numeric not null,manager_usd numeric not null,table_version integer not null,
 created_at timestamptz not null default clock_timestamp()
);
create index sale_closure_commissions_manager on kh_private.sale_closure_commissions(agency_id,manager_id);
do $$ declare t text;begin
 foreach t in array array['agency_commission_tables','agency_commission_overrides','sale_closure_commissions'] loop
  execute format('alter table kh_private.%I enable row level security',t);
  execute format('revoke all on kh_private.%I from public,anon,authenticated',t);
 end loop;
end $$;

-- The quote the snapshot freezes: the executing agency's table and the executing manager's share, now.
create function kh_private.commission_quote(p_agency uuid,p_manager uuid,p_amount numeric) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t kh_private.agency_commission_tables;o numeric;i integer:=0;n integer;e jsonb;rate numeric;share numeric;commission numeric;
begin
 select * into t from kh_private.agency_commission_tables where agency_id=p_agency;
 if not found or p_amount is null then return null;end if;
 n:=jsonb_array_length(t.tiers);
 while i<n-1 and (t.tiers->i->>'upToUsd')::numeric<p_amount loop i:=i+1;end loop;
 e:=t.tiers->i;rate:=(e->>'ratePct')::numeric;
 select share_pct into o from kh_private.agency_commission_overrides where agency_id=p_agency and user_id=p_manager;
 share:=coalesce(o,(e->>'managerSharePct')::numeric);
 commission:=round(p_amount*rate/100,2);
 return jsonb_build_object('tierIndex',i,'ratePct',rate,'sharePct',share,'shareSource',case when o is null then 'table' else 'override' end,
  'commissionUsd',commission,'managerUsd',round(commission*share/100,2),'tableVersion',t.version);
end $$;

create function kh_private.snapshot_sale_commission() returns trigger language plpgsql security definer set search_path='' as $$
declare q jsonb;begin
 if new.executing_agency_id is null then return null;end if;
 q:=kh_private.commission_quote(new.executing_agency_id,new.executing_manager_id,new.amount_usd);
 if q is null then return null;end if;
 insert into kh_private.sale_closure_commissions(closure_id,agency_id,manager_id,amount_usd,tier_index,rate_pct,share_pct,share_source,commission_usd,manager_usd,table_version)
 values(new.id,new.executing_agency_id,new.executing_manager_id,new.amount_usd,(q->>'tierIndex')::integer,(q->>'ratePct')::numeric,(q->>'sharePct')::numeric,
  q->>'shareSource',(q->>'commissionUsd')::numeric,(q->>'managerUsd')::numeric,(q->>'tableVersion')::integer);
 return null;
end $$;
create trigger kh_agency_sale_commission after insert on kh_private.property_sale_closures
 for each row execute function kh_private.snapshot_sale_commission();

create function kh_private.freeze_sale_commission() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'KH_AGENCY_COMMISSION_FROZEN';end $$;
create trigger kh_agency_sale_commission_frozen before update or delete on kh_private.sale_closure_commissions
 for each row execute function kh_private.freeze_sale_commission();

create function kh_private.drop_commission_override() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from kh_private.agency_commission_overrides where agency_id=new.agency_id and user_id=new.user_id;return null;end $$;
create trigger kh_agency_commission_override_exit after update of state on kh_private.agency_memberships
 for each row when (old.state='active' and new.state='removed') execute function kh_private.drop_commission_override();

create function kh_private.commission_closure_json(p_closure uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('closureId',c.id,
  'propertyTitle',coalesce((select title from public.properties where id=c.property_id),(select title from kh_private.agency_property_identities where property_id=c.property_id),'Vivienda'),
  'confirmedAt',c.confirmed_at,'amountUsd',c.amount_usd,'managerId',c.executing_manager_id,
  'managerName',coalesce((select display_name from public.profiles where id=c.executing_manager_id),'Cuenta eliminada'),
  'commission',(select jsonb_build_object('tierIndex',x.tier_index,'ratePct',x.rate_pct,'sharePct',x.share_pct,'shareSource',x.share_source,
   'commissionUsd',x.commission_usd,'managerUsd',x.manager_usd,'tableVersion',x.table_version) from kh_private.sale_closure_commissions x where x.closure_id=c.id))
 from kh_private.property_sale_closures c where c.id=p_closure
$$;

-- Any active member reads, also in history mode with the module off. Admins see the whole team; others only their own sales.
create function public.kh_agency_commissions(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare admin boolean;lim integer:=least(greatest(p_limit,1),50);off integer:=greatest(p_offset,0);items jsonb;
begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'manager');
 admin:=exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and user_id=p_actor_id and state='active' and role='admin');
 select coalesce(jsonb_agg(kh_private.commission_closure_json(q.id) order by q.confirmed_at desc,q.id),'[]') into items from(
  select id,confirmed_at from kh_private.property_sale_closures
  where executing_agency_id=p_agency_id and (admin or executing_manager_id=p_actor_id)
  order by confirmed_at desc,id offset off limit lim) q;
 return jsonb_build_object('agencyId',p_agency_id,
  'table',(select jsonb_build_object('tiers',t.tiers,'version',t.version,'updatedAt',t.updated_at,
   'updatedByName',coalesce((select display_name from public.profiles where id=t.updated_by),'Cuenta eliminada'))
   from kh_private.agency_commission_tables t where t.agency_id=p_agency_id),
  'myShare',(select jsonb_build_object('pct',share_pct) from kh_private.agency_commission_overrides where agency_id=p_agency_id and user_id=p_actor_id),
  'overrides',case when admin then coalesce((select jsonb_agg(jsonb_build_object('userId',o.user_id,'displayName',coalesce(p.display_name,'Cuenta retirada'),'sharePct',o.share_pct) order by o.user_id)
   from kh_private.agency_commission_overrides o left join public.profiles p on p.id=o.user_id where o.agency_id=p_agency_id),'[]') else '[]'::jsonb end,
  'closures',jsonb_build_object('items',items,'hasMore',exists(select 1 from kh_private.property_sale_closures
   where executing_agency_id=p_agency_id and (admin or executing_manager_id=p_actor_id) offset off+lim),
   'total',(select count(*) from kh_private.property_sale_closures where executing_agency_id=p_agency_id and (admin or executing_manager_id=p_actor_id))),
  'totals',(select jsonb_build_object('count',count(*),'commissionUsd',coalesce(sum(commission_usd),0),'managerUsd',coalesce(sum(manager_usd),0))
   from kh_private.sale_closure_commissions where agency_id=p_agency_id and (admin or manager_id=p_actor_id)));
end $$;

create function public.kh_save_agency_commission_table(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;current_version integer;begin
 perform kh_private.agency_require_enabled();perform kh_private.agency_lock_accounts(p_actor_id,null);perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'save_commission_table',p_payload);if r is not null then return public.kh_agency_commissions(p_actor_id,p_agency_id,0,30);end if;
 if p_payload-array['tiers','expectedVersion','clientRequestId']<>'{}'::jsonb or jsonb_typeof(p_payload->'expectedVersion') is distinct from 'number' then raise exception 'KH_AGENCY_INVALID';end if;
 if not kh_private.commission_tiers_valid(p_payload->'tiers') then raise exception 'KH_AGENCY_COMMISSION_INVALID';end if;
 select version into current_version from kh_private.agency_commission_tables where agency_id=p_agency_id;
 if coalesce(current_version,0)<>(p_payload->>'expectedVersion')::integer then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 insert into kh_private.agency_commission_tables(agency_id,tiers,updated_by) values(p_agency_id,p_payload->'tiers',p_actor_id)
 on conflict(agency_id) do update set tiers=excluded.tiers,version=kh_private.agency_commission_tables.version+1,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into kh_private.agency_events(agency_id,actor_id,kind) values(p_agency_id,p_actor_id,'commission_table_saved');
 return kh_private.agency_remember(p_actor_id,p_agency_id,'save_commission_table',p_payload,public.kh_agency_commissions(p_actor_id,p_agency_id,0,30));
end $$;

create function public.kh_set_agency_commission_override(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;target uuid;share numeric;begin
 perform kh_private.agency_require_enabled();
 if p_payload-array['userId','sharePct','clientRequestId']<>'{}'::jsonb or not(p_payload ? 'sharePct') then raise exception 'KH_AGENCY_INVALID';end if;
 begin target:=(p_payload->>'userId')::uuid;exception when others then raise exception 'KH_AGENCY_INVALID';end;
 if target is null then raise exception 'KH_AGENCY_INVALID';end if;
 perform kh_private.agency_lock_accounts(p_actor_id,target);perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'set_commission_override',p_payload);if r is not null then return public.kh_agency_commissions(p_actor_id,p_agency_id,0,30);end if;
 if not exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and user_id=target and state='active') then raise exception 'KH_AGENCY_COMMISSION_MEMBER';end if;
 if p_payload->'sharePct'='null'::jsonb then
  delete from kh_private.agency_commission_overrides where agency_id=p_agency_id and user_id=target;
 else
  if jsonb_typeof(p_payload->'sharePct')<>'number' then raise exception 'KH_AGENCY_COMMISSION_INVALID';end if;
  share:=(p_payload->>'sharePct')::numeric;
  if share<0 or share>100 or share<>round(share,2) then raise exception 'KH_AGENCY_COMMISSION_INVALID';end if;
  insert into kh_private.agency_commission_overrides(agency_id,user_id,share_pct,set_by) values(p_agency_id,target,share,p_actor_id)
  on conflict(agency_id,user_id) do update set share_pct=excluded.share_pct,set_by=excluded.set_by,set_at=clock_timestamp();
 end if;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id) values(p_agency_id,p_actor_id,'commission_override_set',target);
 return kh_private.agency_remember(p_actor_id,p_agency_id,'set_commission_override',p_payload,public.kh_agency_commissions(p_actor_id,p_agency_id,0,30));
end $$;

revoke all on function kh_private.commission_tiers_valid(jsonb),kh_private.commission_quote(uuid,uuid,numeric),kh_private.snapshot_sale_commission(),
 kh_private.freeze_sale_commission(),kh_private.drop_commission_override(),kh_private.commission_closure_json(uuid) from public,anon,authenticated;
revoke all on function public.kh_agency_commissions(uuid,uuid,integer,integer),public.kh_save_agency_commission_table(uuid,uuid,jsonb),
 public.kh_set_agency_commission_override(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kh_agency_commissions(uuid,uuid,integer,integer),public.kh_save_agency_commission_table(uuid,uuid,jsonb),
 public.kh_set_agency_commission_override(uuid,uuid,jsonb) to authenticated;
```

- [ ] **Step 2: Revisar contra la especificación**

Comprueba a mano, sin ejecutar nada en producción:
- `commission_tiers_valid` aplica las reglas de la tabla de la especificación (§3 «Tabla»).
- `commission_quote` elige el primer rango con `upToUsd >= amount`. El `while` avanza mientras el límite es **menor** que el precio, así que el límite exacto se queda en su rango.
- Solo los RPC `public.*` reciben `grant execute`.
- No se redefine `decide_sale` ni `close_commercial_cycle`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261015000400_agency_commissions.sql
git commit -m "feat(agency): store commission tables and freeze each sale's commission"
```

---

### Task 4: Suite SQL

**Files:**
- Create: `supabase/tests/agency_commissions.sql`
- Modify: `scripts/apply-reviewed-migration.mjs` (comentario y lista de prefijos de `leftovers`)

- [ ] **Step 1: Escribir la suite**

`supabase/tests/agency_commissions.sql`:

```sql
-- Commission tables, special shares and frozen snapshots. Everything rolls back.
-- G admin (…01), M manager (…02), C coordinator (…03), X admin of another agency (…04), B buyer (…05).
-- Agency a1 has a table; a2 never gets one.
begin;
create function pg_temp.com_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'COMMISSION ASSERTION: %',label; end if; end $$;
create function pg_temp.com_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'COMMISSION ASSERTION: missing error %',expected;
end $$;
create function pg_temp.com_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 perform set_config('request.jwt.claims',case when actor is null then '' else jsonb_build_object('sub',actor,'role','authenticated')::text end,true);
end $$;
-- Closures are inserted directly as the migration owner; agency_sale_closures covers the sale flow itself.
create function pg_temp.com_close(n integer,amount numeric,manager uuid,agency uuid) returns uuid language plpgsql as $$
declare p uuid:=('51000000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid;cycle uuid;deal uuid;req uuid;closure uuid;begin
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,availability)
 values(p,'51000000-0000-4000-8000-000000000001','commission-'||n,'Casa comisión '||n,'Vedado','Zona Comisión','Casa','Vivienda ficticia para probar comisiones.',amount,100,2,1,'{}',
  array['51000000-0000-4000-8000-000000000001/commission-'||n||'/photo.jpg'],'approved','active');
 insert into kh_private.commercial_cycles(property_id) values(p) returning id into cycle;
 insert into kh_private.agency_deals(agency_id,property_id,cycle_id,buyer_id,contact_kind,assignee_id)
 values(agency,p,cycle,'51000000-0000-4000-8000-000000000005','account',manager) returning id into deal;
 insert into kh_private.agency_sale_requests(property_id,cycle_id,authority_version,property_version,executing_agency_id,executing_manager_id,winning_deal_id,
  deal_version,mandate_version,amount_usd,occurred_at,state,requested_by,buyer_label,evidence_summary)
 values(p,cycle,1,1,agency,manager,deal,1,1,amount,now(),'confirmed',manager,'Comprador ficticio','Sin oferta aceptada') returning id into req;
 insert into kh_private.property_sale_closures(property_id,cycle_id,request_id,executing_agency_id,executing_manager_id,confirmed_by,amount_usd,occurred_at)
 values(p,cycle,req,agency,manager,'51000000-0000-4000-8000-000000000001',amount,now()) returning id into closure;
 return closure;
end $$;
create function pg_temp.com_snapshot(n integer) returns setof kh_private.sale_closure_commissions language sql as $$
 select x.* from kh_private.sale_closure_commissions x join kh_private.property_sale_closures c on c.id=x.closure_id
 where c.property_id=('51000000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid
$$;
-- Production already has the module on; there this matches no row.
update kh_private.agency_settings set enabled=true where singleton and not enabled;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('51000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'commission-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Comisión '||n)
 from generate_series(1,5) n;
insert into kh_private.agencies(id,trade_name,state) values
 ('51000000-0000-4000-8000-0000000000a1','Casas Comisión Ficticias','approved'),
 ('51000000-0000-4000-8000-0000000000a2','Otra Inmobiliaria Comisión','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('51000000-0000-4000-8000-0000000000a1','51000000-0000-4000-8000-000000000001','admin'),
 ('51000000-0000-4000-8000-0000000000a1','51000000-0000-4000-8000-000000000002','manager'),
 ('51000000-0000-4000-8000-0000000000a1','51000000-0000-4000-8000-000000000003','coordinator'),
 ('51000000-0000-4000-8000-0000000000a2','51000000-0000-4000-8000-000000000004','admin');

set local role authenticated;
-- No table yet: a member reads an empty page.
select pg_temp.com_as('51000000-0000-4000-8000-000000000002');
select pg_temp.com_assert(public.kh_agency_commissions('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-0000000000a1')->'table'='null'::jsonb,'no table yet');
-- A manager cannot write.
select pg_temp.com_error($$select public.kh_save_agency_commission_table('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-0000000000a1',
 '{"tiers":[{"upToUsd":null,"ratePct":5,"managerSharePct":40}],"expectedVersion":0,"clientRequestId":"51000000-0000-4000-8000-0000000000d1"}')$$,'KH_AGENCY_ROLE_REQUIRED');
select pg_temp.com_error($$select public.kh_set_agency_commission_override('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-0000000000a1',
 '{"userId":"51000000-0000-4000-8000-000000000002","sharePct":90,"clientRequestId":"51000000-0000-4000-8000-0000000000d1"}')$$,'KH_AGENCY_ROLE_REQUIRED');

-- The admin: broken tables are refused.
select pg_temp.com_as('51000000-0000-4000-8000-000000000001');
select pg_temp.com_error(format($$select public.kh_save_agency_commission_table('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',%L)$$,
 jsonb_build_object('tiers',bad,'expectedVersion',0,'clientRequestId',gen_random_uuid())),'KH_AGENCY_COMMISSION_INVALID')
from (values ('[]'::jsonb),
 ('[{"upToUsd":20000,"ratePct":5,"managerSharePct":40}]'),
 ('[{"upToUsd":null,"ratePct":5,"managerSharePct":40},{"upToUsd":null,"ratePct":4,"managerSharePct":40}]'),
 ('[{"upToUsd":60000,"ratePct":5,"managerSharePct":40},{"upToUsd":20000,"ratePct":4,"managerSharePct":40},{"upToUsd":null,"ratePct":3,"managerSharePct":40}]'),
 ('[{"upToUsd":null,"ratePct":0,"managerSharePct":40}]'),('[{"upToUsd":null,"ratePct":31,"managerSharePct":40}]'),
 ('[{"upToUsd":null,"ratePct":5,"managerSharePct":101}]'),('[{"upToUsd":null,"ratePct":5.001,"managerSharePct":40}]'),
 ('[{"upToUsd":null,"ratePct":5,"managerSharePct":40,"extra":1}]'),
 ((select jsonb_agg(jsonb_build_object('upToUsd',case when n<9 then n*1000 end,'ratePct',5,'managerSharePct',40) order by n) from generate_series(1,9) n))) b(bad);
-- Create version 1; a replay returns the same state; a stale version is refused.
select pg_temp.com_assert((public.kh_save_agency_commission_table('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',
 '{"tiers":[{"upToUsd":20000,"ratePct":5,"managerSharePct":40},{"upToUsd":60000,"ratePct":4,"managerSharePct":40},{"upToUsd":null,"ratePct":3,"managerSharePct":40}],"expectedVersion":0,"clientRequestId":"51000000-0000-4000-8000-0000000000d2"}')
 ->'table'->>'version')='1','table created');
select pg_temp.com_assert((public.kh_save_agency_commission_table('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',
 '{"tiers":[{"upToUsd":20000,"ratePct":5,"managerSharePct":40},{"upToUsd":60000,"ratePct":4,"managerSharePct":40},{"upToUsd":null,"ratePct":3,"managerSharePct":40}],"expectedVersion":0,"clientRequestId":"51000000-0000-4000-8000-0000000000d2"}')
 ->'table'->>'version')='1','replay keeps version 1');
select pg_temp.com_error($$select public.kh_save_agency_commission_table('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',
 '{"tiers":[{"upToUsd":null,"ratePct":6,"managerSharePct":40}],"expectedVersion":0,"clientRequestId":"51000000-0000-4000-8000-0000000000d3"}')$$,'KH_AGENCY_VERSION_CONFLICT');
-- Special shares: set for M, refused for someone outside the team and for a share above 100.
select pg_temp.com_assert(jsonb_array_length(public.kh_set_agency_commission_override('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',
 '{"userId":"51000000-0000-4000-8000-000000000002","sharePct":50,"clientRequestId":"51000000-0000-4000-8000-0000000000d4"}')->'overrides')=1,'override set');
select pg_temp.com_error($$select public.kh_set_agency_commission_override('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',
 '{"userId":"51000000-0000-4000-8000-000000000004","sharePct":50,"clientRequestId":"51000000-0000-4000-8000-0000000000d5"}')$$,'KH_AGENCY_COMMISSION_MEMBER');
select pg_temp.com_error($$select public.kh_set_agency_commission_override('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',
 '{"userId":"51000000-0000-4000-8000-000000000002","sharePct":101,"clientRequestId":"51000000-0000-4000-8000-0000000000d6"}')$$,'KH_AGENCY_COMMISSION_INVALID');
-- The manager sees only their own share.
select pg_temp.com_as('51000000-0000-4000-8000-000000000002');
select pg_temp.com_assert((public.kh_agency_commissions('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-0000000000a1')->'myShare'->>'pct')::numeric=50,'manager share');
select pg_temp.com_assert(public.kh_agency_commissions('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-0000000000a1')->'overrides'='[]'::jsonb,'manager does not see other shares');

-- Sales confirmed now freeze the current table and shares.
reset role;
select pg_temp.com_as(null);
select pg_temp.com_close(1,20000,'51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-0000000000a1');
select pg_temp.com_close(2,35000,'51000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-0000000000a1');
select pg_temp.com_close(3,60001,'51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-0000000000a1');
select pg_temp.com_close(4,50000,'51000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-0000000000a2');
select pg_temp.com_assert((select (tier_index,rate_pct,share_pct,share_source,commission_usd,manager_usd,table_version)=(0,5::numeric,50::numeric,'override',1000::numeric,500::numeric,1) from pg_temp.com_snapshot(1)),'first range with special share');
select pg_temp.com_assert((select (tier_index,rate_pct,share_pct,share_source,commission_usd,manager_usd)=(1,4::numeric,40::numeric,'table',1400::numeric,560::numeric) from pg_temp.com_snapshot(2)),'second range with table share');
select pg_temp.com_assert((select (tier_index,commission_usd,manager_usd)=(2,1800.03::numeric,900.02::numeric) from pg_temp.com_snapshot(3)),'last range rounds half up');
select pg_temp.com_assert(not exists(select 1 from pg_temp.com_snapshot(4)),'no table means no snapshot');
select pg_temp.com_error($$update kh_private.sale_closure_commissions set manager_usd=0$$,'KH_AGENCY_COMMISSION_FROZEN');
select pg_temp.com_error($$delete from kh_private.sale_closure_commissions$$,'KH_AGENCY_COMMISSION_FROZEN');

-- Changing the table later leaves the frozen numbers alone.
set local role authenticated;
select pg_temp.com_as('51000000-0000-4000-8000-000000000001');
select pg_temp.com_assert((public.kh_save_agency_commission_table('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',
 '{"tiers":[{"upToUsd":null,"ratePct":10,"managerSharePct":60}],"expectedVersion":1,"clientRequestId":"51000000-0000-4000-8000-0000000000d7"}')->'table'->>'version')='2','table version 2');
reset role;
select pg_temp.com_assert((select commission_usd=1000 and table_version=1 from pg_temp.com_snapshot(1)),'snapshot unchanged after table change');

-- Who sees what.
set local role authenticated;
select pg_temp.com_as('51000000-0000-4000-8000-000000000002');
select pg_temp.com_assert((select jsonb_array_length(r->'closures'->'items')=2 and (r->'totals'->>'managerUsd')::numeric=1400.02 and (r->'totals'->>'count')::integer=2)
 from (select public.kh_agency_commissions('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-0000000000a1') r) q,'manager sees own sales');
select pg_temp.com_as('51000000-0000-4000-8000-000000000003');
select pg_temp.com_assert((select jsonb_array_length(r->'closures'->'items')=1 and (r->'totals'->>'managerUsd')::numeric=560)
 from (select public.kh_agency_commissions('51000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-0000000000a1') r) q,'coordinator sees own sale');
select pg_temp.com_as('51000000-0000-4000-8000-000000000001');
select pg_temp.com_assert((select jsonb_array_length(r->'closures'->'items')=3 and (r->'closures'->>'total')::integer=3
 and (r->'totals'->>'managerUsd')::numeric=1960.02 and (r->'totals'->>'commissionUsd')::numeric=4200.03
 and r->'closures'->'items'->0->>'managerName' like 'Persona Comisión%' and r->'table'->>'updatedByName'='Persona Comisión 1')
 from (select public.kh_agency_commissions('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1') r) q,'admin sees the team, totals and who changed the table');
select pg_temp.com_assert((select jsonb_array_length(r->'closures'->'items')=1 and (r->'closures'->>'hasMore')::boolean)
 from (select public.kh_agency_commissions('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',0,1) r) q,'pages');
select pg_temp.com_as('51000000-0000-4000-8000-000000000004');
select pg_temp.com_error($$select public.kh_agency_commissions('51000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-0000000000a1')$$,'KH_AGENCY_MEMBERSHIP_REQUIRED');

-- Leaving the agency deletes the special share.
select pg_temp.com_as('51000000-0000-4000-8000-000000000001');
select public.kh_set_agency_commission_override('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-0000000000a1',
 '{"userId":"51000000-0000-4000-8000-000000000003","sharePct":30,"clientRequestId":"51000000-0000-4000-8000-0000000000d8"}');
reset role;
update kh_private.agency_memberships set state='removed',version=version+1
 where agency_id='51000000-0000-4000-8000-0000000000a1' and user_id='51000000-0000-4000-8000-000000000003';
select pg_temp.com_assert(not exists(select 1 from kh_private.agency_commission_overrides where user_id='51000000-0000-4000-8000-000000000003'),'override gone with the membership');

-- Nothing about commissions reaches notifications.
select pg_temp.com_assert(not exists(select 1 from kh_private.notifications where agency_id='51000000-0000-4000-8000-0000000000a1'
 and (coalesce(title,'')||coalesce(body,'')||coalesce(actor_name,'')||coalesce(property_title,''))~*'comisi|commission'),'no commission in notifications');
rollback;
```

- [ ] **Step 2: Añadir el prefijo `51…` al detector de sobrantes**

En `scripts/apply-reviewed-migration.mjs`, cambia el comentario y la lista:

```js
// Suites invent ids with these prefixes (agency_sent_invitations 47…, agency_member_exits 48…, pro_private 49…,
// owner_listings_to_agency 50…, agency_commissions 51…); real activity cannot match.
const leftovers = async () => (await db.query(`select (select count(*) from auth.users where id::text like any($1::text[]))+(select count(*) from kh_private.agencies where id::text like any($1::text[])) n`,
  [['47000000-0000-4000-8000-%', '48000000-0000-4000-8000-%', '49000000-0000-4000-8000-%', '50000000-0000-4000-8000-%', '51000000-0000-4000-8000-%']])).rows[0].n;
```

Añade también `20261015000400_agency_commissions` a la lista del comentario de cabecera («Used for …»).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/agency_commissions.sql scripts/apply-reviewed-migration.mjs
git commit -m "test(agency): cover commission tables, shares and snapshots in SQL"
```

---

### Task 5: Ensayo con rollback en la base de datos (requiere permiso)

**Files:** ninguno.

- [ ] **Step 1: Pedir permiso al usuario**

Explica que el comando abre una transacción en la base de datos de producción, crea las tablas y datos ficticios, ejecuta la suite y **deshace todo**. No queda nada. Espera un «sí» explícito.

- [ ] **Step 2: Ejecutar el ensayo**

Run: `node scripts/apply-reviewed-migration.mjs 20261015000400_agency_commissions`
Expected: termina sin error. Una aserción fallida aparece como `COMMISSION ASSERTION: <etiqueta>`, un error inesperado como `Wrong error: …`.

- [ ] **Step 3: Si falla, corregir y repetir**

Usa superpowers:systematic-debugging. Arregla la migración o la suite (no rebajes una aserción para que pase), vuelve a ejecutar el Step 2 y haz commit del arreglo:

```bash
git add supabase/migrations/20261015000400_agency_commissions.sql supabase/tests/agency_commissions.sql
git commit -m "fix(agency): correct commissions after the rollback rehearsal"
```

Problemas posibles en el fixture: si `insert into public.properties` exige columnas nuevas, cópialas del insert de `supabase/tests/owner_listings_to_agency.sql:32`. Si un trigger de avisos rechaza la solicitud de venta directa, inserta la solicitud con `state='pending'` y cámbiala a `'confirmed'` antes de insertar el cierre.

---

### Task 6: Pantalla «Comisiones»

**Files:**
- Create: `src/screens/AgencyCommissionsScreen.tsx`
- Create: `src/app/agency-commissions.tsx`
- Modify: `src/screens/AgencyWorkspaceScreen.tsx:15-22` (array `links`)

- [ ] **Step 1: Crear la ruta**

`src/app/agency-commissions.tsx`:

```tsx
export {default} from '../screens/AgencyCommissionsScreen';
```

- [ ] **Step 2: Crear la pantalla**

`src/screens/AgencyCommissionsScreen.tsx`:

```tsx
import {useCallback,useRef,useState} from 'react';
import {router,useFocusEffect} from 'expo-router';
import {ActivityIndicator,RefreshControl,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import {createAgencyCommissionRepository} from '../agencies/commissions/repository';
import {computeCommission,formatCommissionPct,formatCommissionUsd,parseCommissionNumber,tableStamp,tierLabel} from '../agencies/commissions/domain';
import {COMMISSION_PAGE_SIZE,type AgencyCommissions,type CommissionClosure} from '../agencies/commissions/types';
import {agencyError} from '../agencies/domain';
import {NEGOTIATION_TIME_ZONE} from '../negotiations/domain';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {AgencyTextField,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {Button,EmptyState,Notice,PageTitle} from '../components/ui';
import {supabase} from '../lib/supabase';
const repo=supabase?createAgencyCommissionRepository(supabase):null;
export default function AgencyCommissionsScreen(){const a=useAuth(),w=useAgencyWorkspace();return <Commissions key={`${a.user?.id}:${a.session?.access_token}:${w.activeAgencyId}:${w.generation}`}/>;}
function Commissions(){
 const w=useAgencyWorkspace(),{styles:s,colors}=useAgencyFormStyles();
 const [data,setData]=useState<AgencyCommissions|null>(null),[issue,setIssue]=useState(''),[price,setPrice]=useState(''),[page,setPage]=useState(0),[paging,setPaging]=useState(false);
 const epoch=useRef(0),focused=useRef(false),pageRef=useRef(0),admin=w.membership?.role==='admin';
 const capture=useCallback(()=>{const version=epoch.current,base=w.captureAgencyReadContext();return {...base,checkpoint(){base.checkpoint();if(!focused.current||version!==epoch.current)throw Error('KH_AGENCY_CONTEXT_CHANGED');}};},[w.captureAgencyReadContext]);
 const fetchPage=useCallback(async(target:number)=>{
  if(!repo||!w.membership)return;const c=capture();
  try{const r=await repo.get(target*COMMISSION_PAGE_SIZE,c);c.checkpoint();pageRef.current=target;setPage(target);setData(r);setIssue('');}
  catch(e){try{c.checkpoint();setIssue(agencyError(e));}catch{}}
  finally{c.release();}
 },[capture,w.membership]);
 const load=useCallback(()=>fetchPage(pageRef.current),[fetchPage]);
 const reload=useConsultationRefresh(`${w.activeAgencyId}:${w.generation}`,load,()=>paging||!w.membership);
 useFocusEffect(useCallback(()=>{focused.current=true;epoch.current++;void load();return()=>{focused.current=false;epoch.current++;};},[load]));
 async function go(target:number){if(paging)return;setPaging(true);try{await fetchPage(target);}finally{if(focused.current)setPaging(false);}}
 const pages=Math.max(1,Math.ceil((data?.closures.total??0)/COMMISSION_PAGE_SIZE));
 const amount=parseCommissionNumber(price),override=data?.myShare?.pct??null;
 const quote=data?.table&&amount!==null&&amount>0?computeCommission(data.table.tiers,amount,override):null;
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView keyboardDismissMode="on-drag" alwaysBounceVertical keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!!w.membership&&!paging} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}>
  <PageTitle compact title="Comisiones" subtitle={w.activeAgency?`Reglas internas de ${w.activeAgency.tradeName}`:undefined} back fallback="/agency-workspace"/>
  {issue?<Notice error>{issue}</Notice>:null}
  <Notice>KarmaHouse no cobra comisión. Esta tabla es un acuerdo entre la inmobiliaria y su equipo.</Notice>
  {!data&&!issue&&repo?<ActivityIndicator accessibilityLabel="Consultando comisiones" color={colors.primary}/>:null}
  {data&&!data.table?<EmptyState plain icon="cash-outline" title="Sin tabla de comisiones" description={admin?'Define cuánto cobra la inmobiliaria por venta y qué parte le toca al gestor.':'Tu inmobiliaria aún no ha definido su tabla de comisiones.'} action={admin?<Button label="Definir tabla" onPress={()=>router.push('/agency-commission-table')}/>:undefined}/>:null}
  {data?.table?<>
   {override!==null?<Notice>{`Tienes un reparto especial: ${formatCommissionPct(override)} de la comisión en cualquier rango.`}</Notice>:null}
   <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>Tabla de comisiones</Text>
    <Text style={s.caption}>{tableStamp(data.table)}</Text>
    {data.table.tiers.map((tier,index,tiers)=><View key={index} style={[s.item,index===0&&s.first]}>
     <Text style={s.value}>{tierLabel(tiers,index)}</Text>
     <Text style={s.copy}>{`Comisión ${formatCommissionPct(tier.ratePct)} · Tu parte ${formatCommissionPct(override??tier.managerSharePct)} de la comisión`}</Text>
    </View>)}
    {admin?<Button secondary icon="create-outline" label="Editar tabla" onPress={()=>router.push('/agency-commission-table')}/>:null}
   </View>
   <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>Calcula tu parte</Text>
    <AgencyTextField label="Si vendes en (USD)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="20000" error={price&&!(amount!==null&&amount>0)?'Escribe un precio en USD, por ejemplo 20000.':undefined}/>
    {quote?<View style={s.facts}>
     <View style={s.datum}><Text style={s.caption}>Comisión de la inmobiliaria</Text><Text style={s.value}>{formatCommissionUsd(quote.commissionUsd)}</Text></View>
     <View style={s.datum}><Text style={s.caption}>Tu parte</Text><Text style={s.date}>{formatCommissionUsd(quote.managerUsd)}</Text></View>
    </View>:null}
    <Text style={s.caption}>Es una estimación. La cifra de cada venta se fija cuando se confirma el cierre.</Text>
   </View>
  </>:null}
  {data?<View style={s.card}>
   <Text accessibilityRole="header" style={s.title}>{admin?'Cierres del equipo':'Tus cierres'}</Text>
   <View style={s.facts}>
    {admin?<View style={s.datum}><Text style={s.caption}>Comisión total de la inmobiliaria</Text><Text style={s.date}>{formatCommissionUsd(data.totals.commissionUsd)}</Text></View>:null}
    <View style={s.datum}><Text style={s.caption}>{admin?'Total para el equipo':'Te toca en total'}</Text><Text style={s.date}>{formatCommissionUsd(data.totals.managerUsd)}</Text></View>
   </View>
   {data.closures.items.length===0?<Text style={s.copy}>Aún no hay ventas confirmadas.</Text>:data.closures.items.map((item,index)=><ClosureRow key={item.closureId} item={item} first={index===0} team={admin}/>)}
   {pages>1?<View style={s.row}>
    <Button secondary label="Anterior" disabled={paging||page===0} onPress={()=>void go(page-1)}/>
    <Text style={s.caption}>{`Página ${page+1} de ${pages}`}</Text>
    <Button secondary label="Siguiente" disabled={paging||page>=pages-1} onPress={()=>void go(page+1)}/>
   </View>:null}
   {!admin?<Text style={s.caption}>Si sales del equipo, tu reparto especial se borra y dejas de ver esta pantalla. Las comisiones de tus ventas ya confirmadas quedan registradas en la inmobiliaria.</Text>:null}
  </View>:null}
 </ScrollView></SafeAreaView>;
}
function ClosureRow({item,first,team}:{item:CommissionClosure;first:boolean;team:boolean}){
 const {styles:s}=useAgencyFormStyles();
 const date=new Date(item.confirmedAt).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric',timeZone:NEGOTIATION_TIME_ZONE});
 return <View style={[s.item,first&&s.first]}>
  <Text style={s.value}>{item.propertyTitle}</Text>
  <Text style={s.caption}>{[team?item.managerName:null,date,`Venta ${formatCommissionUsd(item.amountUsd)}`].filter(Boolean).join(' · ')}</Text>
  <Text style={item.commission?s.status:s.copy}>{item.commission?`Comisión ${formatCommissionUsd(item.commission.commissionUsd)} · ${team?'Gestor':'Tu parte'} ${formatCommissionUsd(item.commission.managerUsd)}`:'Sin tabla al cerrar'}</Text>
 </View>;
}
```

- [ ] **Step 3: Añadir el enlace en Mi inmobiliaria**

En `src/screens/AgencyWorkspaceScreen.tsx`, dentro del array `links`, añade justo después de la línea de `'Cierres'`:

```tsx
 {title:'Comisiones',copy:'Reglas y lo que ganas por venta',icon:'cash-outline',path:'/agency-commissions'},
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AgencyCommissionsScreen.tsx src/app/agency-commissions.tsx src/screens/AgencyWorkspaceScreen.tsx
git commit -m "feat(agency): show commission rules, a calculator and earnings to members"
```

---

### Task 7: Editor de la tabla y repartos especiales

**Files:**
- Create: `src/screens/AgencyCommissionTableScreen.tsx`
- Create: `src/app/agency-commission-table.tsx`
- Modify: `src/screens/AgencyWorkspaceScreen.tsx` (array `links`)

- [ ] **Step 1: Crear la ruta**

`src/app/agency-commission-table.tsx`:

```tsx
export {default} from '../screens/AgencyCommissionTableScreen';
```

- [ ] **Step 2: Crear la pantalla**

`src/screens/AgencyCommissionTableScreen.tsx`:

```tsx
import {useCallback,useRef,useState} from 'react';
import {router,useFocusEffect} from 'expo-router';
import {ActivityIndicator,RefreshControl,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import {createAgencyCommissionRepository} from '../agencies/commissions/repository';
import {MAX_COMMISSION_TIERS,formatCommissionPct,isSharePct,parseCommissionNumber,tableStamp,validateTiers} from '../agencies/commissions/domain';
import type {AgencyCommissions,CommissionTier} from '../agencies/commissions/types';
import type {AgencyMembership} from '../agencies/types';
import {agencyError} from '../agencies/domain';
import {createMessageId} from '../messaging/domain';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {AgencyTextField,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {ActionGroup,Button,Notice,PageTitle} from '../components/ui';
import {supabase} from '../lib/supabase';
import {agencyRoleLabel} from './AgencyWorkspaceScreen';
const repo=supabase?createAgencyCommissionRepository(supabase):null;
interface Row {upTo:string;rate:string;share:string}
const decimal=(n:number)=>String(n).replace('.',',');
const rowsFrom=(tiers:readonly CommissionTier[]):Row[]=>tiers.map(t=>({upTo:t.upToUsd===null?'':String(t.upToUsd),rate:decimal(t.ratePct),share:decimal(t.managerSharePct)}));
// Example values for a first table; the screen says so until it is saved.
const starter:Row[]=[{upTo:'20000',rate:'5',share:'40'},{upTo:'60000',rate:'4',share:'40'},{upTo:'',rate:'3',share:'40'}];
const errorText=(e:unknown)=>e&&typeof e==='object'&&'message'in e?String(e.message):String(e);
const tiersFrom=(rows:Row[])=>validateTiers(rows.map((r,i)=>({upToUsd:i===rows.length-1?null:parseCommissionNumber(r.upTo),ratePct:parseCommissionNumber(r.rate),managerSharePct:parseCommissionNumber(r.share)})));
export default function AgencyCommissionTableScreen(){const a=useAuth(),w=useAgencyWorkspace();return <Editor key={`${a.user?.id}:${a.session?.access_token}:${w.activeAgencyId}:${w.generation}`}/>;}
function Editor(){
 const w=useAgencyWorkspace(),{styles:s,colors}=useAgencyFormStyles(),admin=w.membership?.role==='admin';
 const [data,setData]=useState<AgencyCommissions|null>(null),[rows,setRows]=useState<Row[]>(starter),[members,setMembers]=useState<AgencyMembership[]>([]),[drafts,setDrafts]=useState<Record<string,string>>({});
 const [issue,setIssue]=useState(''),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
 const baseline=useRef(JSON.stringify(starter)),dirty=useRef(false);dirty.current=!!data&&JSON.stringify(rows)!==baseline.current;
 const epoch=useRef(0),focused=useRef(false),lock=useRef(false),pending=useRef<{tiers:CommissionTier[];expectedVersion:number;clientRequestId:string}|null>(null);
 const editable=w.enabled&&w.activeAgency?.state==='approved'&&admin,locked=!editable||busy||!!pending.current;
 const capture=useCallback((write=false)=>{const version=epoch.current,base=write?w.captureAgencyContext():w.captureAgencyReadContext();return {...base,checkpoint(){base.checkpoint();if(!focused.current||version!==epoch.current)throw Error('KH_AGENCY_CONTEXT_CHANGED');}};},[w.captureAgencyContext,w.captureAgencyReadContext]);
 const show=useCallback((r:AgencyCommissions)=>{const next=r.table?rowsFrom(r.table.tiers):starter;baseline.current=JSON.stringify(next);setData(r);setRows(next);},[]);
 const load=useCallback(async()=>{
  if(!repo||!w.repository||!admin)return;const c=capture();
  // ponytail: first 30 members only; add paging when an agency outgrows it.
  try{const [r,page]=await Promise.all([repo.get(0,c),w.repository.listMembers(0,c)]);c.checkpoint();show(r);setMembers(page.items);setIssue('');}
  catch(e){try{c.checkpoint();setIssue(agencyError(e));}catch{}}
  finally{c.release();}
 },[capture,show,w.repository,admin]);
 const reload=useConsultationRefresh(`${w.activeAgencyId}:${w.generation}`,load,()=>lock.current||!!pending.current||dirty.current||!admin);
 useFocusEffect(useCallback(()=>{focused.current=true;epoch.current++;void load();return()=>{focused.current=false;epoch.current++;};},[load]));
 async function act(work:(c:ReturnType<typeof capture>)=>Promise<void>){
  if(lock.current||reload.isRefreshing()||!editable)return;lock.current=true;setBusy(true);setFeedback('');let c:ReturnType<typeof capture>|undefined;
  try{c=capture(true);await work(c);c.checkpoint();setIssue('');}
  catch(e){try{c?.checkpoint();setIssue(agencyError(e));}catch{}}
  finally{c?.release();lock.current=false;if(focused.current)setBusy(false);}
 }
 async function save(c:ReturnType<typeof capture>){
  if(!repo||!data)return;
  if(!pending.current)pending.current={tiers:tiersFrom(rows),expectedVersion:data.table?.version??0,clientRequestId:createMessageId()};
  let r:AgencyCommissions;
  // Another admin saved first: drop the stale attempt and show their table; act() then explains what happened.
  try{r=await repo.saveTable(pending.current,c);}catch(e){if(/VERSION_CONFLICT/.test(errorText(e))){pending.current=null;await load();}throw e;}
  c.checkpoint();pending.current=null;show(r);
  setFeedback('Tabla guardada. Se aplica a los cierres que se confirmen desde ahora.');
 }
 async function share(userId:string,pct:number|null,c:ReturnType<typeof capture>){
  if(!repo)return;const r=await repo.setOverride({userId,sharePct:pct,clientRequestId:createMessageId()},c);c.checkpoint();
  setData(r);setDrafts(d=>({...d,[userId]:''}));setFeedback(pct===null?'Reparto especial quitado.':'Reparto especial guardado.');
 }
 const update=(index:number,patch:Partial<Row>)=>setRows(current=>current.map((r,i)=>i===index?{...r,...patch}:r));
 const addRow=()=>setRows(current=>{const last=current[current.length-1];return current.length>=MAX_COMMISSION_TIERS?current:[...current.slice(0,-1),{upTo:'',rate:last.rate,share:last.share},last];});
 const removeRow=(index:number)=>setRows(current=>current.filter((_,i)=>i!==index));
 const overrides=new Map((data?.overrides??[]).map(o=>[o.userId,o.sharePct]));
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView keyboardDismissMode="on-drag" alwaysBounceVertical keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy&&!dirty.current&&admin} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}>
  <PageTitle compact title="Tabla de comisiones" subtitle={w.activeAgency?.tradeName} back fallback="/agency-commissions"/>
  {issue?<Notice error>{issue}</Notice>:null}
  {feedback?<Notice>{feedback}</Notice>:null}
  {!admin?<Notice>Solo un administrador puede cambiar la tabla de comisiones.</Notice>:null}
  {admin&&!editable?<Notice>La edición requiere una inmobiliaria aprobada y la gestión de inmobiliarias activa.</Notice>:null}
  {admin&&!data&&!issue&&repo?<ActivityIndicator accessibilityLabel="Consultando la tabla" color={colors.primary}/>:null}
  {data?<>
   <Notice>Los cambios se aplican a los cierres que se confirmen desde ahora. Lo ya ganado no cambia.</Notice>
   {data.table?<Text style={s.caption}>{tableStamp(data.table)}</Text>:<Notice>Valores de ejemplo: ajústalos antes de guardar.</Notice>}
   <Text style={s.copy}>Cada rango aplica su % al precio completo. Si un rango superior tiene menos %, vender justo por encima del límite puede dar menos comisión.</Text>
   {rows.map((row,index)=>{const last=index===rows.length-1;return <View key={index} style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{last?(rows.length===1?'Cualquier precio':`Más de ${rows[index-1].upTo||'…'} USD`):`Rango ${index+1}`}</Text>
    {!last?<AgencyTextField label="Hasta (USD)" value={row.upTo} onChangeText={upTo=>update(index,{upTo})} keyboardType="numeric" editable={!locked}/>:null}
    <AgencyTextField label="Comisión de la inmobiliaria (%)" value={row.rate} onChangeText={rate=>update(index,{rate})} keyboardType="decimal-pad" editable={!locked}/>
    <AgencyTextField label="Parte del gestor (% de la comisión)" value={row.share} onChangeText={share=>update(index,{share})} keyboardType="decimal-pad" editable={!locked}/>
    {!last?<Button secondary label="Quitar rango" disabled={locked} onPress={()=>removeRow(index)}/>:null}
   </View>;})}
   <ActionGroup>
    <Button secondary icon="add-outline" label="Añadir rango" disabled={locked||rows.length>=MAX_COMMISSION_TIERS} onPress={addRow}/>
    <Button label={pending.current?'Reintentar guardar':'Guardar tabla'} disabled={!editable} loading={busy} onPress={()=>void act(save)}/>
    {pending.current?<Button secondary label="Descartar intento" disabled={busy} onPress={()=>{pending.current=null;setIssue('');}}/>:null}
   </ActionGroup>
   <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>Repartos especiales</Text>
    <Text style={s.copy}>Un reparto especial sustituye la parte del gestor en todos los rangos hasta que lo quites. Si la persona sale del equipo, su reparto especial se borra; las comisiones ya congeladas no cambian.</Text>
    {members.map((m,index)=>{const current=overrides.get(m.userId);return <View key={m.userId} style={[s.item,index===0&&s.first]}>
     <Text style={s.value}>{m.displayName??'Miembro del equipo'}</Text>
     <Text style={s.caption}>{`${agencyRoleLabel[m.role]} · ${current===undefined?'Usa la tabla':`Reparto especial ${formatCommissionPct(current)}`}`}</Text>
     <AgencyTextField label="Reparto especial (%)" value={drafts[m.userId]??''} onChangeText={v=>setDrafts(d=>({...d,[m.userId]:v}))} keyboardType="decimal-pad" placeholder={current===undefined?'50':decimal(current)} editable={editable&&!busy}/>
     <ActionGroup>
      <Button secondary label="Poner reparto" disabled={!editable||busy} onPress={()=>void act(async c=>{const pct=parseCommissionNumber(drafts[m.userId]??'');if(pct===null||!isSharePct(pct))throw Error('Revisa el reparto especial: va de 0 a 100 %.');await share(m.userId,pct,c);})}/>
      {current!==undefined?<Button secondary label="Quitar reparto" disabled={!editable||busy} onPress={()=>void act(c=>share(m.userId,null,c))}/>:null}
     </ActionGroup>
    </View>;})}
   </View>
   <Button secondary label="Ver comisiones" onPress={()=>router.replace('/agency-commissions')}/>
  </>:null}
 </ScrollView></SafeAreaView>;
}
```

- [ ] **Step 3: Añadir el enlace de administración**

En `src/screens/AgencyWorkspaceScreen.tsx`, dentro del array `links`, añade después de la línea de `'Perfil comercial'`:

```tsx
 {title:'Tabla de comisiones',copy:'Cuánto cobra la inmobiliaria y qué parte va al gestor',icon:'calculator-outline',path:'/agency-commission-table',admin:true},
```

- [ ] **Step 4: Comprobar**

Run: `npm run check`
Expected: typecheck sin errores y todas las pruebas en verde.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AgencyCommissionTableScreen.tsx src/app/agency-commission-table.tsx src/screens/AgencyWorkspaceScreen.tsx
git commit -m "feat(agency): let admins edit the commission table and special shares"
```

---

### Task 8: Documentación de operación

**Files:**
- Modify: `docs/agency-workspaces-operation.md` (después del párrafo que empieza «Una colaboradora comunica la venta…»)

- [ ] **Step 1: Añadir la sección**

Inserta después de ese párrafo:

```markdown
## Comisiones

Cada inmobiliaria puede definir una tabla de comisiones (Mi inmobiliaria › Administración › Tabla de comisiones): de 1 a 8 rangos de precio en USD, cada uno con el % que cobra la inmobiliaria y la parte de esa comisión que va al gestor. Un administrador puede dar a un miembro un reparto especial que sustituye esa parte en todos los rangos hasta que lo quite; salir de la inmobiliaria lo borra. Al confirmarse un cierre, `kh_private.sale_closure_commissions` congela la comisión con la tabla de la inmobiliaria ejecutora y el reparto del gestor ejecutor en ese momento; esa fila no se edita ni se borra. Sin tabla no hay instantánea y el cierre aparece como «Sin tabla al cerrar». Cada miembro ve sus cierres en Comisiones; un administrador ve los de todo el equipo. KarmaHouse no cobra comisión: la tabla es interna de cada inmobiliaria y no sale en avisos, perfiles públicos ni otras inmobiliarias.
```

- [ ] **Step 2: Commit**

```bash
git add docs/agency-workspaces-operation.md
git commit -m "docs(agency): describe commission tables and frozen snapshots"
```

---

### Task 9: Aplicar en producción y verificar en la app (requiere permiso)

**Files:** ninguno.

- [ ] **Step 1: Pedir permiso al usuario**

Explica que `--commit` deja la migración aplicada en producción, con su fila en el ledger y su checksum. Después la suite se ejecuta y se deshace. Espera un «sí» explícito.

- [ ] **Step 2: Aplicar**

Run: `node scripts/apply-reviewed-migration.mjs 20261015000400_agency_commissions --commit`
Expected: `migración aplicada (sha256 …)` y la suite termina sin error.

- [ ] **Step 3: Verificar en la app web**

Arranca la preview `web` de `.claude/launch.json` (puerto 8083). Con la sesión de un administrador de la inmobiliaria principal, comprueba:
1. Mi inmobiliaria muestra «Comisiones» y, en Administración, «Tabla de comisiones».
2. En «Tabla de comisiones», guarda la tabla de ejemplo (5/4/3 %, 40 %) y aparece «Tabla guardada…».
3. Pon un reparto especial del 50 % al primer gestor y aparece en su fila.
4. En «Comisiones», la calculadora con `20000` muestra «Comisión de la inmobiliaria» `1000 USD` y «Tu parte» `400 USD` (el administrador no tiene reparto especial, así que usa el 40 % de la tabla).
5. La tabla muestra «Versión 1 · Cambiada por …». Como administrador aparecen «Comisión total de la inmobiliaria» y «Total para el equipo».
6. No hay errores en la consola (`read_console_messages`).

No inicies sesión con contraseñas: si la preview no tiene sesión, pide al usuario que inicie sesión en el panel del navegador.

- [ ] **Step 4: Avisar del cliente Android**

La APK 0.1.30 es una entrega aparte (versión, notas y manifiesto de actualización). Propónla como siguiente tarea; no la publiques en este plan.

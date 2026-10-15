import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPortfolio,shownReference} from '../src/agencies/properties/portfolio.ts';

const agency='45000000-0000-4000-8001-000000000001';
const item=(id:string,extra:Record<string,unknown>,originAgencyId:string|null,reference:string)=>({property:{id,title:'Casa',location:'Vedado',province:'La Habana',status:'active',moderationStatus:'approved',...extra},originAgencyId,mandate:{reference}}) as never;
const items=[
 item('a',{title:'Casa amueblada en Las Minas',location:'Las Minas, Guanabacoa'},agency,'kh-9aaad6e2'),
 item('b',{title:'Apartamento en Miramar',location:'Miramar, Playa',status:'paused'},null,'Exclusiva 14'),
 item('c',{title:'Casa en revisión',location:'Cerro',moderationStatus:'pending'},agency,'Interna 3'),
];
const ids=(filter:Partial<Parameters<typeof filterPortfolio>[1]>)=>filterPortfolio(items,{query:'',state:'all',origin:'all',...filter},agency).map((x:{property:{id:string}})=>x.property.id);

test('portfolio filters by state, origin and an accent-free search', () => {
 assert.deepEqual(ids({}),['a','b','c']);
 assert.deepEqual(ids({state:'live'}),['a']);
 assert.deepEqual(ids({state:'paused'}),['b']);
 assert.deepEqual(ids({origin:'own'}),['a','c']);
 assert.deepEqual(ids({origin:'authorized'}),['b']);
 assert.deepEqual(ids({query:'  guanabácoa '}),['a']);
 assert.deepEqual(ids({query:'exclusiva'}),['b']);
 assert.deepEqual(ids({query:'kh-9aaa'}),[],'automatic references are not searchable');
 assert.deepEqual(ids({query:'casa',origin:'own',state:'pending'}),['c']);
});

test('only references written by the agency are shown', () => {
 assert.equal(shownReference('kh-9aaad6e2-76c6-427b-b744-781fe7c165b5'),null);
 assert.equal(shownReference('Anuncio propio 9aaad6e2'),null);
 assert.equal(shownReference('Exclusiva 14'),'Exclusiva 14');
});

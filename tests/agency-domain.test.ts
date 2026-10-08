import test from 'node:test';
import assert from 'node:assert/strict';
import { canPerformAgencyAction, normalizeAgencyApplication, normalizeAgencyVerificationRequest } from '../src/agencies/domain.ts';
const application = { tradeName:'Casas Habana', responsibleFullName:'Responsable Prueba', businessPhone:'+5351234567', province:'La Habana', municipality:'Plaza', serviceAreas:['Vedado'], description:'Agencia dedicada a gestionar viviendas en La Habana.', officeAddress:null, publishOfficeAddress:false, evidenceReferences:[] };
test('administrators and coordinators can attend cases without losing their coordinating roles', () => {
 assert.equal(canPerformAgencyAction('admin','manage_deal'),true);
 assert.equal(canPerformAgencyAction('admin','coordinate'),true);
 assert.equal(canPerformAgencyAction('coordinator','manage_deal'),true);
 assert.equal(canPerformAgencyAction('coordinator','confirm_sale'),false);
 assert.equal(canPerformAgencyAction('manager','coordinate'),false);
 assert.equal(canPerformAgencyAction('manager','manage_team'),false);
 assert.equal(canPerformAgencyAction('coordinator','request_verification'),false);
 assert.equal(canPerformAgencyAction('admin','request_verification'),true);
});
test('agency signup normalizes fields while keeping the responsible name private', () => {
 const result=normalizeAgencyApplication({...application,tradeName:' Casas Habana ',businessPhone:' +53 5123 4567 '});
 assert.equal(result.tradeName,'Casas Habana'); assert.equal(result.businessPhone,'+5351234567'); assert.equal(result.responsibleFullName,'Responsable Prueba');
 assert.deepEqual(result.serviceAreas,['Vedado']);
});
test('signup rejects injected authority and invalid business data', () => {
 for(const change of [{province:'Inventada'},{businessPhone:'123'},{serviceAreas:[]},{serviceAreas:['Vedado','Vedado']},{tradeName:'a'},{verified:true},{state:'approved'},{agencyId:'injected'},{publishOfficeAddress:true}]) assert.throws(()=>normalizeAgencyApplication({...application,...change}));
});
test('verification requests cannot grant their own badge and keep private evidence bounded', () => {
 assert.deepEqual(normalizeAgencyVerificationRequest({message:'Solicitamos revisión de nuestra agencia.',evidenceReferences:['Referencia privada']}),{message:'Solicitamos revisión de nuestra agencia.',evidenceReferences:['Referencia privada']});
 for(const value of [{message:'corto',evidenceReferences:[]},{message:'Solicitud válida de nuestra agencia.',evidenceReferences:Array(6).fill('prueba')},{message:'Solicitud válida de nuestra agencia.',evidenceReferences:[],verified:true}]) assert.throws(()=>normalizeAgencyVerificationRequest(value));
});

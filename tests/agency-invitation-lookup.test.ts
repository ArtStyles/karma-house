import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountIdFrom,agencyError} from '../src/agencies/domain.ts';

const id='da6126d5-1b2c-4d3e-8f90-a1b2c3d4e5f6';

test('the invite lookup finds the account id in a code, a link or a shared message', () => {
 assert.equal(accountIdFrom(id),id);
 assert.equal(accountIdFrom(` ${id.toUpperCase()}\n`),id);
 assert.equal(accountIdFrom(`https://app.karmahouse.site/user/${id}?ref=x`),id);
 assert.equal(accountIdFrom(`Mi código de cuenta en KarmaHouse: ${id}`),id);
 assert.equal(accountIdFrom(`"${id}"`),id);
 assert.equal(accountIdFrom('da6126d5'),null);
});

test('invitation refusals and dropped connections explain what happened', () => {
 assert.match(agencyError({message:'KH_AGENCY_INVITATION_OPEN'}),/invitación pendiente/);
 assert.match(agencyError({message:'KH_AGENCY_ALREADY_MEMBER'}),/ya forma parte/);
 assert.match(agencyError({message:'KH_AGENCY_RECIPIENT_INVALID'}),/correo confirmado/);
 assert.match(agencyError({message:'TimeoutError: La conexión con KarmaHouse tardó demasiado. Inténtalo de nuevo.'}),/Puede que se haya guardado/);
 assert.match(agencyError({message:'TypeError: Failed to fetch'}),/Puede que se haya guardado/);
 assert.match(agencyError({message:'KH_AGENCY_REQUEST_CONFLICT'}),/Los datos cambiaron/);
});

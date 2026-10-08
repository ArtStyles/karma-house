import assert from 'node:assert/strict';
import test from 'node:test';
import {historicalBody, inventoryProjection} from '../scripts/local-sql/agency-legacy.mjs';

test('historical SQL removes only its outer rollback transaction before migrations are prepended', () => {
  const body = historicalBody('-- fixture\nbegin;\ndo $$ begin perform 1; end $$;\nrollback;\n');
  assert.equal(body, '-- fixture\n\ndo $$ begin perform 1; end $$;\n\n');
  assert.throws(() => historicalBody('begin;\nselect 1;\ncommit;'), /rollback/);
  assert.throws(() => historicalBody('begin;\ncommit;\nbegin;\nrollback;'), /transaction/);
  assert.equal(historicalBody('select 1;'), 'select 1;');
});

test('historical inventory projects exactly named old columns with safe identifiers', () => {
  assert.equal(inventoryProjection(['id', 'owner_id', 'photo_paths']), '"id","owner_id","photo_paths"');
  assert.equal(inventoryProjection(['a"b']), '"a""b"');
  assert.throws(() => inventoryProjection([]), /columns/);
});

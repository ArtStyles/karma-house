import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('release secret scan allows the public intake address and rejects credentials and other admin addresses', () => {
  const temporaryRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'kh-secret-check-'));
  try {
    mkdirSync(join(directory, 'infra'));
    mkdirSync(join(directory, 'src/lib'), { recursive: true });
    writeFileSync(join(directory, '.gitignore'), 'infra/\n');
    writeFileSync(join(directory, 'src/lib/assistedPublication.ts'), "export const ASSISTED_PUBLICATION_EMAIL = 'public@example.invalid';\n");
    writeFileSync(join(directory, 'infra/.env.local'), 'SUPABASE_SECRET_KEY=fixture-private-key\nSUPABASE_DB_PASSWORD=fixture-private-password\nKARMAHOUSE_ADMIN_EMAIL=public@example.invalid\n');
    writeFileSync(join(directory, 'scan.mjs'), readFileSync('scripts/check-client-secrets.mjs'));
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    const scan = () => spawnSync(process.execPath, ['scan.mjs'], { cwd: directory, encoding: 'utf8' });
    assert.equal(scan().status, 0);
    for (const credential of ['fixture-private-key', 'fixture-private-password']) {
      writeFileSync(join(directory, 'deliverable.txt'), credential);
      assert.equal(scan().status, 1, `must reject ${credential}`);
    }
    writeFileSync(join(directory, 'infra/.env.local'), 'SUPABASE_SECRET_KEY=fixture-private-key\nSUPABASE_DB_PASSWORD=fixture-private-password\nKARMAHOUSE_ADMIN_EMAIL=private@example.invalid\n');
    writeFileSync(join(directory, 'deliverable.txt'), 'private@example.invalid');
    assert.equal(scan().status, 1);
    // A credential equal to the public address must still be rejected.
    writeFileSync(join(directory, 'infra/.env.local'), 'SUPABASE_SECRET_KEY=public@example.invalid\nSUPABASE_DB_PASSWORD=fixture-private-password\nKARMAHOUSE_ADMIN_EMAIL=public@example.invalid\n');
    writeFileSync(join(directory, 'deliverable.txt'), 'public@example.invalid');
    assert.equal(scan().status, 1);
  } finally {
    const within = relative(temporaryRoot, directory);
    assert.ok(within && !within.startsWith('..') && !isAbsolute(within));
    rmSync(directory, { recursive: true, force: true });
  }
});

// @ts-nocheck -- Native app compilation has no Node type dependency.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareMapWorker } from '../scripts/prepare-map-web.mjs';

test('web build receives the installed worker and every bundled module it imports', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'karma-map-worker-'));
  try {
    const packageRoot = path.join(projectRoot, 'node_modules/maplibre-gl');
    await mkdir(path.join(packageRoot, 'dist'), { recursive: true });
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '6.10.0' }));
    await writeFile(path.join(packageRoot, 'LICENSE.txt'), 'Worker license');
    await writeFile(path.join(packageRoot, 'dist/maplibre-gl-worker.mjs'), 'import {a} from "./maplibre-gl-shared.mjs"; self.onmessage=a;');
    await writeFile(path.join(packageRoot, 'dist/maplibre-gl-shared.mjs'), 'export const a=()=>{};');
    assert.equal(await prepareMapWorker(projectRoot), '/maplibre/6.10.0/maplibre-gl-worker.mjs');
    for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
      assert.equal(await readFile(path.join(projectRoot, 'public/maplibre/6.10.0', file), 'utf8'), await readFile(path.join(packageRoot, 'dist', file), 'utf8'));
    }
    assert.equal(await readFile(path.join(projectRoot, 'public/maplibre/6.10.0/LICENSE.txt'), 'utf8'), 'Worker license');
  } finally {
    assert.equal(path.dirname(path.resolve(projectRoot)), path.resolve(tmpdir()));
    assert.ok(path.basename(projectRoot).startsWith('karma-map-worker-'));
    await rm(projectRoot, { recursive: true, force: true });
  }
});

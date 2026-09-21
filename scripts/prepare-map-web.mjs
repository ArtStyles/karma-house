import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { copyFile, mkdir, readFile } from 'node:fs/promises';

export async function prepareMapWorker(projectRoot) {
  const packageRoot = path.join(projectRoot, 'node_modules', 'maplibre-gl');
  const { version } = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) throw new Error('Invalid MapLibre version');
  const sourceRoot = path.resolve(packageRoot, 'dist');
  const targetRoot = path.resolve(projectRoot, 'public', 'maplibre', version);
  const copied = new Set();
  async function copyModule(relativePath) {
    const source = path.resolve(sourceRoot, relativePath);
    if (!source.startsWith(`${sourceRoot}${path.sep}`)) throw new Error('Worker import escapes its package');
    if (copied.has(source)) return;
    copied.add(source);
    const content = await readFile(source, 'utf8');
    const target = path.resolve(targetRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    for (const match of content.matchAll(/\b(?:from\s*|import\s*)["'](\.[^"']+\.mjs)["']/g)) {
      await copyModule(path.join(path.dirname(relativePath), match[1]));
    }
  }
  await copyModule('maplibre-gl-worker.mjs');
  await copyFile(path.join(packageRoot, 'LICENSE.txt'), path.join(targetRoot, 'LICENSE.txt'));
  return `/maplibre/${version}/maplibre-gl-worker.mjs`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareMapWorker(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}

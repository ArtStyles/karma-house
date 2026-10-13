import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_LINE = "const VERSION = 'dev';";
const SHELL_LINE = "const SHELL = ['/'];";

/** Precache the page plus exactly the bundles it loads; the version changes whenever they or the worker do. */
export function stampServiceWorker(source, indexHtml) {
  if (!source.includes(VERSION_LINE) || !source.includes(SHELL_LINE)) throw new Error('sw.js placeholders not found');
  const bundles = [...new Set(indexHtml.match(/\/_expo\/static\/[^"'\s)]+/g) ?? [])].sort();
  if (!bundles.length) throw new Error('index.html loads no /_expo/static bundle');
  const version = createHash('sha256').update(source).update(indexHtml).digest('hex').slice(0, 12);
  return source
    .replace(VERSION_LINE, `const VERSION = '${version}';`)
    .replace(SHELL_LINE, `const SHELL = ${JSON.stringify(['/', ...bundles])};`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const file = path.join(dist, 'sw.js');
  const stamped = stampServiceWorker(await readFile(file, 'utf8'), await readFile(path.join(dist, 'index.html'), 'utf8'));
  await writeFile(file, stamped);
  console.log(stamped.split('\n').filter(line => /^const (VERSION|SHELL) =/.test(line)).join('\n'));
}

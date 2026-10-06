// Writes the server-rendered page into dist/index.html, so visitors see it before the JavaScript loads.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const { render } = await import('./dist-ssr/entry-server.js');
const file = 'dist/index.html';
const html = readFileSync(file, 'utf8');
if (!html.includes('<div id="root"></div>')) throw new Error(`${file}: empty #root not found`);
writeFileSync(file, html.replace('<div id="root"></div>', `<div id="root">${render()}</div>`));
rmSync('dist-ssr', { recursive: true });
console.log('prerendered', file);

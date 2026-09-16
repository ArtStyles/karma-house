// Rasterize the original code-native brand mark; this does not alter the generated property photographs.
const path = require('node:path');
const sharp = require(process.env.KARMA_SHARP_PATH || 'sharp');
async function main() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'assets', 'karmahouse-icon.svg');
  await sharp(source).resize(1024, 1024).png().toFile(path.join(root, 'assets', 'karmahouse-icon.png'));
  await sharp(source).resize(64, 64).png().toFile(path.join(root, 'assets', 'karmahouse-favicon.png'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

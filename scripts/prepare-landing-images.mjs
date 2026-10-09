// Run with SHARP_MODULE pointing to an installed sharp package, or install sharp locally.
import { createRequire } from 'node:module';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve('frontend/public');
async function variants(source, widths, quality = 85, lossless = false) {
  const { width } = await sharp(source).metadata();
  for (const size of [...new Set(widths.map(value => Math.min(value, width)))]) {
    const target = source.replace(/\.(png|jpg)$/, `-${size}.webp`);
    await sharp(source).resize({ width: size }).webp({ quality, lossless }).toFile(target);
    console.log(path.relative(root, target), (await stat(target)).size);
  }
}
for (const name of await readdir(path.join(root, 'landing'))) {
  if (name.endsWith('.jpg')) await variants(path.join(root, 'landing', name), [480, 800, 1280, 1920]);
}
await variants(path.join(root, 'logo.png'), [112, 224, 634], 100, true);
await variants(path.join(root, 'hero-stadium-bg.png'), [960, 1920]);

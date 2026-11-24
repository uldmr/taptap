// Build the unpacked extension into dist/. One bundle per entry point, no
// external runtime, so the manifest stays plain (no module service worker).

import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'dist');

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`manifest.json is ${manifest.version}, package.json is ${pkg.version} — bump both`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = { bundle: true, target: 'chrome116', logLevel: 'warning', legalComments: 'none' };

await build({ ...common, entryPoints: [join(root, 'src/content/main.js')], outfile: join(out, 'content.js'), format: 'iife' });
await build({ ...common, entryPoints: [join(root, 'src/sw.js')], outfile: join(out, 'sw.js'), format: 'iife' });

cpSync(join(root, 'manifest.json'), join(out, 'manifest.json'));
if (!existsSync(join(root, 'icons'))) {
  throw new Error('icons/ is missing — run `npm run icons`');
}
cpSync(join(root, 'icons'), join(out, 'icons'), { recursive: true });

for (const file of ['content.js', 'sw.js', 'manifest.json']) {
  const kb = (statSync(join(out, file)).size / 1024).toFixed(1);
  console.log(`${file.padEnd(14)} ${kb.padStart(6)} kB`);
}
console.log(`built ${manifest.name} ${manifest.version} -> ${out}`);

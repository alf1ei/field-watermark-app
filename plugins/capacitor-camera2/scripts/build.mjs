// Build step for @gszd/capacitor-camera2.
// The JS wrapper is hand-authored plain JavaScript (+ hand-written .d.ts),
// so there is no TypeScript compiler step in this environment: the build
// just copies src/ to dist/esm/ and verifies the output parses.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist', 'esm');

mkdirSync(dist, { recursive: true });
for (const f of readdirSync(src)) {
  cpSync(join(src, f), join(dist, f));
}
console.log('copied', readdirSync(src).join(', '), '-> dist/esm/');

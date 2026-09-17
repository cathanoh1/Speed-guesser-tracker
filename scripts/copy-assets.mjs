// tsc only compiles .ts files, so the static dashboard (html/css/js) needs an
// explicit copy into dist/ as part of the build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const src = path.join(root, 'src', 'web', 'public');
const dest = path.join(root, 'dist', 'web', 'public');

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`Copied ${path.relative(root, src)} -> ${path.relative(root, dest)}`);

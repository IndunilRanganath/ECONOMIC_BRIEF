import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../server/config.js';
import { PUBLIC_PAGES, PUBLIC_DIRECTORIES } from '../server/public-files.js';
const output = path.join(ROOT, 'public');
// Copy an explicit public allowlist. Never copy .env, credentials, or server source.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of PUBLIC_PAGES) {
  await cp(path.join(ROOT, file), path.join(output, file));
}
for (const folder of PUBLIC_DIRECTORIES) {
  await cp(path.join(ROOT, folder), path.join(output, folder), { recursive: true });
}
console.log('Prepared public HTML, CSS, JavaScript, fonts, and images for Vercel.');

import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../server/config.js';
const output = path.join(ROOT, 'public');
// Copy an explicit public allowlist. Never copy .env, credentials, or server source.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html','article.html','category.html','search.html','about.html','contact.html','privacy.html','editorial-policy.html','admin.html']) {
  await cp(path.join(ROOT,file), path.join(output,file));
}
for (const folder of ['css','js','assets']) await cp(path.join(ROOT,folder),path.join(output,folder),{recursive:true});
console.log('Prepared public HTML, CSS, JavaScript, fonts, and images for Vercel.');

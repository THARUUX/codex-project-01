import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const source = resolve('site'), output = resolve('dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
async function count(dir) {
  let files = 0, pages = 0;
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.isDirectory()) { const sub = await count(join(dir, item.name)); files += sub.files; pages += sub.pages; }
    else { files++; if (item.name.endsWith('.html')) pages++; }
  }
  return { files, pages };
}
const result = await count(output);
console.log(`Built ${result.pages} pages and ${result.files} files into dist/`);

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const source = resolve('node_modules/@fontsource/zen-kaku-gothic-antique');
const target = resolve('site/assets/fonts');
await mkdir(target, {recursive:true});
let combined = '/* Self-hosted SIL Open Font License font; see LICENSE.txt. */\n';
for (const [weight, families] of [[400,['TazuganeGothicStdN-Regular','Zen Kaku Gothic Antique']], [500,['TazuganeGothicStdN-Medium','IwaOGoPro-Db']], [700,['TazuganeGothicStdN-Bold']]]) {
  const original = await readFile(`${source}/${weight}.css`, 'utf8');
  for (const match of original.matchAll(/url\(([^)]+)\)/g)) {
    const file = match[1].replace(/^\.\//,'');
    await mkdir(`${target}/files`,{recursive:true});
    await copyFile(`${source}/${file}`,`${target}/${file}`);
  }
  for (const family of families) combined += original.replaceAll("'Zen Kaku Gothic Antique'", `'${family}'`).replaceAll(/font-weight: \d+;/g, 'font-weight: 100 900;') + '\n';
}
for (const [name,weight] of [['Regular',400],['Md',500],['Bd',700]]) {
  combined += `@font-face {font-family:'HelveticaNowDisplay-${name}';font-style:normal;font-weight:100 900;src:local('${weight === 700 ? 'Arial Bold' : 'Arial'}'),local('${weight === 700 ? 'Liberation Sans Bold' : 'Liberation Sans'}');font-display:swap;}\n`;
}
await writeFile(`${target}/local.css`, combined);
await copyFile(`${source}/LICENSE`, `${target}/LICENSE.txt`);
console.log('Prepared local fonts.');

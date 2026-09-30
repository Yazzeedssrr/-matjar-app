// Publish only the store frontend, not SQL, private exports, tests, or old demo entry points.
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
const out=resolve('dist');
await mkdir(out,{recursive:true});
const pages=['app.html','seller.html','operations.html','information.html','manifest.webmanifest','sw.js'];
for(const path of pages)await cp(path,resolve(out,path));
const scripts=['makhraj-config.js','makhraj-i18n.js','makhraj-app.js','makhraj-honey.js','makhraj-editor-v2.js','makhraj-seller-v3.js','makhraj-operations.js','makhraj-information.js','makhraj-ops-links.js'];
const styles=['makhraj-theme.css','makhraj-app.css','makhraj-honey.css','makhraj-seller.css','makhraj-admin-safety.css','makhraj-operations.css'];
await mkdir(resolve(out,'assets'),{recursive:true});
for(const f of [...scripts,...styles])await cp('assets/'+f,resolve(out,'assets',f));
await writeFile(resolve(out,'index.html'),await readFile('app.html','utf8'));
await writeFile(resolve(out,'robots.txt'),'User-agent: *\nDisallow: /seller.html\nDisallow: /operations.html\n');
console.log('Store frontend built. No accounts, database rows or private exports were copied.');

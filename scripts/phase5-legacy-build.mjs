import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,cp,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// Rebuild the actual pre-Phase-5 frontend without touching this checkout.
const ref='5115adbe3d4d06b333a9f9e1bd1f4b01cfce8ee4';
const source=resolve('artifacts/phase5-legacy-source'), output=resolve('artifacts/phase5-baseline-dist');
await mkdir(resolve(source,'public'),{recursive:true});await mkdir(resolve(source,'scripts'),{recursive:true});
const files=execFileSync('git',['ls-tree','--name-only',ref,'public/'],{encoding:'utf8'}).trim().split(/\r?\n/);
for(const file of [...files,'scripts/build.mjs']){
  if(!/^(public\/[\w.-]+|scripts\/build\.mjs)$/.test(file))throw Error('unexpected baseline path');
  await writeFile(resolve(source,file),execFileSync('git',['show',`${ref}:${file}`]));
}
await cp('node_modules/leaflet',resolve(source,'node_modules/leaflet'),{recursive:true});
execFileSync(process.execPath,[resolve(source,'scripts/build.mjs')],{cwd:source,stdio:'inherit'});
if(output!==resolve('artifacts/phase5-baseline-dist'))throw Error('invalid legacy output');
await rm(output,{recursive:true,force:true});await cp(resolve(source,'dist'),output,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(output,'asset-manifest.json'),'utf8'));
console.log(`Phase 5 legacy built from ${ref}: ${manifest.version}`);

import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {dayInZone} from '../public/model.mjs';
import {withNavigation} from './ui-navigation.mjs';

// Real production GETs and isolated test profiles only. Never refresh Notion.
const base='https://travel-itinerary.baribaritozan.workers.dev';
const prepare=process.argv.includes('--prepare');
const statePath='artifacts/phase5-production-profile.json';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir('artifacts',{recursive:true});
const response=await fetch(base+'/api/itinerary');assert.equal(response.status,200);
const payload=await response.json(),payloadHash=digest(JSON.stringify(payload));
assert.ok(payload.items.every(item=>/^[a-f0-9]{64}$/.test(item.id)));
const validDays=[...new Set(payload.items.filter(i=>!i.parentId&&!i.detourForId&&i.status!=='Cancelled'&&i.start).map(i=>dayInZone(i.start,payload.trip.timezone)))].sort();
assert.ok(validDays.length,'published itinerary has a scheduled day');
const evidence={checkedAt:new Date().toISOString(),mode:prepare?'prepare':'phase5-production',publicItems:payload.items.length,publicPlaces:payload.places.length,payloadHash,apiCache:response.headers.get('X-Itinerary-Cache'),checks:[]};
const errors=[],requests=[];let context;
const launch=profile=>chromium.launchPersistentContext(profile,{headless:true,channel:process.platform==='win32'?'chrome':undefined,viewport:{width:390,height:844},reducedMotion:'reduce'});
async function routes(ctx){
  await ctx.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dbe6df"/></svg>'}));
  await ctx.route('https://www.google.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Intercepted external directions</title>'}));
  await ctx.route(base+'/api/**',route=>route.request().method()==='GET'?route.continue():route.abort());
}
async function configure(ctx,online=true){
  await ctx.addInitScript(()=>{window.__geoCalls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){window.__geoCalls++;throw Error('No position request allowed in production smoke');}}});});
  ctx.on('request',request=>{if(request.url().startsWith(base))requests.push({path:new URL(request.url()).pathname,method:request.method()});});
  if(online)await routes(ctx);
}
function monitor(page){page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));return withNavigation(page);}
async function day(page,value=validDays[0]){
  await page.locator('.day-button').first().waitFor();await page.locator(`[data-day="${value}"]`).click();await page.locator('.item').first().waitFor();
}
const saved=page=>page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('travel-itinerary-offline-v1');request.onsuccess=()=>resolve(request.result);request.onerror=reject;});
  try{return await new Promise(resolve=>{const request=db.transaction('records').objectStore('records').get('active');request.onsuccess=()=>resolve(request.result);});}finally{db.close();}
});
async function closeMenu(page){if(await page.locator('.more-menu').count()&&await page.locator('.more-menu').evaluate(el=>el.open))await page.locator('.close-menu').click();}
async function openRoots(page){for(const toggle of await page.locator('.items > .item > .details-toggle').all())if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();}
async function candidateAndScene(page){
  for(const value of validDays){
    await day(page,value);await openRoots(page);
    const next=page.locator('.candidate-controls [data-candidate-step="1"]:not(:disabled)');
    for(let i=0;i<await next.count();i++){
      const button=next.nth(i);if(!await button.isVisible()||await button.evaluate(el=>Boolean(el.closest('[inert]'))))continue;
      const group=await button.evaluate(el=>el.closest('[data-group]').dataset.group);
      const active=page.locator(`.group-candidates[data-group="${group}"] .candidate-slot[data-active="true"]`),before=await active.getAttribute('data-candidate');
      await button.click();await page.waitForFunction(({group,before})=>document.querySelector(`.group-candidates[data-group="${group}"] .candidate-slot[data-active="true"]`)?.dataset.candidate!==before,{group,before});
      const title=active.locator('.scene-open').first();await title.click();assert.equal(await page.locator('#app').getAttribute('data-scene'),'true');
      await page.screenshot({path:'artifacts/phase5-production-fullscreen.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('#app').getAttribute('data-scene'),'false');
      return true;
    }
    const scene=page.locator('.scene-open');
    for(let i=0;i<await scene.count();i++)if(await scene.nth(i).isVisible()&&!await scene.nth(i).evaluate(el=>Boolean(el.closest('[inert]')))){
      await scene.nth(i).click();assert.equal(await page.locator('#app').getAttribute('data-scene'),'true');await page.screenshot({path:'artifacts/phase5-production-fullscreen.png'});await page.locator('.scene-back').click();return true;
    }
  }
  return false;
}
async function controls(page){
  await day(page);assert.equal(await page.locator('.map-panel').getAttribute('data-mode'),'minimal');
  await page.locator('.nav-map').click();await page.locator('.place-pin').first().waitFor();
  await page.locator('[data-mode="expanded"]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.map-panel').getAttribute('data-mode'),'standard');
  await page.locator('.card-focus').first().click();await page.locator('.items > .item > .details-toggle').first().click();
  await page.locator('.nav-compare').click();await page.locator('.items > .item > .select-toggle').first().click();
  const count=await page.locator('.selection-count').innerText();assert.match(count,/\d+件/);await page.locator('.nav-compare').click();assert.equal(await page.locator('.selection-count').innerText(),count);
  await page.locator('.show-cancelled').check();await page.locator('.show-cancelled').uncheck();await page.locator('.time-reset').click();await closeMenu(page);
  await page.locator('.nav-map').click();
  const hasScene=await candidateAndScene(page);if(payload.items.some(i=>i.structure==='Series'||i.structure==='Alternative Group'))assert.ok(hasScene,'published structures can open a scene');
  assert.equal(await page.evaluate(()=>__geoCalls),0);evidence.checks.push('real published candidates/scenes, menus, comparison retention and map');
}
async function plannedRoute(page,ctx){
  for(const value of validDays){await day(page,value);await openRoots(page);
    for(const button of await page.locator('[data-planned]').all()){
      if(await button.isDisabled()||await button.evaluate(el=>Boolean(el.closest('[inert]'))))continue;
      const ancestors=await button.evaluate(el=>{const ids=[];for(let item=el.closest('.item');item;item=item.parentElement.closest('.item'))ids.unshift(item.dataset.id);return ids;});
      for(const id of ancestors){const toggle=page.locator(`.item[data-id="${id}"] > .details-toggle`);if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();}
      if(!await button.isVisible())continue;
      const [popup]=await Promise.all([ctx.waitForEvent('page'),button.click()]);await popup.waitForLoadState();assert.equal(new URL(popup.url()).origin,'https://www.google.com');assert.equal(await popup.evaluate(()=>window.opener),null);await popup.close();return true;
    }
  }return false;
}
try{
  if(prepare){
    const profile=await mkdtemp(resolve(tmpdir(),'travel-p5-live-'));context=await launch(profile);await configure(context);const page=monitor(context.pages()[0]);
    await page.goto(base);await day(page);assert.equal(await page.locator('.menu-bar').count(),0,'prepare against actual old production UI');
    await page.locator('.offline-panel summary').click();await page.locator('.save-offline').click();
    await page.waitForFunction(()=>document.querySelector('.storage-message')?.textContent.includes('有効にしました'),{},{timeout:30000});await page.waitForFunction(()=>navigator.serviceWorker.controller);
    const record=await saved(page),cacheNames=await page.evaluate(()=>caches.keys());assert.equal(digest(JSON.stringify(record.payload)),payloadHash);
    await page.screenshot({path:'artifacts/phase5-production-baseline-mobile.png'});await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'artifacts/phase5-production-baseline-desktop.png'});
    assert.equal(await page.evaluate(()=>__geoCalls),0);assert.deepEqual(errors,[]);
    await writeFile(statePath,JSON.stringify({profile,payloadHash,firstSavedAt:record.firstSavedAt,expiresAt:record.expiresAt,generatedAt:record.generatedAt,cacheNames},null,2));
    evidence.checks.push('actual old production UI and explicit saved persistent profile','zero geolocation','public stable ID boundary');
  }else{
    const baseline=JSON.parse(await readFile(statePath,'utf8'));assert.equal(payloadHash,baseline.payloadHash,'published payload unchanged since prepare');
    const manifest=JSON.parse(await readFile('dist/asset-manifest.json','utf8'));
    await Promise.all(manifest.precache.map(async file=>{const result=await fetch(base+file.url);assert.equal(result.status,200);assert.equal(digest(Buffer.from(await result.arrayBuffer())),file.hash,'deployed '+file.url);}));
    const sw=await fetch(base+'/sw.js');assert.match(sw.headers.get('content-type'),/javascript/);assert.match(sw.headers.get('cache-control'),/no-cache/);assert.equal(await sw.text(),await readFile('dist/sw.js','utf8'));
    evidence.build=manifest.version;evidence.checks.push('16 deployed hashes and SW content/headers match local build');
    context=await launch(baseline.profile);await configure(context);let page=monitor(context.pages()[0]);await page.goto(base);await day(page);
    assert.equal(await page.locator('.menu-bar').count(),0,'saved old UI remains before explicit activation');let reloads=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())reloads++;});
    await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting),{},{timeout:30000});
    assert.equal(reloads,0);assert.equal(await page.locator('.menu-bar').count(),0);await page.locator('.update-app').click();await page.locator('.menu-bar').waitFor();assert.equal(reloads,1);
    let record=await saved(page);assert.equal(record.firstSavedAt,baseline.firstSavedAt);assert.equal(record.expiresAt,baseline.expiresAt);assert.equal(digest(JSON.stringify(record.payload)),payloadHash);
    assert.deepEqual(await page.evaluate(()=>caches.keys()),['travel-itinerary-shell-'+manifest.version]);
    evidence.checks.push('real production legacy profile waits, one explicit activation, unchanged saved trip/expiry, only new shell cache');
    await controls(page);await day(page);await page.screenshot({path:'artifacts/phase5-production-mobile.png'});await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'artifacts/phase5-production-desktop.png'});
    await context.close();context=await launch(baseline.profile);await configure(context,false);await context.setOffline(true);page=monitor(context.pages()[0]);await page.goto(base);await page.locator('.menu-bar').waitFor();
    await controls(page);await page.waitForFunction(()=>document.querySelector('.menu-alert')?.textContent.includes('圏外'));await page.screenshot({path:'artifacts/phase5-production-offline.png'});
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);record=await saved(page);assert.equal(record.expiresAt,baseline.expiresAt);assert.equal(digest(JSON.stringify(record.payload)),payloadHash);
    evidence.checks.push('profile terminated then offline restart with new UI controls, pins and routes','UI state not persisted, saved expiry retained');
    await routes(context);await context.setOffline(false);await page.waitForFunction(()=>document.querySelector('.offline-status')?.textContent.includes('オンライン'));
    assert.ok(await plannedRoute(page,context),'published planned route opens safely');evidence.checks.push('reconnected GET and real noopener route popup with Google network intercepted');
    assert.equal(await page.evaluate(()=>__geoCalls),0);await page.locator('.delete-offline').click();await page.waitForFunction(()=>document.querySelector('.storage-message')?.textContent.includes('削除しました'));
    assert.deepEqual(await page.evaluate(async()=>({databases:await indexedDB.databases(),caches:await caches.keys(),registrations:(await navigator.serviceWorker.getRegistrations()).length})),{databases:[],caches:[],registrations:0});
    evidence.checks.push('test profile explicit DB/cache/SW deletion','zero geolocation and zero production POST');assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);
  }
  const after=await(await fetch(base+'/api/itinerary')).json();assert.equal(digest(JSON.stringify(after)),payloadHash);evidence.checks.push('public payload unchanged');evidence.result='passed';
}catch(error){evidence.result='failed';evidence.failure=error.message;throw error;}
finally{await context?.close();await writeFile(`artifacts/phase5-production-${prepare?'baseline':'smoke'}.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}

import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {phase5Fixture} from './phase5-fixture.mjs';
// Local synthetic preview. No Notion, refresh service, location or production access.
const payload=JSON.stringify(phase5Fixture).replaceAll('2026-10-09','2026-10-16').replaceAll('2026-10-10','2026-10-17').replaceAll('2026-10-11','2026-10-18');
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  try {
    if(path.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json','X-Itinerary-Cache':'hit'});res.end(payload);return;}
    if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const mock=path==='/approved-mock';
    if(!mock && path!=='/' && !/^\/(assets\/[\w./-]+|manifest\.webmanifest|icon-\d+\.png|sw\.js)$/.test(path))throw Error('path');
    const file=mock?'docs/design/phase5/approved-mock.html':resolve('dist',path==='/'?'index.html':path.slice(1));
    if(path.includes('..'))throw Error('path');
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':mock?'text/html; charset=utf-8':({'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(file)]||'text/plain'),'Cache-Control':'no-cache'});res.end(content);
  }catch{res.writeHead(404);res.end();}
});
server.listen(4175,'127.0.0.1',()=>console.log('Phase 5 synthetic preview: http://127.0.0.1:4175 ; approved mock: /approved-mock'));

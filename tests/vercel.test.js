import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { readFile, access, mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { ROOT } from '../server/config.js';

test('a missing deployed server module returns a safe JSON diagnostic instead of crashing during import', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'brief-function-import-'));
  try {
    await mkdir(path.join(directory, 'api'));
    await mkdir(path.join(directory, 'server'));
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    await copyFile(path.join(ROOT, 'api/index.js'), path.join(directory, 'api/index.js'));
    await copyFile(path.join(ROOT, 'server/startup-error.js'), path.join(directory, 'server/startup-error.js'));
    // Deliberately omit the server modules to reproduce an incomplete function bundle.
    const { default: handler } = await import(pathToFileURL(path.join(directory, 'api/index.js')).href);
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = {};
      const response = { setHeader(name, value) { headers[name] = value; }, end(body) { this.body = body; } };
      await handler({}, response);
      assert.equal(response.statusCode, 503);
      assert.match(headers['Content-Type'], /application\/json/);
      assert.equal(headers['Cache-Control'], 'no-store');
      assert.match(JSON.parse(response.body).error, /server dependency/);
      assert(!response.body.includes(directory));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Vercel defaults avoid filesystem writes and cap proxied image uploads',()=>{
  const config=getConfig({MONGODB_URI:'mongodb://127.0.0.1:27017',VERCEL:'1',NODE_ENV:'production',APP_ORIGIN:'https://economicbrife.vercel.app'});
  assert.equal(config.uploadStorage,'mongodb');assert.equal(config.maxUploadBytes,4*1024*1024);assert.equal(config.trustProxy,true);
  assert.throws(()=>getConfig({MONGODB_URI:'mongodb://127.0.0.1:27017',VERCEL:'1',UPLOAD_STORAGE:'filesystem'}),/Vercel requires/);
});

test('Vercel function returns JSON failures, retries initialization, and serves durable uploads', {timeout:180000}, async t=>{
  const keys=['MONGODB_URI','MONGODB_DB','VERCEL','NODE_ENV','APP_ORIGIN','UPLOAD_DIR'];
  const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  let mongo,client,server,closeRuntime;
  try{
    delete process.env.MONGODB_URI;process.env.VERCEL='1';process.env.NODE_ENV='development';delete process.env.APP_ORIGIN;
    const module=await import('../api/index.js');const handler=module.default;closeRuntime=module.closeRuntime;
    server=http.createServer(handler);server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
    await t.test('configuration errors are JSON, not a platform HTML page',async()=>{
      const response=await fetch(origin+'/api/admin/session');assert.equal(response.status,503);assert.match(response.headers.get('content-type'),/application\/json/);assert.match((await response.json()).error,/MONGODB_URI/);
    });
    mongo=await MongoMemoryServer.create({binary:{downloadDir:path.join(os.tmpdir(),'brief-mongodb-binaries')}});
    process.env.MONGODB_URI=mongo.getUri();process.env.MONGODB_DB='brief_vercel_test';process.env.UPLOAD_DIR=path.join(os.tmpdir(),'brief-must-not-create-'+Date.now());
    const config=getConfig();const connection=await connectDatabase(config);client=connection.client;const db=connection.db;
    await db.collection('admins').insertOne({email:'vercel-editor@example.test',passwordHash:await hashPassword('vercel-test-only-password')});
    let cookie,csrf,src;
    await t.test('successful initialization exposes health and protected admin APIs',async()=>{
      assert.equal((await fetch(origin+'/api/health')).status,200);
      assert.equal((await fetch(origin+'/api/admin/session')).status,401);
      const response=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'vercel-editor@example.test',password:'vercel-test-only-password'})});assert.equal(response.status,200);cookie=response.headers.getSetCookie()[0].split(';')[0];const data=await response.json();csrf=data.csrf;assert.equal(data.maxUploadBytes,4*1024*1024);
      assert.equal((await fetch(origin+'/api/admin/posts',{headers:{Cookie:cookie}})).status,200);
    });
    await t.test('uploads persist in MongoDB and survive a new app instance',async()=>{
      const bytes=await readFile(path.join(ROOT,'assets/images/business.jpg'));
      const form=new FormData();form.append('image',new Blob([bytes],{type:'image/jpeg'}),'news.jpg');
      const response=await fetch(origin+'/api/admin/uploads',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf},body:form});assert.equal(response.status,201);src=(await response.json()).src;
      assert.equal(await db.collection('media.files').countDocuments({}),1);
      await assert.rejects(access(config.uploadDir));
      const stored=await fetch(origin+'/'+src);assert.equal(stored.status,200);assert.equal(Buffer.compare(Buffer.from(await stored.arrayBuffer()),bytes),0);
      const another=await createApp({db,config});const second=http.createServer(another);second.listen(0,'127.0.0.1');await new Promise(r=>second.once('listening',r));
      try{const url='http://127.0.0.1:'+second.address().port;assert.equal((await fetch(url+'/'+src)).status,200);const media=await fetch(url+'/api/admin/media',{headers:{Cookie:cookie}});assert((await media.json()).includes(src));}finally{await new Promise(r=>second.close(r));}
    });
    await t.test('a published post can reference a GridFS image',async()=>{
      const response=await fetch(origin+'/api/admin/posts',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({title:'Vercel image story',slug:'vercel-image-story',summary:'Image served from persistent storage.',author:'Test editor',category:'Business',format:'image',visibility:'published',image:src,alt:'Business newspaper',body:'',tags:[],sources:[]})});assert.equal(response.status,201);
      const published=await (await fetch(origin+'/api/posts')).json();assert(published.some(p=>p.slug==='vercel-image-story'));
    });
    // Explicitly close the warm function's pool in this isolated test process.
    await new Promise(r=>server.close(r));server=null;
  }finally{
    if(server)await new Promise(r=>server.close(r));await closeRuntime?.();await client?.close();await mongo?.stop();
    for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
  }
});

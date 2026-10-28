import { GridFSBucket } from 'mongodb';
import { mkdir, writeFile, readdir, access } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { ROOT } from './config.js';
const namePattern = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|svg)$/i;
export async function createMediaStore(db, config) {
  const inMongo = config.uploadStorage === 'mongodb';
  const bucket = inMongo ? new GridFSBucket(db,{bucketName:'media'}) : null;
  if (!inMongo) await mkdir(config.uploadDir,{recursive:true});
  return {
    inMongo,
    async save(filename, bytes, contentType) {
      if (inMongo) {
        const stream = bucket.openUploadStream(filename,{metadata:{contentType}});
        stream.end(bytes); await finished(stream);
      } else await writeFile(path.join(config.uploadDir,filename),bytes,{flag:'wx'});
    },
    async exists(src) {
      if (src.startsWith('uploads/') && inMongo) return Boolean(await db.collection('media.files').findOne({filename:path.basename(src)}));
      try {await access(src.startsWith('uploads/')?path.join(config.uploadDir,path.basename(src)):path.join(ROOT,src));return true;}catch{return false;}
    },
    async list() {
      const result=(await readdir(path.join(ROOT,'assets/images'))).filter(n=>namePattern.test(n)).map(n=>'assets/images/'+n);
      if (inMongo) {
        const files=await db.collection('media.files').find({},{projection:{filename:1}}).toArray();
        result.push(...files.filter(f=>namePattern.test(f.filename)).map(f=>'uploads/'+f.filename));
      } else result.push(...(await readdir(config.uploadDir)).filter(n=>namePattern.test(n)).map(n=>'uploads/'+n));
      return [...new Set(result)];
    },
    async serve(req,res,next) {
      const filename=req.params.filename;
      if (!namePattern.test(filename)) return res.status(404).end();
      const file=await db.collection('media.files').findOne({filename});
      if (!file) return res.status(404).end();
      const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
      res.set({'Content-Type':types[filename.split('.').pop().toLowerCase()]||'application/octet-stream','Content-Length':String(file.length),'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable'});
      const stream=bucket.openDownloadStream(file._id);
      stream.on('error',error=>{if(res.headersSent)res.destroy();else next(error);});
      res.on('close',()=>stream.destroy());stream.pipe(res);
    },
  };
}

import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { ROOT } from './config.js';
import { createMediaStore } from './media.js';
import { authentication, sameOrigin, csrfProtection, createSession, cookieOptions, cookieToken, tokenHash, SESSION_COOKIE, hashPassword, verifyPassword } from './auth.js';
import { validatePost, withoutMongoId, publicPost, HttpError } from './posts.js';

export async function createApp({ db, config }) {
  const media = await createMediaStore(db, config);
  const maxUploadBytes = config.maxUploadBytes || 8 * 1024 * 1024;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'blob:', 'data:'], connectSrc: ["'self'"],
      objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: config.production ? [] : null,
    } },
    strictTransportSecurity: config.production ? undefined : false,
  }));
  app.use(express.json({ limit: '300kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, sameOrigin(config));
  const requireAdmin = authentication(db);
  const mutation = [requireAdmin, csrfProtection];
  const dummyPassword = await hashPassword(randomBytes(32).toString('hex'));
  app.get('/api/health', async (req, res) => {
    await db.command({ ping: 1 }); res.json({ ok: true });
  });
  app.get(['/api/posts', '/data/articles.json'], async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const posts = await db.collection('posts').find({ visibility: 'published' }).sort({ feedPriority: -1, createdAt: -1, id: 1 }).toArray();
    res.json(posts.map(publicPost));
  });
  app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' } }), async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 200) throw new HttpError(400, 'Enter your email and password.');
    const admin = await db.collection('admins').findOne({ email: email.trim().toLowerCase() });
    const valid = await verifyPassword(password, admin?.passwordHash || dummyPassword);
    if (!admin || !valid) throw new HttpError(401, 'Email or password is incorrect.');
    const old = cookieToken(req);
    if (old) await db.collection('sessions').deleteOne({ _id: tokenHash(old) });
    const { token, session } = await createSession(db, admin._id);
    res.cookie(SESSION_COOKIE, token, cookieOptions(config.production));
    res.json({ email: admin.email, csrf: session.csrf, maxUploadBytes });
  });
  app.get('/api/admin/session', requireAdmin, (req, res) => res.json({ email: req.admin.email, csrf: req.session.csrf, maxUploadBytes }));
  app.post('/api/admin/logout', ...mutation, async (req, res) => {
    await db.collection('sessions').deleteOne({ _id: req.session._id });
    const { maxAge, ...options } = cookieOptions(config.production);
    res.clearCookie(SESSION_COOKIE, options); res.json({ ok: true });
  });
  app.get('/api/admin/posts', requireAdmin, async (req, res) => {
    const posts = await db.collection('posts').find({}).sort({ modifiedAt: -1 }).toArray();
    res.json(posts.map(withoutMongoId));
  });
  async function checkImages(post) {
    for (const image of [post.image, ...post.gallery.map(g => g.src)]) {
      if (!await media.exists(image)) throw new HttpError(400, 'An image is missing. Upload it before saving the post.');
    }
  }
  app.post('/api/admin/posts', ...mutation, async (req, res) => {
    const post = validatePost(req.body); await checkImages(post);
    const doc = { ...post, id: randomUUID(), revision: 1, createdAt: new Date(), modifiedAt: new Date() };
    await db.collection('posts').insertOne(doc);
    if (post.featured && post.visibility === 'published') await db.collection('posts').updateMany({ id: { $ne: doc.id }, featured: true }, { $set: { featured: false, modifiedAt: new Date() }, $inc: { revision: 1 } });
    res.status(201).json(withoutMongoId(doc));
  });
  app.put('/api/admin/posts/:id', ...mutation, async (req, res) => {
    if (!Number.isInteger(req.body?.revision)) throw new HttpError(400, 'Reload the post before saving.');
    const post = validatePost(req.body); await checkImages(post);
    const result = await db.collection('posts').findOneAndUpdate(
      { id: req.params.id, revision: req.body.revision },
      { $set: { ...post, modifiedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: 'after' },
    );
    if (!result) {
      const exists = await db.collection('posts').findOne({ id: req.params.id });
      throw new HttpError(exists ? 409 : 404, exists ? 'This post changed in another window. Reopen it before saving.' : 'Post not found.');
    }
    if (post.featured && post.visibility === 'published') await db.collection('posts').updateMany({ id: { $ne: result.id }, featured: true }, { $set: { featured: false, modifiedAt: new Date() }, $inc: { revision: 1 } });
    res.json(withoutMongoId(result));
  });
  app.delete('/api/admin/posts/:id', ...mutation, async (req, res) => {
    if (!Number.isInteger(req.body?.revision)) throw new HttpError(400, 'Reload the post before deleting.');
    const result = await db.collection('posts').deleteOne({ id: req.params.id, revision: req.body.revision });
    if (!result.deletedCount) throw new HttpError(409, 'This post changed or was removed. Refresh the list before deleting.');
    // Image files are retained because other posts may reference them.
    res.json({ ok: true });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 1, fields: 0, parts: 1 } });
  app.post('/api/admin/uploads', ...mutation, rateLimit({ windowMs: 60000, limit: 30, message: { error: 'Please wait a minute before uploading more images.' } }), upload.single('image'), async (req, res) => {
    const bytes = req.file?.buffer;
    let extension;
    if (bytes?.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) extension = 'png';
    else if (bytes?.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = 'jpg';
    else if (bytes?.length > 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') extension = 'webp';
    if (!extension) throw new HttpError(400, 'Upload a JPEG, PNG, or WebP image. SVG uploads are not supported.');
    const filename = `${randomUUID()}.${extension}`;
    await media.save(filename, bytes, {jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[extension]);
    res.status(201).json({ src: `uploads/${filename}` });
  });
  app.get('/api/admin/media', requireAdmin, async (req, res) => {
    res.json(await media.list());
  });
  app.use('/api', (req,res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.get('/admin', (req,res) => res.redirect('/admin.html'));
  for (const file of ['index.html','article.html','category.html','search.html','about.html','contact.html','privacy.html','editorial-policy.html','admin.html']) {
    app.get(file === 'index.html' ? ['/', '/index.html'] : '/' + file, (req,res) => res.sendFile(path.join(ROOT,file)));
  }
  for (const dir of ['css','js','assets']) app.use('/'+dir, express.static(path.join(ROOT,dir), { dotfiles:'deny', index:false }));
  if (media.inMongo) app.get('/uploads/:filename', (req,res,next) => media.serve(req,res,next).catch(next));
  else app.use('/uploads', express.static(config.uploadDir, { dotfiles:'deny', index:false, setHeaders: res => {res.set('X-Content-Type-Options','nosniff');} }));
  app.use((req,res) => res.status(404).type('text').send('Page not found.'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === 11000) return res.status(409).json({ error: 'That URL slug already exists. Choose a different slug.' });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? `Images must be ${maxUploadBytes / 1024 / 1024} MB or smaller.` : 'Upload one image at a time.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error:'The request contains invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error:'This post is too large. Reduce the body text.' });
    res.status(error.status || 500).json({ error: error.status ? error.message : 'The server could not complete the request. Please try again.' });
  });
  return app;
}

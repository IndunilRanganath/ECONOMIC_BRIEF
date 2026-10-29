import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDatabase, importInitialPosts } from '../server/database.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { ROOT } from '../server/config.js';

test(
  'MongoDB publishing, admin authentication, and upload lifecycle',
  { timeout: 180000 },
  async (t) => {
    const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'brief-admin-uploads-'));
    let mongo, client, server;
    try {
      mongo = await MongoMemoryServer.create({
        binary: { downloadDir: path.join(os.tmpdir(), 'brief-mongodb-binaries') },
      });
      const config = {
        uri: mongo.getUri(),
        dbName: 'brief_test',
        uploadDir,
        production: false,
        origin: '',
        trustProxy: false,
      };
      const connection = await connectDatabase(config);
      client = connection.client;
      const db = connection.db;
      await importInitialPosts(db);
      await db.collection('admins').insertOne({
        email: 'editor@example.test',
        passwordHash: await hashPassword('test-only-password-123'),
      });
      const app = await createApp({ db, config });
      server = app.listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      const origin = 'http://127.0.0.1:' + server.address().port;
      let cookie = '',
        csrf = '',
        created,
        uploaded;
      const request = async (url, method = 'GET', body, options = {}) => {
        const headers = { Origin: origin, ...options.headers };
        if (cookie) headers.Cookie = cookie;
        if (csrf) headers['X-CSRF-Token'] = csrf;
        if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
        const response = await fetch(origin + url, {
          method,
          headers,
          body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        });
        return response;
      };
      await t.test('imports JSON exactly once and serves only public data', async () => {
        const original = JSON.parse(await readFile(path.join(ROOT, 'data/articles.json'), 'utf8'));
        const res = await request('/api/posts');
        assert.equal(res.status, 200);
        const posts = await res.json();
        assert.equal(posts.length, original.length);
        assert.equal(posts.find((a) => a.id === 'economic-experts-2026').body, original[0].body);
        assert.equal(posts[0]._id, undefined);
        assert.equal(posts[0].revision, undefined);
        assert.equal((await request('/api/admin/posts')).status, 401);
        for (const privatePath of [
          '/.env',
          '/server/config.js',
          '/package.json',
          '/node_modules/mongodb/package.json',
        ])
          assert.equal((await request(privatePath)).status, 404);
      });
      await t.test('returns JSON for malformed requests and missing API routes', async () => {
        const malformed = await fetch(origin + '/api/admin/login', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: '{invalid-json',
        });
        assert.equal(malformed.status, 400);
        assert.deepEqual(await malformed.json(), { error: 'The request contains invalid JSON.' });

        const missing = await request('/api/does-not-exist');
        assert.equal(missing.status, 404);
        assert.deepEqual(await missing.json(), { error: 'API endpoint not found.' });
      });
      await t.test('requires valid credentials and same-origin login', async () => {
        assert.equal(
          (
            await request('/api/admin/login', 'POST', {
              email: 'editor@example.test',
              password: 'wrong',
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await request(
              '/api/admin/login',
              'POST',
              { email: 'editor@example.test', password: 'test-only-password-123' },
              { headers: { Origin: 'https://other.example' } },
            )
          ).status,
          403,
        );
        const res = await request('/api/admin/login', 'POST', {
          email: 'editor@example.test',
          password: 'test-only-password-123',
        });
        assert.equal(res.status, 200);
        const rawCookie = res.headers.getSetCookie()[0];
        assert.match(rawCookie, /HttpOnly/);
        assert.match(rawCookie, /SameSite=Strict/);
        cookie = rawCookie.split(';')[0];
        csrf = (await res.json()).csrf;
        assert.equal((await request('/api/admin/session')).status, 200);
        assert.equal((await db.collection('sessions').findOne({}))._id.length, 64);
      });
      await t.test('authenticates uploads and validates actual image signatures', async () => {
        const bad = new FormData();
        bad.append(
          'image',
          new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' }),
          'fake.png',
        );
        assert.equal((await request('/api/admin/uploads', 'POST', bad)).status, 400);
        const good = new FormData();
        good.append(
          'image',
          new Blob([await readFile(path.join(ROOT, 'assets/images/business.jpg'))], {
            type: 'image/jpeg',
          }),
          'news.jpg',
        );
        const res = await request('/api/admin/uploads', 'POST', good);
        assert.equal(res.status, 201);
        uploaded = (await res.json()).src;
        const image = await request('/' + uploaded);
        assert.equal(image.status, 200);
        assert.match(image.headers.get('content-type'), /image\/jpeg/);
      });
      const payload = () => ({
        title: 'A test image story',
        slug: 'test-image-story',
        summary: 'Context for the image.',
        category: 'Business',
        format: 'image',
        visibility: 'draft',
        author: 'Test editor',
        image: uploaded,
        alt: 'Uploaded test business photograph',
        imageFit: 'contain',
        imageCaption: 'Test credit',
        body: '<h2>Context</h2><p>A useful explanation.</p><script>alert(1)</script><img src="x" onerror="alert(2)">',
        tags: ['business'],
        sources: [['Example reference', 'https://example.com/research']],
        gallery: [],
        status: 'ready',
        demo: false,
        featured: false,
        feedPriority: 5,
      });
      await t.test('blocks CSRF and invalid fields', async () => {
        const saved = csrf;
        csrf = '';
        assert.equal((await request('/api/admin/posts', 'POST', payload())).status, 403);
        csrf = 'é'.repeat(64);
        assert.equal((await request('/api/admin/posts', 'POST', payload())).status, 403);
        csrf = saved;
        assert.equal(
          (await request('/api/admin/posts', 'POST', { ...payload(), category: '<script>' }))
            .status,
          400,
        );
        assert.equal(
          (await request('/api/admin/posts', 'POST', { ...payload(), image: '../../.env' })).status,
          400,
        );
        assert.equal(
          (
            await request('/api/admin/posts', 'POST', {
              ...payload(),
              sources: [['Unsafe', 'javascript:alert(1)']],
            })
          ).status,
          400,
        );
      });
      await t.test(
        'creates durable drafts, sanitizes body, and enforces unique slugs',
        async () => {
          const res = await request('/api/admin/posts', 'POST', payload());
          assert.equal(res.status, 201);
          created = await res.json();
          assert.equal(created.revision, 1);
          assert(!created.body.includes('<script'));
          assert(!created.body.includes('onerror'));
          assert(await db.collection('posts').findOne({ id: created.id }));
          assert(!(await (await request('/api/posts')).json()).some((a) => a.id === created.id));
          assert.equal((await request('/api/admin/posts', 'POST', payload())).status, 409);
          assert(
            (await (await request('/api/admin/posts')).json()).some((a) => a.id === created.id),
          );
        },
      );
      await t.test('publishes updates, rejects stale edits, and unpublishes', async () => {
        let res = await request('/api/admin/posts/' + created.id, 'PUT', {
          ...created,
          title: 'Updated image story',
          visibility: 'published',
          featured: true,
        });
        assert.equal(res.status, 200);
        const updated = await res.json();
        assert.equal(updated.revision, 2);
        assert.equal(
          await db.collection('posts').countDocuments({ featured: true, visibility: 'published' }),
          1,
        );
        assert.equal(
          (await db.collection('posts').findOne({ featured: true, visibility: 'published' })).id,
          created.id,
        );
        assert.equal(
          (await (await request('/api/posts')).json()).find((a) => a.id === created.id).title,
          'Updated image story',
        );
        assert.equal((await request('/api/admin/posts/' + created.id, 'PUT', created)).status, 409);
        res = await request('/api/admin/posts/' + created.id, 'PUT', {
          ...updated,
          visibility: 'draft',
        });
        assert.equal(res.status, 200);
        created = await res.json();
        assert(!(await (await request('/api/posts')).json()).some((a) => a.id === created.id));
      });
      await t.test('removes posts without deleting shared images', async () => {
        assert.equal(
          (await request('/api/admin/posts/' + created.id, 'DELETE', { revision: 1 })).status,
          409,
        );
        assert.equal(
          (
            await request('/api/admin/posts/' + created.id, 'DELETE', {
              revision: created.revision,
            })
          ).status,
          200,
        );
        assert.equal(await db.collection('posts').findOne({ id: created.id }), null);
        assert.equal((await request('/' + uploaded)).status, 200);
      });
      await t.test(
        'empty publication stays empty after restart/import and session logout revokes access',
        async () => {
          await db.collection('posts').deleteMany({});
          await importInitialPosts(db);
          assert.deepEqual(await (await request('/api/posts')).json(), []);
          assert.equal((await request('/api/admin/logout', 'POST', {})).status, 200);
          assert.equal((await request('/api/admin/posts')).status, 401);
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await client?.close();
      await mongo?.stop();
      await rm(uploadDir, { recursive: true, force: true });
    }
  },
);

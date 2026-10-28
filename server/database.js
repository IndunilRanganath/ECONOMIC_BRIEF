import { MongoClient } from 'mongodb';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
export async function connectDatabase(config) {
  const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(config.dbName);
    await Promise.all([
      db.collection('posts').createIndex({ id: 1 }, { unique: true }),
      db.collection('posts').createIndex({ slug: 1 }, { unique: true }),
      db.collection('admins').createIndex({ email: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    return { client, db };
  } catch (error) { await client.close(); throw error; }
}
export async function importInitialPosts(db) {
  // A migration marker prevents deleted posts from reappearing after restart.
  const marker = db.collection('migrations');
  if (await marker.findOne({ _id: 'json-import-v1' })) return;
  const posts = JSON.parse(await readFile(path.join(ROOT, 'data/articles.json'), 'utf8'));
  for (const post of posts) {
    await db.collection('posts').updateOne({ id: post.id }, { $setOnInsert: {
      ...post, visibility: 'published', revision: 1, createdAt: new Date(), modifiedAt: new Date(),
    } }, { upsert: true });
  }
  await marker.updateOne({ _id: 'json-import-v1' }, { $set: { completedAt: new Date() } }, { upsert: true });
}

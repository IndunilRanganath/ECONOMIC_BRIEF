import { randomUUID } from 'node:crypto';
import { csrfProtection } from '../auth.js';
import { validatePost, withoutMongoId, publicPost } from '../posts.js';
import { HttpError } from '../http-error.js';

export function registerPostRoutes(app, { db, media, requireAdmin }) {
  const mutation = [requireAdmin, csrfProtection];
  const postsCollection = db.collection('posts');

  async function checkImages(post) {
    for (const image of [post.image, ...post.gallery.map((image) => image.src)]) {
      if (!(await media.exists(image))) {
        throw new HttpError(400, 'An image is missing. Upload it before saving the post.');
      }
    }
  }

  async function updateFeaturedPost(post) {
    if (!post.featured || post.visibility !== 'published') return;

    await postsCollection.updateMany(
      { id: { $ne: post.id }, featured: true },
      { $set: { featured: false, modifiedAt: new Date() }, $inc: { revision: 1 } },
    );
  }

  app.get(['/api/posts', '/data/articles.json'], async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const posts = await postsCollection
      .find({ visibility: 'published' })
      .sort({ feedPriority: -1, createdAt: -1, id: 1 })
      .toArray();
    res.json(posts.map(publicPost));
  });
  app.get('/api/admin/posts', requireAdmin, async (req, res) => {
    const posts = await postsCollection.find({}).sort({ modifiedAt: -1 }).toArray();
    res.json(posts.map(withoutMongoId));
  });
  app.post('/api/admin/posts', ...mutation, async (req, res) => {
    const post = validatePost(req.body);
    await checkImages(post);
    const created = {
      ...post,
      id: randomUUID(),
      revision: 1,
      createdAt: new Date(),
      modifiedAt: new Date(),
    };
    await postsCollection.insertOne(created);
    await updateFeaturedPost(created);
    res.status(201).json(withoutMongoId(created));
  });
  app.put('/api/admin/posts/:id', ...mutation, async (req, res) => {
    if (!Number.isInteger(req.body?.revision))
      throw new HttpError(400, 'Reload the post before saving.');
    const post = validatePost(req.body);
    await checkImages(post);
    const result = await postsCollection.findOneAndUpdate(
      { id: req.params.id, revision: req.body.revision },
      { $set: { ...post, modifiedAt: new Date() }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    );
    if (!result) {
      const exists = await postsCollection.findOne({ id: req.params.id });
      throw new HttpError(
        exists ? 409 : 404,
        exists
          ? 'This post changed in another window. Reopen it before saving.'
          : 'Post not found.',
      );
    }
    await updateFeaturedPost(result);
    res.json(withoutMongoId(result));
  });
  app.delete('/api/admin/posts/:id', ...mutation, async (req, res) => {
    if (!Number.isInteger(req.body?.revision))
      throw new HttpError(400, 'Reload the post before deleting.');
    const result = await postsCollection.deleteOne({
      id: req.params.id,
      revision: req.body.revision,
    });
    if (!result.deletedCount)
      throw new HttpError(
        409,
        'This post changed or was removed. Refresh the list before deleting.',
      );
    // Image files are retained because other posts may reference them.
    res.json({ ok: true });
  });
}

import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { csrfProtection } from '../auth.js';
import { HttpError } from '../http-error.js';

export function registerMediaRoutes(app, { media, requireAdmin, maxUploadBytes }) {
  const mutation = [requireAdmin, csrfProtection];
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 1, fields: 0, parts: 1 },
  });
  app.post(
    '/api/admin/uploads',
    ...mutation,
    rateLimit({
      windowMs: 60000,
      limit: 30,
      message: { error: 'Please wait a minute before uploading more images.' },
    }),
    upload.single('image'),
    async (req, res) => {
      const bytes = req.file?.buffer;
      let extension;
      if (bytes?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        extension = 'png';
      else if (bytes?.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        extension = 'jpg';
      else if (
        bytes?.length > 12 &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP'
      )
        extension = 'webp';
      if (!extension)
        throw new HttpError(
          400,
          'Upload a JPEG, PNG, or WebP image. SVG uploads are not supported.',
        );
      const filename = `${randomUUID()}.${extension}`;
      await media.save(
        filename,
        bytes,
        { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension],
      );
      res.status(201).json({ src: `uploads/${filename}` });
    },
  );
  app.get('/api/admin/media', requireAdmin, async (req, res) => {
    res.json(await media.list());
  });
}

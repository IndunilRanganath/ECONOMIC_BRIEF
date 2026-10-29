import express from 'express';
import helmet from 'helmet';
import { createMediaStore } from './media.js';
import { authentication, sameOrigin } from './auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPostRoutes } from './routes/posts.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerWebsiteRoutes } from './routes/website.js';

export async function createApp({ db, config }) {
  const media = await createMediaStore(db, config);
  const maxUploadBytes = config.maxUploadBytes ?? 8 * 1024 * 1024;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'blob:', 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '300kb' }));
  app.use(
    '/api',
    (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
    sameOrigin(config),
  );
  const requireAdmin = authentication(db);
  app.get('/api/health', async (req, res) => {
    await db.command({ ping: 1 });
    res.json({ ok: true });
  });
  await registerAuthRoutes(app, { db, config, requireAdmin, maxUploadBytes });
  registerPostRoutes(app, { db, media, requireAdmin });
  registerMediaRoutes(app, { media, requireAdmin, maxUploadBytes });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  registerWebsiteRoutes(app, { media, config });
  app.use(errorHandler({ maxUploadBytes }));
  return app;
}

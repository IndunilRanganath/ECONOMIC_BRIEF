import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import {
  createSession,
  cookieOptions,
  cookieToken,
  tokenHash,
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  csrfProtection,
} from '../auth.js';
import { HttpError } from '../http-error.js';

export async function registerAuthRoutes(app, { db, config, requireAdmin, maxUploadBytes }) {
  const mutation = [requireAdmin, csrfProtection];
  // Verify unknown accounts against a real hash to avoid a fast email-existence check.
  const dummyPassword = await hashPassword(randomBytes(32).toString('hex'));
  app.post(
    '/api/admin/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
    }),
    async (req, res) => {
      const { email, password } = req.body || {};
      if (
        typeof email !== 'string' ||
        email.length > 254 ||
        typeof password !== 'string' ||
        password.length > 200
      )
        throw new HttpError(400, 'Enter your email and password.');
      const admin = await db.collection('admins').findOne({ email: email.trim().toLowerCase() });
      const valid = await verifyPassword(password, admin?.passwordHash || dummyPassword);
      if (!admin || !valid) throw new HttpError(401, 'Email or password is incorrect.');
      const previousToken = cookieToken(req);
      if (previousToken) {
        await db.collection('sessions').deleteOne({ _id: tokenHash(previousToken) });
      }
      const { token, session } = await createSession(db, admin._id);
      res.cookie(SESSION_COOKIE, token, cookieOptions(config.production));
      res.json({ email: admin.email, csrf: session.csrf, maxUploadBytes });
    },
  );
  app.get('/api/admin/session', requireAdmin, (req, res) =>
    res.json({ email: req.admin.email, csrf: req.session.csrf, maxUploadBytes }),
  );
  app.post('/api/admin/logout', ...mutation, async (req, res) => {
    await db.collection('sessions').deleteOne({ _id: req.session._id });
    const { maxAge, ...options } = cookieOptions(config.production);
    res.clearCookie(SESSION_COOKIE, options);
    res.json({ ok: true });
  });
}
